/**
 * Message Sender
 * Handles sending messages to WhatsApp
 */
import { MessageType, MediaType, Message, SendMessageOptions, MessageStatus } from '../types/message';
import { WhatsLynxEvents } from '../types/events';
import { getErrorMessage } from '../utils/error-handler';

/**
 * Message sender class
 * Responsible for sending messages to WhatsApp
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
  }
  
  /**
   * Send a text message
   * @param chatId Chat ID to send message to
   * @param text Text content
   * @param options Message options
   * @returns Promise with message info
   */
  async sendText(chatId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.TEXT,
      sender: this.client.info.wid,
      timestamp: Date.now(),
      fromMe: true,
      content: {
        body: text
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: 'text',
          text
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a media message (image, video, audio, document)
   * @param chatId Chat ID to send message to
   * @param media Media data (path, buffer, or URL)
   * @param type Media type
   * @param options Message options
   * @returns Promise with message info
   */
  async sendMedia(
    chatId: string, 
    media: string | Buffer, 
    type: MediaType, 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object (base)
    const message: Message = {
      id: messageId,
      chatId,
      type: this.mapMediaTypeToMessageType(type),
      sender: this.client.info.wid,
      timestamp: Date.now(),
      fromMe: true,
      content: {
        caption: options.caption || '',
        mimetype: options.mimetype || this.getMimeTypeForMedia(type, media),
        url: '', // Will be populated after upload
        mediaKey: Buffer.from([]), // Will be populated after encryption
        fileSize: 0 // Will be populated after upload
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Upload the media
      const uploadResult = await this.client.media.upload(media, type);
      
      // Update message with upload data
      if (uploadResult) {
        message.content.url = uploadResult.url;
        message.content.mediaKey = uploadResult.mediaKey;
        message.content.fileSize = uploadResult.fileSize;
        message.content.fileName = uploadResult.fileName || options.fileName || 'media';
        
        if (uploadResult.width && uploadResult.height) {
          message.content.width = uploadResult.width;
          message.content.height = uploadResult.height;
        }
        
        if (uploadResult.duration) {
          message.content.seconds = uploadResult.duration;
        }
      }
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: this.mapMediaTypeToContentType(type),
          ...uploadResult,
          caption: options.caption || ''
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a location message
   * @param chatId Chat ID to send message to
   * @param latitude Latitude
   * @param longitude Longitude
   * @param options Message options (can include name and address)
   * @returns Promise with message info
   */
  async sendLocation(
    chatId: string, 
    latitude: number, 
    longitude: number, 
    options: SendMessageOptions & { name?: string, address?: string } = {}
  ): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object
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
        name: options.name || '',
        address: options.address || ''
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: 'location',
          latitude,
          longitude,
          name: options.name || '',
          address: options.address || ''
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a contact message
   * @param chatId Chat ID to send message to
   * @param contact Contact data
   * @param options Message options
   * @returns Promise with message info
   */
  async sendContact(
    chatId: string, 
    contact: { name: string, number: string } | Array<{ name: string, number: string }>, 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      type: Array.isArray(contact) ? MessageType.CONTACT_CARD_MULTI : MessageType.CONTACT,
      sender: this.client.info.wid,
      timestamp: Date.now(),
      fromMe: true,
      content: Array.isArray(contact) ? {
        contacts: contact.map(c => ({ name: c.name, number: c.number }))
      } : {
        displayName: contact.name,
        vcard: this.createVCard(contact.name, contact.number)
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: Array.isArray(contact) ? 'contact_array' : 'contact',
          contacts: Array.isArray(contact) ? contact.map(c => ({ 
            name: c.name, 
            number: c.number 
          })) : undefined,
          displayName: !Array.isArray(contact) ? contact.name : undefined,
          vcard: !Array.isArray(contact) ? this.createVCard(contact.name, contact.number) : undefined
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a button message
   * @param chatId Chat ID to send message to
   * @param content Message content
   * @param buttons Array of buttons
   * @param options Message options
   * @returns Promise with message info
   */
  async sendButtons(
    chatId: string, 
    content: { title: string, text: string, footer?: string }, 
    buttons: Array<{ id: string, text: string }>, 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.BUTTON,
      sender: this.client.info.wid,
      timestamp: Date.now(),
      fromMe: true,
      content: {
        title: content.title,
        text: content.text,
        footer: content.footer || '',
        buttons: buttons.map(b => ({ id: b.id, text: b.text }))
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Format the buttons for WhatsApp API
      const formattedButtons = buttons.map(button => ({
        buttonId: button.id,
        buttonText: { displayText: button.text },
        type: 1
      }));
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: 'buttons',
          headerType: 1, // 1: Text, 2: Image, 3: Video, 4: Document
          contentText: content.text,
          buttonText: 'Choose an option',
          footerText: content.footer || '',
          buttons: formattedButtons,
          headerText: content.title
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Send a list message
   * @param chatId Chat ID to send message to
   * @param title Title of the list
   * @param description Description (body text)
   * @param buttonText Text for the list button
   * @param sections List sections
   * @param options Message options
   * @returns Promise with message info
   */
  async sendList(
    chatId: string, 
    title: string, 
    description: string,
    buttonText: string, 
    sections: Array<{
      title: string, 
      rows: Array<{ id: string, title: string, description?: string }>
    }>, 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    // Generate message ID if not provided
    const messageId = options.messageId || this.client.utils.generateMessageId();
    
    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      type: MessageType.LIST,
      sender: this.client.info.wid,
      timestamp: Date.now(),
      fromMe: true,
      content: {
        title,
        description,
        buttonText,
        footerText: options.footerText || '',
        sections
      }
    };
    
    // Add to pending messages
    this.pendingMessages.set(messageId, message);
    
    // Add options
    if (options.quoted) {
      message.quotedMessage = options.quoted;
    } else if (options.quotedMessageId) {
      // Find quoted message
      // TODO: Implement this
    }
    
    try {
      // Emit sending event
      message.status = MessageStatus.PENDING;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENDING, message);
      
      // Format sections for WhatsApp API
      const formattedSections = sections.map(section => ({
        title: section.title,
        rows: section.rows.map(row => ({
          rowId: row.id,
          title: row.title,
          description: row.description || ''
        }))
      }));
      
      // Send the message
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        messageId,
        chatId,
        content: {
          type: 'list',
          title,
          description,
          buttonText,
          footerText: options.footerText || '',
          listType: 1,
          sections: formattedSections
        },
        ...this.extractMessageOptions(options)
      }, messageId);
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      // Update message status and emit event
      message.status = MessageStatus.SENT;
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);
      
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      return message;
    } catch (error) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);
      
      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Reply to a message
   * @param messageId ID of message to reply to
   * @param text Reply text
   * @param options Message options
   * @returns Promise with message info
   */
  async reply(messageId: string, text: string, options: SendMessageOptions = {}): Promise<Message> {
    // Find the original message
    const originalMessage = await this.client.message.receiver.getMessage(messageId);
    if (!originalMessage) {
      throw new Error(`Message with ID ${messageId} not found`);
    }
    
    // Create options with quoted message
    const replyOptions: SendMessageOptions = {
      ...options,
      quoted: originalMessage
    };
    
    // Send text message with the quoted original
    return this.sendText(originalMessage.chatId, text, replyOptions);
  }
  
  /**
   * Forward a message
   * @param messageId ID of message to forward
   * @param chatId Chat ID to forward message to
   * @returns Promise with message info
   */
  async forward(messageId: string, chatId: string): Promise<Message> {
    // Generate message ID
    const newMessageId = this.client.utils.generateMessageId();
    
    // Find the original message
    const originalMessage = await this.client.message.receiver.getMessage(messageId);
    if (!originalMessage) {
      throw new Error(`Message with ID ${messageId} not found`);
    }
    
    try {
      // Send the forward request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'forward',
        messageId: newMessageId,
        originalMessageId: messageId,
        chatId
      }, newMessageId);
      
      // Create a new message object
      const message: Message = {
        ...originalMessage,
        id: newMessageId,
        chatId,
        timestamp: Date.now(),
        fromMe: true,
        isForwarded: true,
        forwardingScore: (originalMessage.forwardingScore || 0) + 1
      };
      
      // Update message with response data
      if (response && response.messageId) {
        message.serverMessageId = response.messageId;
      }
      
      return message;
    } catch (error) {
      // Emit error
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId: newMessageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Delete a message
   * @param messageId ID of message to delete
   * @param forEveryone Whether to delete for everyone or just for me
   * @returns Promise with success status
   */
  async delete(messageId: string, forEveryone: boolean = false): Promise<boolean> {
    try {
      // Send the delete request
      await this.client.socket.sendTaggedMessage({
        type: 'message_delete',
        messageId,
        forEveryone
      }, `delete_${messageId}`);
      
      return true;
    } catch (error) {
      // Emit error
      this.client.emit(WhatsLynxEvents.ERROR, {
        type: 'message_delete',
        messageId,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }
  
  /**
   * Map media type to message type
   * @param mediaType Media type
   * @returns Corresponding message type
   * @private
   */
  private mapMediaTypeToMessageType(mediaType: MediaType): MessageType {
    switch (mediaType) {
      case MediaType.IMAGE:
        return MessageType.IMAGE;
      case MediaType.VIDEO:
        return MessageType.VIDEO;
      case MediaType.AUDIO:
        return MessageType.AUDIO;
      case MediaType.DOCUMENT:
        return MessageType.DOCUMENT;
      case MediaType.STICKER:
        return MessageType.STICKER;
      default:
        throw new Error(`Unknown media type: ${mediaType}`);
    }
  }
  
  /**
   * Map media type to content type
   * @param mediaType Media type
   * @returns Content type string
   * @private
   */
  private mapMediaTypeToContentType(mediaType: MediaType): string {
    switch (mediaType) {
      case MediaType.IMAGE:
        return 'image';
      case MediaType.VIDEO:
        return 'video';
      case MediaType.AUDIO:
        return 'audio';
      case MediaType.DOCUMENT:
        return 'document';
      case MediaType.STICKER:
        return 'sticker';
      default:
        throw new Error(`Unknown media type: ${mediaType}`);
    }
  }
  
  /**
   * Get MIME type for media
   * @param mediaType Media type
   * @param media Media data
   * @returns MIME type
   * @private
   */
  private getMimeTypeForMedia(mediaType: MediaType, media: string | Buffer): string {
    // If media is URL, try to determine MIME type from extension
    if (typeof media === 'string' && (media.startsWith('http://') || media.startsWith('https://'))) {
      const extension = media.split('.').pop()?.toLowerCase();
      if (extension) {
        switch (extension) {
          case 'jpg':
          case 'jpeg':
            return 'image/jpeg';
          case 'png':
            return 'image/png';
          case 'gif':
            return 'image/gif';
          case 'webp':
            return 'image/webp';
          case 'mp4':
            return 'video/mp4';
          case 'mp3':
            return 'audio/mpeg';
          case 'ogg':
            return 'audio/ogg';
          case 'pdf':
            return 'application/pdf';
          case 'doc':
            return 'application/msword';
          case 'docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          case 'xls':
            return 'application/vnd.ms-excel';
          case 'xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          case 'zip':
            return 'application/zip';
          default:
            // Use default MIME type based on media type
            break;
        }
      }
    }
    
    // Default MIME types
    switch (mediaType) {
      case MediaType.IMAGE:
        return 'image/jpeg';
      case MediaType.VIDEO:
        return 'video/mp4';
      case MediaType.AUDIO:
        return 'audio/mpeg';
      case MediaType.DOCUMENT:
        return 'application/octet-stream';
      case MediaType.STICKER:
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
  
  /**
   * Create a vCard for contact messages
   * @param name Contact name
   * @param number Contact number
   * @returns vCard string
   * @private
   */
  private createVCard(name: string, number: string): string {
    return `BEGIN:VCARD
VERSION:3.0
N:;${name};;;
FN:${name}
TEL;type=CELL;waid=${number}:+${number}
END:VCARD`;
  }
  
  /**
   * Extract message options for sending
   * @param options Message options
   * @returns Object with extracted options
   * @private
   */
  private extractMessageOptions(options: SendMessageOptions): any {
    const result: any = {};
    
    if (options.quoted) {
      result.quoted = {
        id: options.quoted.id,
        type: options.quoted.type,
        sender: options.quoted.sender
      };
    } else if (options.quotedMessageId) {
      result.quotedMessageId = options.quotedMessageId;
    }
    
    if (options.mentions && options.mentions.length > 0) {
      result.mentions = options.mentions;
    }
    
    if (options.viewOnce) {
      result.viewOnce = true;
    }
    
    return result;
  }
}