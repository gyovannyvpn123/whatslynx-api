/**
 * Message sending implementation
 * Handles sending various types of messages
 */
import { 
  WhatsLynxEvents, 
  Message, 
  MessageStatus, 
  MessageType, 
  SendMessageOptions 
} from '../types';
import { getErrorMessage } from '../utils/error-handler';

/**
 * Message sending implementation
 * Handles sending and tracking outgoing messages
 */
export class MessageSender {
  private client: any; // WhatsLynxClient
  private pendingMessages: Map<string, Message> = new Map();
  
  /**
   * Create a new message sender
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    
    // Initialize listeners for message status updates
    this.initializeListeners();
  }
  
  /**
   * Send a text message
   * @param chatId Chat ID to send message to
   * @param text Text content
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendText(chatId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.TEXT,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: { body: text },
        body: text,
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        // Handle quoted message
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add mentions if provided
      if (options.mentions || options.mentionedIds) {
        message.mentionedIds = options.mentions || options.mentionedIds;
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendTextMessage(chatId, text, {
        quoted: options.quoted,
        mentions: options.mentions || options.mentionedIds
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a media message (image, video, audio, document)
   * @param chatId Chat ID to send message to
   * @param media Media data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendMedia(chatId: string, media: string | Buffer, options: SendMessageOptions & {
    mediaType?: MessageType.IMAGE | MessageType.VIDEO | MessageType.AUDIO | MessageType.DOCUMENT;
    mimetype?: string;
    caption?: string;
    fileName?: string;
  } = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Determine media type if not provided
      const mediaType = options.mediaType || this.getMediaTypeFromPath(media as string);
      
      // Upload the media to WhatsApp servers
      const uploadResult = await this.client.media.upload(media, {
        mediaType,
        mimetype: options.mimetype,
        fileName: options.fileName
      });
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: mediaType,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          ...uploadResult,
          caption: options.caption
        },
        caption: options.caption,
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add mentions if provided
      if (options.mentions || options.mentionedIds) {
        message.mentionedIds = options.mentions || options.mentionedIds;
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendMediaMessage(chatId, uploadResult, {
        caption: options.caption,
        quoted: options.quoted,
        mentions: options.mentions || options.mentionedIds
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send an image
   * @param chatId Chat ID to send message to
   * @param image Image data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendImage(chatId: string, image: string | Buffer, options: SendMessageOptions & {
    caption?: string;
  } = {}): Promise<Message> {
    return this.sendMedia(chatId, image, {
      ...options,
      mediaType: MessageType.IMAGE
    });
  }
  
  /**
   * Send a video
   * @param chatId Chat ID to send message to
   * @param video Video data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendVideo(chatId: string, video: string | Buffer, options: SendMessageOptions & {
    caption?: string;
  } = {}): Promise<Message> {
    return this.sendMedia(chatId, video, {
      ...options,
      mediaType: MessageType.VIDEO
    });
  }
  
  /**
   * Send an audio message
   * @param chatId Chat ID to send message to
   * @param audio Audio data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendAudio(chatId: string, audio: string | Buffer, options: SendMessageOptions & {
    ptt?: boolean; // Send as voice note
  } = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Upload the media to WhatsApp servers
      const uploadResult = await this.client.media.upload(audio, {
        mediaType: MessageType.AUDIO,
        ptt: options.ptt
      });
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.AUDIO,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          ...uploadResult,
          ptt: options.ptt
        },
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendAudioMessage(chatId, uploadResult, {
        ptt: options.ptt,
        quoted: options.quoted
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a document
   * @param chatId Chat ID to send message to
   * @param document Document data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendDocument(chatId: string, document: string | Buffer, options: SendMessageOptions & {
    fileName?: string;
    mimetype?: string;
    caption?: string;
  } = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Upload the document to WhatsApp servers
      const uploadResult = await this.client.media.upload(document, {
        mediaType: MessageType.DOCUMENT,
        fileName: options.fileName,
        mimetype: options.mimetype
      });
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.DOCUMENT,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          ...uploadResult,
          caption: options.caption,
          fileName: options.fileName || 'document'
        },
        caption: options.caption,
        fileName: options.fileName,
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add mentions if provided
      if (options.mentions || options.mentionedIds) {
        message.mentionedIds = options.mentions || options.mentionedIds;
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendDocumentMessage(chatId, uploadResult, {
        fileName: options.fileName,
        caption: options.caption,
        quoted: options.quoted,
        mentions: options.mentions || options.mentionedIds
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a sticker
   * @param chatId Chat ID to send message to
   * @param sticker Sticker data (URL, path or buffer)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendSticker(chatId: string, sticker: string | Buffer, options: SendMessageOptions = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Upload the sticker to WhatsApp servers
      const uploadResult = await this.client.media.upload(sticker, {
        mediaType: MessageType.STICKER
      });
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.STICKER,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          ...uploadResult
        },
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendStickerMessage(chatId, uploadResult, {
        quoted: options.quoted
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a location message
   * @param chatId Chat ID to send message to
   * @param latitude Latitude coordinate
   * @param longitude Longitude coordinate
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendLocation(
    chatId: string, 
    latitude: number, 
    longitude: number, 
    options: SendMessageOptions & {
      name?: string;
      address?: string;
    } = {}
  ): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.LOCATION,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          degreesLatitude: latitude,
          degreesLongitude: longitude,
          name: options.name,
          address: options.address
        },
        latitude,
        longitude,
        name: options.name,
        address: options.address,
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendLocationMessage(chatId, latitude, longitude, {
        name: options.name,
        address: options.address,
        quoted: options.quoted
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a contact card
   * @param chatId Chat ID to send message to
   * @param contactId Contact ID (phone number with country code)
   * @param options Additional options
   * @returns Promise with message data
   */
  async sendContact(chatId: string, contactId: string, options: SendMessageOptions & {
    name?: string;
    vcard?: string;
  } = {}): Promise<Message> {
    try {
      // Generate a unique message ID if not provided
      const messageId = options.messageId || this.generateMessageId();
      
      // Format contact if needed - remove any non-numeric chars except +
      const formattedContact = contactId.replace(/[^\d+]/g, '');
      
      // Create vCard if not provided
      const vcard = options.vcard || this.createBasicVCard(formattedContact, options.name);
      
      // Create the message object
      const message: Message = {
        id: messageId,
        chatId,
        type: MessageType.CONTACT,
        sender: this.client.info.wid,
        timestamp: Date.now(),
        fromMe: true,
        content: {
          displayName: options.name || formattedContact,
          vcard
        },
        displayName: options.name,
        vcard,
        status: MessageStatus.PENDING
      };
      
      // Add quoted message if provided
      if (options.quoted || options.quotedMessageId) {
        await this.addQuotedMessageInfo(message, options);
      }
      
      // Add to pending messages
      this.pendingMessages.set(messageId, message);
      
      // Emit message sending event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, {
        messageId,
        chatId,
        message
      });
      
