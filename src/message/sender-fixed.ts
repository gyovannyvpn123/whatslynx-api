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
   * Send a text message
   * @param chatId Chat ID to send message to
   * @param text Text content
   * @param options Message options
   * @returns Promise with message info
   */
  async sendText(chatId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Message text is required');
    }

    // Sanitize the message content
    const sanitizedText = sanitizeMessageContent(text);

    // Create message metadata
    const messageId = options.messageId ?? generateMessageID();
    const timestamp = Date.now();

    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.me?.id || '',
      fromMe: true,
      timestamp,
      type: MessageType.TEXT,
      content: {
        text: sanitizedText
      },
      status: MessageStatus.PENDING,
      quoted: options.quotedMessageId ? {
        id: options.quotedMessageId,
        chatId: chatId,
        type: MessageType.TEXT,
        sender: '',
        timestamp: timestamp,
        fromMe: false,
        content: {}
      } : undefined,
      mentions: options.mentions || [],
      metadata: options.metadata || {}
    };

    // Send the message
    try {
      // Add to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send via WhatsApp protocol
      const response = await this.sendWhatsAppMessage(message);

      // Update message with server data if needed
      if (response && response.serverMessageId) {
        message.serverMessageId = response.serverMessageId;
      }

      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });

      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      return message;
    } catch (error: any) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error occurred'
      });

      throw error;
    }
  }

  /**
   * Send an image message
   * @param chatId Chat ID to send message to
   * @param image Image data (path, buffer, or URL)
   * @param caption Optional caption text
   * @param options Message options
   * @returns Promise with message info
   */
  async sendImage(
    chatId: string, 
    image: string | Buffer, 
    caption: string = '', 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!image) {
      throw new Error('Image data is required');
    }

    // Create message metadata
    const messageId = options.messageId ?? generateMessageID();
    const timestamp = Date.now();

    // Process and upload the image
    try {
      // Prepare the image data
      const imageData = await this.prepareMedia(image, 'image');

      // Create message object
      const message: Message = {
        id: messageId,
        chatId,
        sender: this.client.getSessionData()?.me?.id || '',
        fromMe: true,
        timestamp,
        type: MessageType.IMAGE,
        content: {
          caption: caption ? sanitizeMessageContent(caption) : '',
          ...imageData
        },
        status: MessageStatus.PENDING,
        quoted: options.quotedMessageId ? {
          id: options.quotedMessageId,
          chatId: chatId,
          type: MessageType.TEXT,
          sender: '',
          timestamp: timestamp,
          fromMe: false,
          content: {}
        } : undefined,
        mentions: options.mentions || [],
        metadata: options.metadata || {}
      };

      // Add to pending messages
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send via WhatsApp protocol
      const response = await this.sendWhatsAppMessage(message);

      // Update message with server data if needed
      if (response && response.serverMessageId) {
        message.serverMessageId = response.serverMessageId;
      }

      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });

      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      return message;
    } catch (error: any) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error occurred'
      });

      throw error;
    }
  }

  /**
   * Send a WhatsApp protocol message
   * @param message Message to send
   * @returns Promise with server response
   * @private
   */
  private async sendWhatsAppMessage(message: Message): Promise<any> {
    // Implementation depends on the actual WhatsApp protocol
    // This is a simplified version that integrates with the socket module
    
    if (!this.client.socket.isConnected()) {
      throw new Error('Socket not connected');
    }
    
    if (!this.client.socket.isAuthenticated()) {
      throw new Error('Not authenticated');
    }
    
    // Convert message to WhatsApp protocol format
    const whatsappMessage = this.convertToWhatsAppFormat(message);
    
    // Send message through the socket connection
    return await this.client.socket.sendTaggedMessage(whatsappMessage);
  }

  /**
   * Convert a message to WhatsApp protocol format
   * @param message Message to convert
   * @returns WhatsApp protocol formatted message
   * @private
   */
  private convertToWhatsAppFormat(message: Message): any {
    // Implementation depends on the actual WhatsApp protocol
    // This is a simplified version
    
    // Common message properties
    const whatsappMessage: any = {
      type: 'message',
      messageTag: message.id,
      content: {
        to: message.chatId,
        type: this.getWhatsAppMessageType(message.type),
        id: message.id,
        timestamp: message.timestamp
      }
    };
    
    // Add message-specific content based on type
    switch (message.type) {
      case MessageType.TEXT:
        whatsappMessage.content.text = message.content.text;
        break;
      
      case MessageType.IMAGE:
        whatsappMessage.content.image = {
          url: message.content.url,
          mimetype: message.content.mimetype,
          caption: message.content.caption,
          fileLength: message.content.fileSize,
          width: message.content.width,
          height: message.content.height,
          mediaKey: message.content.mediaKey
        };
        break;
        
      // Add other message types as needed
    }
    
    // Add quoted message if present
    if (message.quoted) {
      whatsappMessage.content.quotedMessage = {
        id: message.quoted.id
      };
    }
    
    // Add mentions if present
    if (message.mentions && message.mentions.length > 0) {
      whatsappMessage.content.mentionedJids = message.mentions;
    }
    
    return whatsappMessage;
  }

  /**
   * Get WhatsApp protocol message type from our enum
   * @param type Message type from our enum
   * @returns WhatsApp protocol message type
   * @private
   */
  private getWhatsAppMessageType(type: MessageType): string {
    // Map our message types to WhatsApp's protocol types
    switch (type) {
      case MessageType.TEXT:
        return 'text';
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
      case MessageType.LOCATION:
        return 'location';
      case MessageType.CONTACT:
        return 'contact';
      default:
        return 'text';
    }
  }

  /**
   * Prepare media for sending
   * @param media Media data (path, buffer, or URL)
   * @param type Media type
   * @returns Prepared media data
   * @private
   */
  private async prepareMedia(media: string | Buffer, type: string): Promise<any> {
    // Implementation depends on the media handling module
    // This is where encryption and upload would happen
    
    // Simplified implementation
    try {
      return await this.client.media.upload(media, type);
    } catch (error: any) {
      throw new Error(`Failed to prepare media: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Initialize message listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for message delivery status updates
    this.client.on(WhatsLynxEvents.MESSAGE_STATUS_UPDATE, (data: any) => {
      const { messageId, status } = data;
      
      // Find message and update its status
      const pendingMessage = this.pendingMessages.get(messageId);
      if (pendingMessage) {
        pendingMessage.message.status = status;
        
        // If the message is delivered or read, remove from pending
        if (status === MessageStatus.DELIVERED || status === MessageStatus.READ) {
          this.pendingMessages.delete(messageId);
        }
      }
    });
  }
}