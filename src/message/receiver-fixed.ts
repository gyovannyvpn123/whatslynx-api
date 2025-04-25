import { WhatsLynxEvents } from '../types/events';
import { Message, MessageType, MessageStatus } from '../types/message';

/**
 * Message receiver implementation
 * Handles incoming messages from WhatsApp servers
 */
export class MessageReceiver {
  private client: any; // WhatsLynxClient
  private receivedMessages: Set<string> = new Set();

  /**
   * Create a new message receiver
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    this.setupListeners();
  }

  /**
   * Set up event listeners
   * @private
   */
  private setupListeners(): void {
    // Listen for raw message events from socket
    this.client.socket.on('raw-message', (data: any) => {
      this.processRawMessage(data).catch(error => {
        this.client.logger('error', 'Error processing raw message', error);
      });
    });

    // Listen for media updates from media manager
    this.client.on(WhatsLynxEvents.MEDIA_DOWNLOADED, (data: any) => {
      this.updateMessageMedia(data).catch(error => {
        this.client.logger('error', 'Error updating message media', error);
      });
    });
  }

  /**
   * Process a raw message from the server
   * @param data Raw message data
   * @private
   */
  private async processRawMessage(data: any): Promise<void> {
    try {
      // Extract message data
      const { attributes, content } = data;

      if (!attributes || !content) {
        return; // Invalid message
      }

      // Parse the message
      const message = this.parseMessage(attributes, content);

      if (!message) {
        return; // Failed to parse message
      }

      // Check if we've already processed this message (prevent duplicates)
      if (this.receivedMessages.has(message.id)) {
        return;
      }
      this.receivedMessages.add(message.id);

      // Store only the last 1000 message IDs to prevent memory leak
      if (this.receivedMessages.size > 1000) {
        const oldestId = this.receivedMessages.values().next().value;
        if (oldestId) {
          this.receivedMessages.delete(oldestId);
        }
      }

      // Process the message based on type
      switch (message.type) {
        case MessageType.TEXT:
        case MessageType.IMAGE:
        case MessageType.VIDEO:
        case MessageType.AUDIO:
        case MessageType.DOCUMENT:
        case MessageType.STICKER:
        case MessageType.LOCATION:
        case MessageType.CONTACT:
        case MessageType.CONTACT_CARD:
        case MessageType.CONTACT_CARD_MULTI:
        case MessageType.TEMPLATE:
        case MessageType.BUTTON:
        case MessageType.LIST:
          // Emit the regular message event
          this.client.emit(WhatsLynxEvents.MESSAGE_RECEIVED, message);
          
          // Schedule auto-download for media
          this.checkAutoDownload(message);
          break;

        case MessageType.REACTION:
          // Emit reaction event
          this.client.emit('reaction.received', message);
          break;

        case MessageType.POLL:
          // Emit poll event
          this.client.emit('poll.received', message);
          break;

        case MessageType.GROUP_INVITE:
          // Emit group invite event
          this.client.emit('group.invite.received', message);
          break;

        default:
          // Unknown or unsupported message type
          this.client.emit('message.unknown.received', message);
          break;
      }

    } catch (error: any) {
      this.client.logger('error', 'Error processing message', error?.message || 'Unknown error');
    }
  }