      // Actually send the message via socket
      await this.client.socket.sendContactMessage(chatId, formattedContact, {
        name: options.name,
        vcard,
        quoted: options.quoted
      });
      
      // Update message status
      message.status = MessageStatus.SENT;
      
      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, {
        messageId,
        chatId,
        message
      });
      
      return message;
    } catch (error) {
      // Update message status and emit error
      const message = this.pendingMessages.get(options.messageId || '') || {
        id: options.messageId || '',
        chatId,
        status: MessageStatus.ERROR
      } as Message;
      
      // Remove from pending messages
      this.pendingMessages.delete(options.messageId || '');
      
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: options.messageId || '',
        chatId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * React to a message
   * @param messageId Message ID to react to
   * @param emoji Emoji to react with
   * @returns Promise with reaction result
   */
  async react(messageId: string, emoji: string): Promise<{ success: boolean }> {
    try {
      // Get the message
      const message = await this.client.messages.getMessageById(messageId);
      
      if (!message) {
        throw new Error(`Message with ID ${messageId} not found`);
      }
      
      // Send reaction via socket
      await this.client.socket.sendReaction(message.chatId, messageId, emoji);
      
      return { success: true };
    } catch (error) {
      this.client.emit(WhatsLynxEvents.ERROR, {
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Add quoted message information to a message
   * @param message Message to add quoted info to
   * @param options Options containing quoted message
   * @private
   */
  private async addQuotedMessageInfo(message: Message, options: SendMessageOptions): Promise<void> {
    // If quoted message ID is provided, fetch the message
    if (options.quotedMessageId) {
      const quotedMessage = await this.client.messages.getMessageById(options.quotedMessageId);
      if (quotedMessage) {
        message.quotedMessage = quotedMessage;
        message.contextInfo = {
          ...message.contextInfo,
          quotedMessageId: options.quotedMessageId
        };
      }
    } 
    // Otherwise use the provided quoted message
    else if (options.quoted) {
      message.quotedMessage = options.quoted;
      message.contextInfo = {
        ...message.contextInfo,
        quotedMessageId: options.quoted.id
      };
    }
  }
  
  /**
   * Determine media type from file path
   * @param path File path
   * @returns MessageType
   * @private
   */
  private getMediaTypeFromPath(path: string): MessageType {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    
    // Image extensions
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return MessageType.IMAGE;
    }
    
    // Video extensions
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
      return MessageType.VIDEO;
    }
    
    // Audio extensions
    if (['mp3', 'ogg', 'wav', 'm4a', 'aac'].includes(ext)) {
      return MessageType.AUDIO;
    }
    
    // Default to document
    return MessageType.DOCUMENT;
  }
  
  /**
   * Create a basic vCard for a contact
   * @param phoneNumber Phone number
   * @param name Contact name
   * @returns vCard string
   * @private
   */
  private createBasicVCard(phoneNumber: string, name?: string): string {
    const displayName = name || phoneNumber;
    
    return `BEGIN:VCARD
VERSION:3.0
N:;${displayName};;;
FN:${displayName}
TEL;type=CELL;waid=${phoneNumber}:${phoneNumber}
END:VCARD`;
  }
  
  /**
   * Generate a unique message ID
   * @returns Unique ID
   * @private
   */
  private generateMessageId(): string {
    return `${Date.now()}.${Math.floor(Math.random() * 10000)}`;
  }
  
  /**
   * Initialize event listeners for message updates
   * @private
   */
  private initializeListeners(): void {
    // Listen for message status updates
    this.client.on(WhatsLynxEvents.MESSAGE_ACK, (data: any) => {
      const { messageId, status } = data;
      
      // Find message in pending messages
      const message = this.pendingMessages.get(messageId);
      
      if (message) {
        // Update status
        message.status = status;
        
        // If message is delivered or read, remove from pending
        if (status === MessageStatus.DELIVERED || status === MessageStatus.READ) {
          this.pendingMessages.delete(messageId);
        }
      }
    });
  }
}