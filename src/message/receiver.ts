import { Message, MessageType, MessageStatus } from '../types';
import { WhatsLynxEvents } from '../types/events';

/**
 * Message receiving implementation
 * Handles receiving and processing incoming messages
 */
export class MessageReceiver {
  private client: any; // WhatsLynxClient
  private messageCache: Map<string, Message> = new Map();
  private chatMessagesCache: Map<string, Set<string>> = new Map();

  /**
   * Create a new message receiver
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    this.initializeListeners();
  }

  /**
   * Get messages from a specific chat
   * @param chatId Chat ID to get messages from
   * @param options Query options (limit, before, after)
   * @returns Promise with array of messages
   */
  async getMessages(chatId: string, options: { limit?: number, before?: number, after?: number } = {}): Promise<Message[]> {
    try {
      // Get the message IDs for this chat
      const messageIds = this.chatMessagesCache.get(chatId) || new Set<string>();
      
      // If no messages or empty chat, fetch from server
      if (messageIds.size === 0) {
        await this.fetchMessagesFromServer(chatId, options);
        return this.getMessages(chatId, options);
      }
      
      // Convert to array of messages from the cache
      const messages: Message[] = Array.from(messageIds)
        .map(id => this.messageCache.get(id))
        .filter(msg => !!msg) as Message[];
      
      // Apply filters
      let filteredMessages = messages;
      
      if (options.before) {
        filteredMessages = filteredMessages.filter(msg => msg.timestamp < options.before!);
      }
      
      if (options.after) {
        filteredMessages = filteredMessages.filter(msg => msg.timestamp > options.after!);
      }
      
      // Sort by timestamp, newest first
      filteredMessages.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply limit
      if (options.limit && options.limit > 0) {
        filteredMessages = filteredMessages.slice(0, options.limit);
      }
      
      return filteredMessages;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get messages', error);
      throw error;
    }
  }