  /**
   * Parse a raw WebSocket message into our Message format
   * @param attributes Message attributes
   * @param content Message content
   * @returns Parsed message or null if invalid
   * @private
   */
  private parseMessage(attributes: any, content: any): Message | null {
    try {
      if (!attributes.from || !content) {
        return null;
      }

      // Base message information
      const messageId = attributes.id || '';
      const chatId = attributes.from || '';
      const fromMe = attributes.fromMe === 'true' || attributes.fromMe === true;
      const timestamp = parseInt(attributes.t || attributes.timestamp || Date.now().toString(), 10);
      const pushName = attributes.notify || attributes.pushName || '';
      const participant = attributes.participant || '';
      const sender = participant || attributes.from || '';

      // Create base message object
      const baseMessage: Message = {
        id: messageId,
        chatId,
        sender,
        senderName: pushName,
        timestamp,
        fromMe,
        type: MessageType.TEXT, // Default
        content: {}
      };

      // Handle different message types
      const rawMessage = content.message || content;

      if (!rawMessage) {
        return null;
      }

      // Process message based on type
      if (rawMessage.conversation) {
        // Basic text message
        return {
          ...baseMessage,
          type: MessageType.TEXT,
          content: {
            text: rawMessage.conversation
          }
        };
      } else if (rawMessage.extendedTextMessage) {
        // Extended text message (with formatting, links, etc.)
        const extendedMessage = rawMessage.extendedTextMessage;
        
        return {
          ...baseMessage,
          type: MessageType.TEXT,
          content: {
            text: extendedMessage.text || '',
            contextInfo: extendedMessage.contextInfo || {}
          }
        };
      } else if (rawMessage.imageMessage) {
        // Image message
        const imgMsg = rawMessage.imageMessage;
        
        return {
          ...baseMessage,
          type: MessageType.IMAGE,
          content: {
            caption: imgMsg.caption || '',
            mimetype: imgMsg.mimetype || 'image/jpeg',
            url: imgMsg.url || '',
            mediaKey: imgMsg.mediaKey || '',
            fileSize: imgMsg.fileSize || 0,
            width: imgMsg.width || 0,
            height: imgMsg.height || 0,
            jpegThumbnail: imgMsg.jpegThumbnail || null
          }
        };
      } else if (rawMessage.videoMessage) {
        // Video message
        const vidMsg = rawMessage.videoMessage;
        
        return {
          ...baseMessage,
          type: MessageType.VIDEO,
          content: {
            caption: vidMsg.caption || '',
            mimetype: vidMsg.mimetype || 'video/mp4',
            url: vidMsg.url || '',
            mediaKey: vidMsg.mediaKey || '',
            fileSize: vidMsg.fileSize || 0,
            seconds: vidMsg.seconds || 0,
            width: vidMsg.width || 0,
            height: vidMsg.height || 0,
            jpegThumbnail: vidMsg.jpegThumbnail || null
          }
        };
      } else if (rawMessage.audioMessage) {
        // Audio message
        const audioMsg = rawMessage.audioMessage;
        
        return {
          ...baseMessage,
          type: MessageType.AUDIO,
          content: {
            mimetype: audioMsg.mimetype || 'audio/ogg; codecs=opus',
            url: audioMsg.url || '',
            mediaKey: audioMsg.mediaKey || '',
            fileSize: audioMsg.fileSize || 0,
            seconds: audioMsg.seconds || 0,
            ptt: audioMsg.ptt || false
          }
        };
      } else if (rawMessage.documentMessage) {
        // Document message
        const docMsg = rawMessage.documentMessage;
        
        return {
          ...baseMessage,
          type: MessageType.DOCUMENT,
          content: {
            caption: docMsg.caption || '',
            mimetype: docMsg.mimetype || 'application/octet-stream',
            url: docMsg.url || '',
            mediaKey: docMsg.mediaKey || '',
            fileSize: docMsg.fileSize || 0,
            fileName: docMsg.fileName || 'file',
            pageCount: docMsg.pageCount || 0,
            jpegThumbnail: docMsg.jpegThumbnail || null
          }
        };
      } else if (rawMessage.stickerMessage) {
        // Sticker message
        const stickerMsg = rawMessage.stickerMessage;
        
        return {
          ...baseMessage,
          type: MessageType.STICKER,
          content: {
            mimetype: stickerMsg.mimetype || 'image/webp',
            url: stickerMsg.url || '',
            mediaKey: stickerMsg.mediaKey || '',
            fileSize: stickerMsg.fileSize || 0,
            width: stickerMsg.width || 0,
            height: stickerMsg.height || 0,
            isAnimated: stickerMsg.isAnimated || false
          }
        };
      } else if (rawMessage.locationMessage) {
        // Location message
        const locMsg = rawMessage.locationMessage;
        
        return {
          ...baseMessage,
          type: MessageType.LOCATION,
          content: {
            degreesLatitude: locMsg.degreesLatitude || 0,
            degreesLongitude: locMsg.degreesLongitude || 0,
            name: locMsg.name || '',
            address: locMsg.address || '',
            url: locMsg.url || '',
            jpegThumbnail: locMsg.jpegThumbnail || null
          }
        };
      } else if (rawMessage.liveLocationMessage) {
        // Live location message
        const liveLocMsg = rawMessage.liveLocationMessage;
        
        return {
          ...baseMessage,
          type: MessageType.LIVE_LOCATION,
          content: {
            degreesLatitude: liveLocMsg.degreesLatitude || 0,
            degreesLongitude: liveLocMsg.degreesLongitude || 0,
            accuracyInMeters: liveLocMsg.accuracyInMeters || 0,
            speedInMps: liveLocMsg.speedInMps || 0,
            degreesClockwiseFromMagneticNorth: liveLocMsg.degreesClockwiseFromMagneticNorth || 0,
            name: liveLocMsg.name || '',
            address: liveLocMsg.address || '',
            url: liveLocMsg.url || '',
            jpegThumbnail: liveLocMsg.jpegThumbnail || null,
            timestampSeconds: liveLocMsg.timestampSeconds || 0,
            sequenceNumber: liveLocMsg.sequenceNumber || 0,
            timeOffset: liveLocMsg.timeOffset || 0
          }
        };
      } else if (rawMessage.contactMessage) {
        // Contact message
        const contactMsg = rawMessage.contactMessage;
        
        return {
          ...baseMessage,
          type: MessageType.CONTACT,
          content: {
            displayName: contactMsg.displayName || '',
            vcard: contactMsg.vcard || ''
          }
        };
      } else if (rawMessage.contactsArrayMessage) {
        // Contact card message (multiple)
        const contactsMsg = rawMessage.contactsArrayMessage;
        
        return {
          ...baseMessage,
          type: MessageType.CONTACT_CARD_MULTI,
          content: {
            contacts: contactsMsg.contacts.map((contact: any) => ({
              displayName: contact.displayName || '',
              vcard: contact.vcard || ''
            }))
          }
        };
      } else if (rawMessage.buttonsMessage) {
        // Buttons message
        const buttonsMsg = rawMessage.buttonsMessage;
        
        return {
          ...baseMessage,
          type: MessageType.BUTTON,
          content: {
            title: buttonsMsg.title || '',
            contentText: buttonsMsg.contentText || '',
            headerType: buttonsMsg.headerType || 1,
            footerText: buttonsMsg.footerText || '',
            buttons: buttonsMsg.buttons || []
          }
        };
      } else if (rawMessage.listMessage) {
        // List message
        const listMsg = rawMessage.listMessage;
        
        return {
          ...baseMessage,
          type: MessageType.LIST,
          content: {
            title: listMsg.title || '',
            description: listMsg.description || '',
            buttonText: listMsg.buttonText || '',
            listType: listMsg.listType || 0,
            sections: listMsg.sections || []
          }
        };
      } else if (rawMessage.templateMessage) {
        // Template message
        const templateMsg = rawMessage.templateMessage;
        
        return {
          ...baseMessage,
          type: MessageType.TEMPLATE,
          content: {
            namespace: templateMsg.namespace || '',
            templateId: templateMsg.name || '',
            parameters: templateMsg.parameters || []
          }
        };
      } else if (rawMessage.reactionMessage) {
        // Reaction message
        const reactionMsg = rawMessage.reactionMessage;
        
        return {
          ...baseMessage,
          type: MessageType.REACTION,
          content: {
            targetMessageId: reactionMsg.key.id || '',
            targetChatId: reactionMsg.key.remoteJid || '',
            targetFromMe: reactionMsg.key.fromMe || false,
            emoji: reactionMsg.text || '',
            senderTimestampMs: reactionMsg.senderTimestampMs || 0
          }
        };
      } else if (rawMessage.pollCreationMessage) {
        // Poll message
        const pollMsg = rawMessage.pollCreationMessage;
        
        return {
          ...baseMessage,
          type: MessageType.POLL,
          content: {
            name: pollMsg.name || '',
            options: (pollMsg.options || []).map((opt: any) => opt.optionName || ''),
            selectableOptionsCount: pollMsg.selectableOptionsCount || 1,
            pollInvalidated: false
          }
        };
      } else if (rawMessage.pollUpdateMessage) {
        // Poll update
        const pollUpdateMsg = rawMessage.pollUpdateMessage;
        
        return {
          ...baseMessage,
          type: MessageType.POLL,
          content: {
            targetMessageId: pollUpdateMsg.pollCreationMessageKey.id || '',
            targetChatId: pollUpdateMsg.pollCreationMessageKey.remoteJid || '',
            votes: pollUpdateMsg.vote || [],
            pollInvalidated: pollUpdateMsg.pollInvalidated || false
          }
        };
      }
      
      // Unknown message type
      return {
        ...baseMessage,
        type: MessageType.UNKNOWN,
        content: {
          body: 'Message type not supported yet'
        }
      };
    } catch (error: any) {
      this.client.getOptions().logger('error', 'Error parsing message', error?.message || 'Unknown error');
      return null;
    }
  }

