import { MessageType, SendMessageOptions, Message, MessageStatus } from '../types';
import { sanitizeMessageContent, isValidWhatsAppId } from '../utils/validators';
import { generateMessageID } from '../utils/binary';
import { WhatsLynxEvents } from '../types/events';

/**
 * Message sending implementation
 * Handles sending all types of messages to WhatsApp servers
 */
export class MessageSender {
  private client: any; // WhatsLynxClient
  private pendingMessages: Map<string, { chatId: string, timestamp: number, message: any }> = new Map();
  private readonly MAX_RETRIES = 3;

  /**
   * Create a new message sender
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    this.initializeListeners();
  }

  /**
   * Set up event listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for disconnect events to handle pending messages
    this.client.on(WhatsLynxEvents.DISCONNECTED, () => {
      this.handleDisconnect();
    });

    // Listen for reconnect events to retry pending messages
    this.client.on(WhatsLynxEvents.CONNECTED, () => {
      this.retryPendingMessages();
    });
  }

  /**
   * Send a text message
   * @param chatId Chat ID to send message to
   * @param text Text content
   * @param options Message options
   * @returns Promise with message info
   */
  async sendText(chatId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    // Validate chat ID
    if (!isValidWhatsAppId(chatId)) {
      throw new Error(`Invalid chat ID: ${chatId}`);
    }

    // Create message object
    const messageId = options.messageId || generateMessageID();
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.TEXT,
      content: {
        body: sanitizeMessageContent(text)
      },
      sender: this.client.info?.wid || chatId.split('@')[0],
      fromMe: true,
      timestamp: Date.now(),
      status: MessageStatus.PENDING,
      quoted: options.quoted
    };