  /**
   * Get a specific message by ID
   * @param messageId Message ID to retrieve
   * @returns Promise with message or null if not found
   */
  async getMessageById(messageId: string): Promise<Message | null> {
    // Check cache first
    if (this.messageCache.has(messageId)) {
      return this.messageCache.get(messageId) || null;
    }
    
    try {
      // If not in cache, try to fetch from server
      const message = await this.fetchMessageFromServer(messageId);
      
      if (message) {
        // Add to caches
        this.messageCache.set(messageId, message);
        
        const chatMessages = this.chatMessagesCache.get(message.chatId) || new Set<string>();
        chatMessages.add(messageId);
        this.chatMessagesCache.set(message.chatId, chatMessages);
      }
      
      return message;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get message ${messageId}`, error);
      return null;
    }
  }

  /**
   * Download media from a message
   * @param messageId Message ID containing media
   * @returns Promise with media data as buffer
   */
  async downloadMedia(messageId: string): Promise<Buffer> {
    // Get the message
    const message = await this.getMessageById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    // Check if message contains media
    const mediaTypes = [
      MessageType.IMAGE, 
      MessageType.VIDEO, 
      MessageType.AUDIO, 
      MessageType.DOCUMENT, 
      MessageType.STICKER
    ];
    
    if (!mediaTypes.includes(message.type as MessageType)) {
      throw new Error(`Message ${messageId} does not contain downloadable media`);
    }
    
    // Check if we have a URL to download from
    if (!message['url']) {
      throw new Error(`Media URL not found for message ${messageId}`);
    }
    
    try {
      // Use MediaManager to download
      return await this.client.media.download(message);
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to download media for message ${messageId}`, error);
      throw error;
    }
  }

  /**
   * Process an incoming message
   * @param message Raw message data from server
   * @private
   */
  private processIncomingMessage(message: any): void {
    try {
      // Parse the message into our standard format
      const parsedMessage = this.parseMessage(message);
      
      if (!parsedMessage) {
        return;
      }
      
      // Store in caches
      this.messageCache.set(parsedMessage.id, parsedMessage);
      
      const chatMessages = this.chatMessagesCache.get(parsedMessage.chatId) || new Set<string>();
      chatMessages.add(parsedMessage.id);
      this.chatMessagesCache.set(parsedMessage.chatId, chatMessages);
      
      // Emit message received event
      this.client.emit(WhatsLynxEvents.MESSAGE_RECEIVED, parsedMessage);
      
      // Auto-download media if enabled in options
      if (this.shouldAutoDownloadMedia(parsedMessage)) {
        this.downloadMedia(parsedMessage.id).catch(err => {
          this.client.getOptions().logger('error', `Failed to auto-download media for message ${parsedMessage.id}`, err);
        });
      }
    } catch (error) {
      this.client.getOptions().logger('error', 'Error processing incoming message', error);
    }
  }

  /**
   * Parse a raw message into our standard format
   * @param rawMessage Raw message data from server
   * @returns Parsed message or null if invalid
   * @private
   */
  private parseMessage(rawMessage: any): Message | null {
    try {
      if (!rawMessage || !rawMessage.key || !rawMessage.key.id) {
        return null;
      }
      
      const messageId = rawMessage.key.id;
      const chatId = rawMessage.key.remoteJid;
      const fromMe = rawMessage.key.fromMe === true;
      const sender = fromMe 
        ? this.client.getSessionData()?.authCredentials?.me?.id 
        : rawMessage.key.participant || chatId;
      
      const timestamp = rawMessage.messageTimestamp 
        ? rawMessage.messageTimestamp * 1000 
        : Date.now();
      
      const baseMessage: Message = {
        id: messageId,
        chatId,
        sender,
        timestamp,
        fromMe,
        type: MessageType.UNKNOWN,
        status: fromMe ? MessageStatus.DELIVERY_ACK : undefined,
        content: {} // Initialize with empty content object
      };
      
      // Determine message type and extract content
      if (rawMessage.message) {
        if (rawMessage.message.conversation) {
          // Text message
          return {
            ...baseMessage,
            type: MessageType.TEXT,
            body: rawMessage.message.conversation
          };
        } else if (rawMessage.message.imageMessage) {
          // Image message
          return {
            ...baseMessage,
            type: MessageType.IMAGE,
            caption: rawMessage.message.imageMessage.caption,
            url: rawMessage.message.imageMessage.url,
            mimetype: rawMessage.message.imageMessage.mimetype,
            fileSize: rawMessage.message.imageMessage.fileLength,
            width: rawMessage.message.imageMessage.width,
            height: rawMessage.message.imageMessage.height,
            mediaKey: rawMessage.message.imageMessage.mediaKey
          };
        } else if (rawMessage.message.videoMessage) {
          // Video message
          return {
            ...baseMessage,
            type: MessageType.VIDEO,
            caption: rawMessage.message.videoMessage.caption,
            url: rawMessage.message.videoMessage.url,
            mimetype: rawMessage.message.videoMessage.mimetype,
            fileSize: rawMessage.message.videoMessage.fileLength,
            seconds: rawMessage.message.videoMessage.seconds,
            width: rawMessage.message.videoMessage.width,
            height: rawMessage.message.videoMessage.height,
            mediaKey: rawMessage.message.videoMessage.mediaKey
          };
        } else if (rawMessage.message.audioMessage) {
          // Audio message
          return {
            ...baseMessage,
            type: MessageType.AUDIO,
            url: rawMessage.message.audioMessage.url,
            mimetype: rawMessage.message.audioMessage.mimetype,
            fileSize: rawMessage.message.audioMessage.fileLength,
            seconds: rawMessage.message.audioMessage.seconds,
            ptt: rawMessage.message.audioMessage.ptt === true,
            mediaKey: rawMessage.message.audioMessage.mediaKey
          };
        } else if (rawMessage.message.documentMessage) {
          // Document message
          return {
            ...baseMessage,
            type: MessageType.DOCUMENT,
            caption: rawMessage.message.documentMessage.caption,
            url: rawMessage.message.documentMessage.url,
            mimetype: rawMessage.message.documentMessage.mimetype,
            fileSize: rawMessage.message.documentMessage.fileLength,
            fileName: rawMessage.message.documentMessage.fileName,
            mediaKey: rawMessage.message.documentMessage.mediaKey
          };
        } else if (rawMessage.message.stickerMessage) {
          // Sticker message
          return {
            ...baseMessage,
            type: MessageType.STICKER,
            url: rawMessage.message.stickerMessage.url,
            mimetype: rawMessage.message.stickerMessage.mimetype,
            fileSize: rawMessage.message.stickerMessage.fileLength,
            width: rawMessage.message.stickerMessage.width,
            height: rawMessage.message.stickerMessage.height,
            mediaKey: rawMessage.message.stickerMessage.mediaKey,
            isAnimated: rawMessage.message.stickerMessage.isAnimated === true
          };
        } else if (rawMessage.message.locationMessage) {
          // Location message
          return {
            ...baseMessage,
            type: MessageType.LOCATION,
            latitude: rawMessage.message.locationMessage.degreesLatitude,
            longitude: rawMessage.message.locationMessage.degreesLongitude,
            name: rawMessage.message.locationMessage.name,
            address: rawMessage.message.locationMessage.address
          };
        } else if (rawMessage.message.liveLocationMessage) {
          // Live location message
          return {
            ...baseMessage,
            type: MessageType.LIVE_LOCATION,
            latitude: rawMessage.message.liveLocationMessage.degreesLatitude,
            longitude: rawMessage.message.liveLocationMessage.degreesLongitude,
            name: rawMessage.message.liveLocationMessage.name,
            address: rawMessage.message.liveLocationMessage.address,
            accuracyInMeters: rawMessage.message.liveLocationMessage.accuracyInMeters,
            speedInMps: rawMessage.message.liveLocationMessage.speedInMps,
            degreesClockwise: rawMessage.message.liveLocationMessage.degreesClockwise,
            comment: rawMessage.message.liveLocationMessage.caption,
            sequenceNumber: rawMessage.message.liveLocationMessage.sequenceNumber
          };
        } else if (rawMessage.message.contactMessage) {
          // Contact message
          return {
            ...baseMessage,
            type: MessageType.CONTACT_CARD,
            displayName: rawMessage.message.contactMessage.displayName,
            vcard: rawMessage.message.contactMessage.vcard
          };
        } else if (rawMessage.message.contactsArrayMessage) {
          // Multiple contacts message
          return {
            ...baseMessage,
            type: MessageType.CONTACT_CARD_MULTI,
            contacts: rawMessage.message.contactsArrayMessage.contacts.map((contact: any) => ({
              displayName: contact.displayName,
              vcard: contact.vcard
            }))
          };
        } else if (rawMessage.message.buttonsMessage) {
          // Buttons message
          return {
            ...baseMessage,
            type: MessageType.BUTTONS,
            title: rawMessage.message.buttonsMessage.title,
            description: rawMessage.message.buttonsMessage.contentText,
            footerText: rawMessage.message.buttonsMessage.footerText,
            buttons: rawMessage.message.buttonsMessage.buttons.map((button: any) => ({
              id: button.buttonId,
              text: button.buttonText.displayText
            }))
          };
        } else if (rawMessage.message.listMessage) {
          // List message
          return {
            ...baseMessage,
            type: MessageType.LIST,
            title: rawMessage.message.listMessage.title,
            description: rawMessage.message.listMessage.description,
            buttonText: rawMessage.message.listMessage.buttonText,
            footerText: rawMessage.message.listMessage.footerText,
            sections: rawMessage.message.listMessage.sections.map((section: any) => ({
              title: section.title,
              rows: section.rows.map((row: any) => ({
                id: row.rowId,
                title: row.title,
                description: row.description
              }))
            }))
          };
        } else if (rawMessage.message.templateMessage) {
          // Template message
          return {
            ...baseMessage,
            type: MessageType.TEMPLATE,
            namespace: rawMessage.message.templateMessage.namespace || '',
            templateId: rawMessage.message.templateMessage.name || '',
            parameters: rawMessage.message.templateMessage.parameters || []
          };
        }
      }
      
      // Unknown message type
      return {
        ...baseMessage,
        type: MessageType.UNKNOWN,
        body: 'Message type not supported yet'
      };
    } catch (error) {
      this.client.getOptions().logger('error', 'Error parsing message', error);
      return null;
    }
  }

  /**
   * Fetch messages from server
   * @param chatId Chat ID to fetch messages for
   * @param options Query options
   * @returns Promise
   * @private
   */
  private async fetchMessagesFromServer(chatId: string, options: any = {}): Promise<void> {
    try {
      // Prepare request parameters
      const params: any = {
        count: options.limit || 50
      };
      
      if (options.before) {
        params.before = Math.floor(options.before / 1000);
      }
      
      // Send request to fetch messages
      const tag = `fetch_messages_${Date.now()}`;
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'message',
        chatId,
        params
      }, tag);
      
      if (response && response.messages && Array.isArray(response.messages)) {
        // Process each message
        for (const message of response.messages) {
          this.processIncomingMessage(message);
        }
      }
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to fetch messages for chat ${chatId}`, error);
      throw error;
    }
  }

  /**
   * Fetch a specific message from server
   * @param messageId Message ID to fetch
   * @returns Promise with message or null
   * @private
   */
  private async fetchMessageFromServer(messageId: string): Promise<Message | null> {
    try {
      // Send request to fetch specific message
      const tag = `fetch_message_${Date.now()}`;
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'message',
        messageId
      }, tag);
      
      if (response && response.message) {
        // Parse and return the message
        return this.parseMessage(response.message);
      }
      
      return null;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to fetch message ${messageId}`, error);
      return null;
    }
  }

  /**
   * Check if media should be auto-downloaded
   * @param message Message with media
   * @returns True if media should be auto-downloaded
   * @private
   */
  private shouldAutoDownloadMedia(message: Message): boolean {
    // This would check the client options for auto-download settings
    // based on media type, file size, etc.
    // Simplified implementation
    const mediaTypes = [
      MessageType.IMAGE, 
      MessageType.VIDEO, 
      MessageType.AUDIO, 
      MessageType.DOCUMENT, 
      MessageType.STICKER
    ];
    
    const isMediaType = mediaTypes.includes(message.type as MessageType);
    const hasUrl = typeof message.url === 'string' && message.url.length > 0;
    const hasFileSize = typeof message.fileSize === 'number' && message.fileSize > 0;
    const isSmallFile = (message.fileSize || 0) < 1024 * 1024; // Auto-download less than 1MB
    
    return isMediaType && hasUrl && hasFileSize && isSmallFile;
  }

  /**
   * Process a message status update
   * @param data Status update data
   * @private
   */
  private processMessageStatusUpdate(data: any): void {
    if (!data || !data.id) {
      return;
    }
    
    // Get the message from cache
    const message = this.messageCache.get(data.id);
    
    if (message) {
      // Update message status
      message.status = data.status;
      
      // Emit appropriate events
      this.client.emit(WhatsLynxEvents.MESSAGE_ACK, {
        messageId: data.id,
        chatId: message.chatId,
        status: data.status,
        timestamp: Date.now()
      });
      
      if (data.status === MessageStatus.DELIVERY_ACK) {
        this.client.emit(WhatsLynxEvents.MESSAGE_DELIVERED, {
          messageId: data.id,
          chatId: message.chatId,
          timestamp: Date.now()
        });
      } else if (data.status === MessageStatus.READ) {
        this.client.emit(WhatsLynxEvents.MESSAGE_READ, {
          messageId: data.id,
          chatId: message.chatId,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Initialize event listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for incoming messages
    this.client.socket.on('message', (data: any) => {
      this.processIncomingMessage(data);
    });
    
    // Listen for message status updates
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'receipt' && message.data) {
        this.processMessageStatusUpdate(message.data);
      }
    });
    
    // Listen for message revocation
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'revoke' && message.data) {
        const messageId = message.data.id;
        
        // Get the message from cache
        const originalMessage = this.messageCache.get(messageId);
        
        if (originalMessage) {
          // Emit message revoked event
          this.client.emit(WhatsLynxEvents.MESSAGE_REVOKED, {
            messageId,
            chatId: originalMessage.chatId,
            forEveryone: true,
            timestamp: Date.now()
          });
        }
      }
    });
  }
}