  /**
   * Check if we should automatically download media
   * @param message Message with media
   * @private
   */
  private checkAutoDownload(message: Message): void {
    try {
      // Check if the message has downloadable media
      const isMedia = message.type === MessageType.IMAGE || 
                     message.type === MessageType.VIDEO || 
                     message.type === MessageType.AUDIO || 
                     message.type === MessageType.DOCUMENT ||
                     message.type === MessageType.STICKER;
      
      if (!isMedia) {
        return;
      }
      
      // Check if auto-download is enabled for this type
      const options = this.client.getOptions();
      const autoDownload = options.autoDownloadMedia || false;
      
      // Get media content
      const content = message.content as any;
      
      // Check if media is small enough for auto-download
      const isSmallMedia = 
           typeof content.url === 'string' && 
           typeof content.fileSize === 'number' && 
           content.fileSize < 1024 * 1024; // Auto-download less than 1MB
      
      if (autoDownload && isSmallMedia) {
        // Download the media automatically
        this.client.media.download(message).catch((error: Error) => {
          this.client.logger('warn', `Failed to auto-download media: ${error.message}`);
        });
      }
    } catch (error: any) {
      this.client.logger('error', 'Error checking auto-download', error?.message || 'Unknown error');
    }
  }

  /**
   * Update a message with downloaded media
   * @param data Media data
   * @private
   */
  private async updateMessageMedia(data: any): Promise<void> {
    try {
      // Find the message and update it with the downloaded media data
      const { messageId, buffer, mimeType, fileName } = data;
      
      // Emit media downloaded event with the updated message
      this.client.emit(WhatsLynxEvents.MEDIA_UPDATED, {
        messageId,
        buffer,
        mimeType,
        fileName
      });
    } catch (error: any) {
      this.client.logger('error', 'Error updating message media', error?.message || 'Unknown error');
    }
  }
}