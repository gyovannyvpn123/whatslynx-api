import { Message, MessageType, MediaMessage } from '../types';
import { WhatsLynxEvents } from '../types/events';
import { getErrorMessage } from '../utils/error-handler';

/**
 * Message receiver implementation
 * Handles incoming messages from WhatsApp servers
 */
export class MessageReceiver {
  private client: any; // WhatsLynxClient
  private receivedMessages: Set<string> = new Set();
  private messageCache: Map<string, Message> = new Map();

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
    // Listen for raw messages from the socket
    this.client.connection.socket.on('raw-message', (data: any) => {
      this.processRawMessage(data).catch((error: unknown) => {
        this.client.logger('error', 'Failed to process raw message', getErrorMessage(error));
      });
    });

    // Listen for media downloaded events
    this.client.on('media.downloaded', (data: any) => {
      this.updateMessageMedia(data).catch((error: unknown) => {
        this.client.logger('error', 'Failed to update message media', getErrorMessage(error));
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
      // Extract message attributes and content
      const { attributes, content } = data;
      
      // Parse the message into our format
      const message = this.parseMessage(attributes, content);
      
      // Skip if parsing failed or if we've already processed this message
      if (!message || this.receivedMessages.has(message.id)) {
        return;
      }
      
      // Add to received set to prevent duplicates
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
      
    } catch (error: unknown) {
      this.client.logger('error', 'Error processing message', getErrorMessage(error));
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
        
        const imageMessage: Message = {
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
        
        return imageMessage;
      } else if (rawMessage.videoMessage) {
        // Video message
        const vidMsg = rawMessage.videoMessage;
        
        const videoMessage: Message = {
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
        
        return videoMessage;
      } else if (rawMessage.audioMessage) {
        // Audio message
        const audioMsg = rawMessage.audioMessage;
        
        const audioMessage: Message = {
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
        
        return audioMessage;
      } else if (rawMessage.documentMessage) {
        // Document message
        const docMsg = rawMessage.documentMessage;
        
        const documentMessage: Message = {
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
        
        return documentMessage;
      } else if (rawMessage.stickerMessage) {
        // Sticker message
        const stickerMsg = rawMessage.stickerMessage;
        
        const stickerMessage: Message = {
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
        
        return stickerMessage;
      } else if (rawMessage.locationMessage) {
        // Location message
        const locMsg = rawMessage.locationMessage;
        
        const locationMessage: Message = {
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
        
        return locationMessage;
      } else if (rawMessage.liveLocationMessage) {
        // Live location message
        const liveLocMsg = rawMessage.liveLocationMessage;
        
        const liveLocationMessage: Message = {
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
        
        return liveLocationMessage;
      } else if (rawMessage.contactMessage) {
        // Contact message
        const contactMsg = rawMessage.contactMessage;
        
        const contactMessage: Message = {
          ...baseMessage,
          type: MessageType.CONTACT,
          content: {
            displayName: contactMsg.displayName || '',
            vcard: contactMsg.vcard || ''
          }
        };
        
        return contactMessage;
      } else if (rawMessage.contactsArrayMessage) {
        // Contact card message (multiple)
        const contactsMsg = rawMessage.contactsArrayMessage;
        
        const contactsMessage: Message = {
          ...baseMessage,
          type: MessageType.CONTACT_CARD_MULTI,
          content: {
            contacts: contactsMsg.contacts.map((contact: any) => ({
              displayName: contact.displayName || '',
              vcard: contact.vcard || ''
            }))
          }
        };
        
        return contactsMessage;
      } else if (rawMessage.buttonsMessage) {
        // Buttons message
        const buttonsMsg = rawMessage.buttonsMessage;
        
        const buttonsMessage: Message = {
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
        
        return buttonsMessage;
      } else if (rawMessage.listMessage) {
        // List message
        const listMsg = rawMessage.listMessage;
        
        const listMessage: Message = {
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
        
        return listMessage;
      } else if (rawMessage.templateMessage) {
        // Template message
        const templateMsg = rawMessage.templateMessage;
        
        const templateMessage: Message = {
          ...baseMessage,
          type: MessageType.TEMPLATE,
          content: {
            namespace: templateMsg.namespace || '',
            templateId: templateMsg.name || '',
            parameters: templateMsg.parameters || []
          }
        };
        
        return templateMessage;
      } else if (rawMessage.reactionMessage) {
        // Reaction message
        const reactionMsg = rawMessage.reactionMessage;
        
        const reactionMessage: Message = {
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
        
        return reactionMessage;
      } else if (rawMessage.pollCreationMessage) {
        // Poll message
        const pollMsg = rawMessage.pollCreationMessage;
        
        const pollMessage: Message = {
          ...baseMessage,
          type: MessageType.POLL,
          content: {
            name: pollMsg.name || '',
            options: (pollMsg.options || []).map((opt: any) => opt.optionName || ''),
            selectableOptionsCount: pollMsg.selectableOptionsCount || 1,
            pollInvalidated: false
          }
        };
        
        return pollMessage;
      } else if (rawMessage.pollUpdateMessage) {
        // Poll update
        const pollUpdateMsg = rawMessage.pollUpdateMessage;
        
        const pollUpdateMessage: Message = {
          ...baseMessage,
          type: MessageType.POLL,
          content: {
            targetMessageId: pollUpdateMsg.pollCreationMessageKey.id || '',
            targetChatId: pollUpdateMsg.pollCreationMessageKey.remoteJid || '',
            votes: pollUpdateMsg.vote || [],
            pollInvalidated: pollUpdateMsg.pollInvalidated || false
          }
        };
        
        return pollUpdateMessage;
      }
      
      // Unknown message type
      const unknownMessage: Message = {
        ...baseMessage,
        type: MessageType.UNKNOWN,
        content: {
          text: 'Message type not supported yet'
        }
      };
      
      return unknownMessage;
    } catch (error: unknown) {
      this.client.logger('error', 'Error parsing message', getErrorMessage(error));
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
      const mediaMessage = message as Message & { content: { url?: string, fileSize?: number } };
      
      // Check if media is small enough for auto-download
      const isSmallMedia = 
           typeof mediaMessage.content.url === 'string' && 
           typeof mediaMessage.content.fileSize === 'number' && 
           mediaMessage.content.fileSize < 1024 * 1024; // Auto-download less than 1MB
      
      if (autoDownload && isSmallMedia) {
        // Download the media automatically
        this.client.media.download(message).catch((error: unknown) => {
          this.client.logger('warn', `Failed to auto-download media: ${getErrorMessage(error)}`);
        });
      }
    } catch (error: unknown) {
      this.client.logger('error', 'Error checking auto-download', getErrorMessage(error));
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
      this.client.emit('media.updated', {
        messageId,
        buffer,
        mimeType,
        fileName
      });
    } catch (error: unknown) {
      this.client.logger('error', 'Error updating message media', getErrorMessage(error));
    }
  }

  /**
   * Get all messages in a chat
   * @param chatId Chat ID to get messages from
   * @param options Query options
   * @returns Promise with messages
   */
  async getMessages(chatId: string, options: any = {}): Promise<Message[]> {
    try {
      // In a real implementation, we would query the WhatsApp servers
      // or a local database for message history. For now, we'll return 
      // messages from our cache
      const messages: Message[] = [];
      
      // Filter messages by chat ID
      for (const [_, message] of this.messageCache) {
        if (message.chatId === chatId) {
          messages.push(message);
        }
      }
      
      // Apply options like limit, before/after, etc.
      const limit = options.limit || 50;
      
      // Sort by timestamp (newest first by default)
      const sorted = messages.sort((a, b) => {
        return options.oldestFirst ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      });
      
      return sorted.slice(0, limit);
    } catch (error: unknown) {
      this.client.logger('error', 'Error getting messages', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Get a message by ID
   * @param messageId Message ID to get
   * @returns Promise with message or null
   */
  async getMessageById(messageId: string): Promise<Message | null> {
    try {
      // Check if the message is in our cache
      if (this.messageCache.has(messageId)) {
        return this.messageCache.get(messageId) || null;
      }
      
      // In a real implementation, we could query WhatsApp servers
      // or a local database for the message
      
      return null;
    } catch (error: unknown) {
      this.client.logger('error', `Error getting message ${messageId}`, getErrorMessage(error));
      return null;
    }
  }

  /**
   * Download media from a message
   * @param messageId Message ID containing media
   * @returns Promise with media data
   */
  async downloadMedia(messageId: string): Promise<Buffer> {
    try {
      // Get the message
      const message = await this.getMessageById(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      
      // Check if it's a media message
      const mediaTypes = [
        MessageType.IMAGE,
        MessageType.VIDEO,
        MessageType.AUDIO,
        MessageType.DOCUMENT,
        MessageType.STICKER
      ];
      
      if (!mediaTypes.includes(message.type)) {
        throw new Error(`Message ${messageId} does not contain downloadable media`);
      }
      
      // Check if we have content with URL
      const mediaMessage = message as Message & { content: { url?: string } };
      if (!mediaMessage.content || !mediaMessage.content.url) {
        throw new Error(`Media URL not found for message ${messageId}`);
      }
      
      // Use the client's media manager to download the media
      return await this.client.media.download(message);
    } catch (error: unknown) {
      this.client.logger('error', `Failed to download media for message ${messageId}`, getErrorMessage(error));
      throw error;
    }
  }
}