    try {
      // Add message to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp: Date.now(),
        message
      });

      // Send message to WhatsApp server
      await this.client.socket.sendJsonMessage({
        type: 'message',
        id: messageId,
        to: chatId,
        content: {
          text: message.content.body
        },
        quoted: options.quoted?.id
      });

      // Update message status
      message.status = MessageStatus.SENT;
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Send a media message
   * @param chatId Chat ID to send message to
   * @param media Media content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendMedia(chatId: string, media: Buffer | string, type: MessageType, options: SendMessageOptions = {}): Promise<Message> {
    // Validate chat ID
    if (!isValidWhatsAppId(chatId)) {
      throw new Error(`Invalid chat ID: ${chatId}`);
    }
    
    // Create message object
    const messageId = options.messageId || generateMessageID();
    const message: Message = {
      id: messageId,
      chatId,
      type,
      content: {
        media,
        caption: options.caption,
        fileName: options.fileName
      },
      sender: this.client.info?.wid || chatId.split('@')[0],
      fromMe: true,
      timestamp: Date.now(),
      status: MessageStatus.PENDING,
      quoted: options.quoted
    };
    
    try {
      // Add message to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp: Date.now(),
        message
      });
      
      // Upload media if needed
      let mediaUrl: string;
      if (Buffer.isBuffer(media)) {
        mediaUrl = await this.client.media.upload(media, {
          fileName: options.fileName,
          mimetype: options.mimetype
        });
      } else {
        mediaUrl = media as string;
      }
      
      // Send message to WhatsApp server
      await this.client.socket.sendJsonMessage({
        type: 'message',
        id: messageId,
        to: chatId,
        content: {
          mediaType: this.getMediaTypeString(type),
          media: mediaUrl,
          caption: options.caption,
          fileName: options.fileName
        },
        quoted: options.quoted?.id
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      return message;
    } catch (error: any) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Send an image message
   * @param chatId Chat ID to send message to
   * @param image Image content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendImage(chatId: string, image: Buffer | string, options: SendMessageOptions = {}): Promise<Message> {
    return this.sendMedia(chatId, image, MessageType.IMAGE, options);
  }
  
  /**
   * Send a video message
   * @param chatId Chat ID to send message to
   * @param video Video content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendVideo(chatId: string, video: Buffer | string, options: SendMessageOptions = {}): Promise<Message> {
    return this.sendMedia(chatId, video, MessageType.VIDEO, options);
  }
  
  /**
   * Send an audio message
   * @param chatId Chat ID to send message to
   * @param audio Audio content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendAudio(chatId: string, audio: Buffer | string, options: SendMessageOptions = {}): Promise<Message> {
    return this.sendMedia(chatId, audio, MessageType.AUDIO, options);
  }
  
  /**
   * Send a document/file message
   * @param chatId Chat ID to send message to
   * @param document Document content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendDocument(chatId: string, document: Buffer | string, options: SendMessageOptions = {}): Promise<Message> {
    if (!options.fileName) {
      options.fileName = 'document';
    }
    
    return this.sendMedia(chatId, document, MessageType.DOCUMENT, options);
  }
  
  /**
   * Send a sticker message
   * @param chatId Chat ID to send message to
   * @param sticker Sticker content (Buffer or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendSticker(chatId: string, sticker: Buffer | string, options: SendMessageOptions = {}): Promise<Message> {
    return this.sendMedia(chatId, sticker, MessageType.STICKER, options);
  }
  
  /**
   * Send a location message
   * @param chatId Chat ID to send message to
   * @param latitude Latitude
   * @param longitude Longitude
   * @param options Message options
   * @returns Promise with message info
   */
  async sendLocation(chatId: string, latitude: number, longitude: number, options: SendMessageOptions = {}): Promise<Message> {
    // Validate chat ID
    if (!isValidWhatsAppId(chatId)) {
      throw new Error(`Invalid chat ID: ${chatId}`);
    }
    
    // Create message object
    const messageId = options.messageId || generateMessageID();
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.LOCATION,
      content: {
        latitude,
        longitude,
        name: options.name, // Use standard name property
        address: options.address // Use standard address property
      },
      sender: this.client.info?.wid || chatId.split('@')[0],
      fromMe: true,
      timestamp: Date.now(),
      status: MessageStatus.PENDING,
      quoted: options.quoted
    };
    
    try {
      // Add message to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp: Date.now(),
        message
      });
      
      // Send message to WhatsApp server
      await this.client.socket.sendJsonMessage({
        type: 'message',
        id: messageId,
        to: chatId,
        content: {
          type: 'location',
          latitude,
          longitude,
          name: options.name,
          address: options.address
        },
        quoted: options.quoted?.id
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      return message;
    } catch (error: any) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Send a contact message
   * @param chatId Chat ID to send message to
   * @param contact Contact information
   * @param options Message options
   * @returns Promise with message info
   */
  async sendContact(chatId: string, contact: { name: string, number: string }, options: SendMessageOptions = {}): Promise<Message> {
    // Validate chat ID
    if (!isValidWhatsAppId(chatId)) {
      throw new Error(`Invalid chat ID: ${chatId}`);
    }
    
    // Create message object
    const messageId = options.messageId || generateMessageID();
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.CONTACT,
      content: {
        name: contact.name,
        number: contact.number
      },
      sender: this.client.info?.wid || chatId.split('@')[0],
      fromMe: true,
      timestamp: Date.now(),
      status: MessageStatus.PENDING,
      quoted: options.quoted
    };
    
    try {
      // Add message to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp: Date.now(),
        message
      });
      
      // Send message to WhatsApp server
      await this.client.socket.sendJsonMessage({
        type: 'message',
        id: messageId,
        to: chatId,
        content: {
          type: 'contact',
          name: contact.name,
          number: contact.number
        },
        quoted: options.quoted?.id
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      return message;
    } catch (error: any) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Reply to a message
   * @param messageId ID of the message to reply to
   * @param text Reply text
   * @param options Message options
   * @returns Promise with message info
   */
  async reply(messageId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    // Get original message
    const originalMessage = await this.client.message.getById(messageId);
    if (!originalMessage) {
      throw new Error(`Message with ID ${messageId} not found`);
    }
    
    // Create quoted message reference
    const quoted: Message = {
      id: originalMessage.id,
      chatId: originalMessage.chatId,
      type: originalMessage.type,
      sender: originalMessage.sender,
      content: originalMessage.content,
      fromMe: originalMessage.fromMe,
      timestamp: originalMessage.timestamp
    };
    
    // Send reply
    return this.sendText(originalMessage.chatId, text, { ...options, quoted });
  }
  
  /**
   * React to a message
   * @param messageId ID of the message to react to
   * @param emoji Emoji reaction
   * @returns Promise with success status
   */
  async react(messageId: string, emoji: string): Promise<boolean> {
    // Get original message
    const originalMessage = await this.client.message.getById(messageId);
    if (!originalMessage) {
      throw new Error(`Message with ID ${messageId} not found`);
    }
    
    const reactionId = generateMessageID();
    
    try {
      // Send reaction
      await this.client.socket.sendJsonMessage({
        type: 'reaction',
        id: reactionId,
        messageId,
        chatId: originalMessage.chatId,
        emoji
      });
      
      // Emit reaction sent event
      this.client.emit(WhatsLynxEvents.REACTION_SENT, {
        messageId,
        emoji,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error: any) {
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Handle a disconnect event
   * Updates pending messages status to ERROR if they've been pending for too long
   * @private
   */
  private handleDisconnect(): void {
    const now = Date.now();
    const maxWaitTime = 30000; // 30 seconds
    
    // Check if any pending messages have been waiting too long
    for (const [messageId, data] of this.pendingMessages.entries()) {
      if (now - data.timestamp > maxWaitTime) {
        // Message has been pending for too long
        this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
          messageId,
          error: 'Message delivery failed due to disconnection'
        });
        
        // Remove from pending
        this.pendingMessages.delete(messageId);
      }
    }
  }
  
  /**
   * Retry sending pending messages after reconnect
   * @private
   */
  private async retryPendingMessages(): Promise<void> {
    for (const [messageId, data] of this.pendingMessages.entries()) {
      try {
        const { message } = data;
        
        // Retry based on message type
        switch (message.type) {
          case MessageType.TEXT:
            await this.sendText(message.chatId, message.content.text, { messageId });
            break;
            
          case MessageType.IMAGE:
          case MessageType.VIDEO:
          case MessageType.AUDIO:
          case MessageType.DOCUMENT:
          case MessageType.STICKER:
            await this.sendMedia(message.chatId, message.content.media, message.type, {
              messageId,
              caption: message.content.caption,
              fileName: message.content.fileName
            });
            break;
            
          case MessageType.LOCATION:
            await this.sendLocation(
              message.chatId,
              message.content.latitude,
              message.content.longitude,
              { messageId }
            );
            break;
            
          case MessageType.CONTACT:
            await this.sendContact(
              message.chatId,
              { name: message.content.name, number: message.content.number },
              { messageId }
            );
            break;
        }
      } catch (error) {
        // Failed to retry, remove from pending
        this.pendingMessages.delete(messageId);
      }
    }
  }
  
  /**
   * Convert MessageType to string representation for API
   * @param type Message type
   * @returns String representation of message type
   * @private
   */
  private getMediaTypeString(type: MessageType): string {
    switch (type) {
      case MessageType.IMAGE:
        return 'image';
      case MessageType.VIDEO:
        return 'video';
      case MessageType.AUDIO:
        return 'audio';
      case MessageType.DOCUMENT:
        return 'document';
      case MessageType.STICKER:
        return 'sticker';
      default:
        return 'unknown';
    }
  }
}