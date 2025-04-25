import { MessageType, SendMessageOptions, Message, MessageStatus } from '../types';
import { sanitizeMessageContent, isValidWhatsAppId } from '../utils/validators';
import { generateMessageID } from '../utils/binary';
import { WhatsLynxEvents } from '../types/events';
import { createErrorObject, getErrorMessage } from '../utils/error-handler';

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
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();

    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
      timestamp,
      type: MessageType.TEXT,
      fromMe: true,
      content: {
        text: sanitizedText
      },
      status: MessageStatus.PENDING,
      mentions: options.mentionedIds || [],
      quoted: options.quotedMessageId ? {
        id: options.quotedMessageId,
        chatId: chatId,
        type: MessageType.TEXT,
        sender: '',
        timestamp: timestamp,
        fromMe: false,
        content: {}
      } : undefined,
      metadata: options.metadata || {}
    };

    try {

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: {
          text: sanitizedText
        },
        quotedMessageId: options.quotedMessageId,
        mentionedIds: options.mentionedIds,
        timestamp
      });

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
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Send a media message (image, video, audio, document)
   * @param chatId Chat ID to send message to
   * @param media Media data (path, buffer, or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendMedia(chatId: string, media: string | Buffer, options: SendMessageOptions = {}): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!media) {
      throw new Error('Media content is required');
    }

    // Determine media type
    const mediaType = this.determineMediaType(media, options);
    
    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: mediaType,
      fromMe: true,
      status: MessageStatus.PENDING,
      caption: options.caption ? sanitizeMessageContent(options.caption) : undefined,
      mimetype: options.mimetype,
      fileName: options.fileName
    };

    try {
      // First, upload the media to WhatsApp servers
      this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_STARTED, {
        messageId,
        chatId,
        type: mediaType
      });

      const mediaData = await this.client.media.upload(media, options);
      
      message.url = mediaData.url;
      message.mediaKey = mediaData.mediaKey;
      message.fileSize = mediaData.fileSize;
      
      if (mediaType === MessageType.IMAGE || mediaType === MessageType.VIDEO) {
        message.width = mediaData.width;
        message.height = mediaData.height;
      }
      
      if (mediaType === MessageType.AUDIO || mediaType === MessageType.VIDEO) {
        message.seconds = mediaData.duration;
      }
      
      // Add mentions if provided
      if (options.mentionedIds && options.mentionedIds.length > 0) {
        message.mentionedIds = options.mentionedIds;
      }

      // Add quoted message if provided
      if (options.quotedMessageId) {
        message.quotedMessageId = options.quotedMessageId;
      }

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: {
          [mediaType]: {
            url: mediaData.url,
            mediaKey: mediaData.mediaKey,
            mimetype: options.mimetype || mediaData.mimetype,
            fileSize: mediaData.fileSize,
            fileName: options.fileName || mediaData.fileName,
            caption: options.caption ? sanitizeMessageContent(options.caption) : undefined
          }
        },
        quotedMessageId: options.quotedMessageId,
        mentionedIds: options.mentionedIds,
        timestamp
      });

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
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Send a location message
   * @param chatId Chat ID to send message to
   * @param latitude Latitude
   * @param longitude Longitude
   * @param options Message options (name, address)
   * @returns Promise with message info
   */
  async sendLocation(
    chatId: string, 
    latitude: number, 
    longitude: number, 
    options: SendMessageOptions & { name?: string, address?: string } = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Latitude and longitude must be numbers');
    }

    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: MessageType.LOCATION,
      fromMe: true,
      status: MessageStatus.PENDING,
      latitude,
      longitude,
      name: options.name,
      address: options.address
    };

    try {
      // Add quoted message if provided
      if (options.quotedMessageId) {
        message.quotedMessageId = options.quotedMessageId;
      }

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: {
          location: {
            latitude,
            longitude,
            name: options.name,
            address: options.address
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

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
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Send a contact card message
   * @param chatId Chat ID to send message to
   * @param contactId Contact ID or array of contact IDs
   * @param options Message options
   * @returns Promise with message info
   */
  async sendContact(chatId: string, contactId: string | string[], options: SendMessageOptions = {}): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!contactId) {
      throw new Error('Contact ID is required');
    }

    // Determine if it's a single contact or multiple
    const isMultiple = Array.isArray(contactId);
    const messageType = isMultiple ? MessageType.CONTACT_CARD_MULTI : MessageType.CONTACT_CARD;
    
    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: messageType,
      fromMe: true,
      status: MessageStatus.PENDING
    };

    try {
      // Fetch contact details
      const contacts = await this.fetchContactDetails(isMultiple ? contactId as string[] : [contactId as string]);
      
      if (isMultiple) {
        message.contacts = contacts;
      } else {
        const contact = contacts[0];
        message.displayName = contact.displayName;
        message.vcard = contact.vcard;
      }

      // Add quoted message if provided
      if (options.quotedMessageId) {
        message.quotedMessageId = options.quotedMessageId;
      }

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: isMultiple ? { contacts: contacts } : { contact: contacts[0] },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

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
        error: error.message
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
    content: string, 
    buttons: { id: string, text: string }[], 
    options: SendMessageOptions & { title?: string, footerText?: string } = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('Message content is required');
    }

    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
      throw new Error('At least one button is required');
    }

    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: MessageType.BUTTON,
      fromMe: true,
      status: MessageStatus.PENDING,
      title: options.title,
      description: content,
      footerText: options.footerText,
      buttons
    };

    try {
      // Add quoted message if provided
      if (options.quotedMessageId) {
        message.quotedMessageId = options.quotedMessageId;
      }

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: {
          buttonsMessage: {
            title: options.title,
            description: content,
            footerText: options.footerText,
            buttons,
            headerType: 1 // text header
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

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
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Send a list message
   * @param chatId Chat ID to send message to
   * @param title List title
   * @param buttonText Text for the list button
   * @param sections List sections
   * @param options Message options
   * @returns Promise with message info
   */
  async sendList(
    chatId: string, 
    title: string, 
    buttonText: string, 
    sections: { title: string, rows: { id: string, title: string, description?: string }[] }[], 
    options: SendMessageOptions & { description?: string, footerText?: string } = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!title || typeof title !== 'string') {
      throw new Error('List title is required');
    }

    if (!buttonText || typeof buttonText !== 'string') {
      throw new Error('Button text is required');
    }

    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      throw new Error('At least one section is required');
    }

    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: MessageType.LIST,
      fromMe: true,
      status: MessageStatus.PENDING,
      title,
      description: options.description,
      buttonText,
      footerText: options.footerText,
      sections
    };

    try {
      // Add quoted message if provided
      if (options.quotedMessageId) {
        message.quotedMessageId = options.quotedMessageId;
      }

      // Track the pending message
      this.pendingMessages.set(messageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId,
        chatId,
        content: {
          listMessage: {
            title,
            description: options.description,
            buttonText,
            footerText: options.footerText,
            sections
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

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
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Forward a message to another chat
   * @param messageId ID of message to forward
   * @param chatId Chat ID to forward message to
   * @returns Promise with message info
   */
  async forwardMessage(messageId: string, chatId: string): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Get the original message
      const originalMessage = await this.client.message.getMessageById(messageId);
      
      if (!originalMessage) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Create a new message ID for the forwarded message
      const newMessageId = generateMessageID();
      const timestamp = Date.now();
      
      // Create forwarded message object, copying relevant fields from original
      const message: any = {
        id: newMessageId,
        chatId,
        sender: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp,
        type: originalMessage.type,
        fromMe: true,
        status: MessageStatus.PENDING
      };
      
      // Copy content specific to message type
      switch (originalMessage.type) {
        case MessageType.TEXT:
          message.body = originalMessage.body;
          break;
          
        case MessageType.IMAGE:
        case MessageType.VIDEO:
        case MessageType.AUDIO:
        case MessageType.DOCUMENT:
        case MessageType.STICKER:
          message.url = originalMessage.url;
          message.mediaKey = originalMessage.mediaKey;
          message.mimetype = originalMessage.mimetype;
          message.fileSize = originalMessage.fileSize;
          message.fileName = originalMessage.fileName;
          message.caption = originalMessage.caption;
          break;
          
        case MessageType.LOCATION:
          message.latitude = originalMessage.latitude;
          message.longitude = originalMessage.longitude;
          message.name = originalMessage.name;
          message.address = originalMessage.address;
          break;
          
        default:
          throw new Error(`Cannot forward message of type ${originalMessage.type}`);
      }

      // Track the pending message
      this.pendingMessages.set(newMessageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message',
        messageId: newMessageId,
        chatId,
        originalMessageId: messageId,
        isForwarded: true,
        timestamp
      });

      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);

      return message;
    } catch (error) {
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error.message
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
  async deleteMessage(messageId: string, forEveryone: boolean = false): Promise<boolean> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Get message details
      const message = await this.client.message.getMessageById(messageId);
      
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      
      // Check if we can delete for everyone (only own messages, sent recently)
      if (forEveryone) {
        if (!message.fromMe) {
          throw new Error('Can only delete own messages for everyone');
        }
        
        // Check if message is too old (>1 hour)
        const messageAge = Date.now() - message.timestamp;
        if (messageAge > 60 * 60 * 1000) {
          throw new Error('Message is too old to delete for everyone');
        }
      }

      // Send delete command
      await this.sendMessageToServer({
        type: 'message',
        action: 'delete',
        messageId,
        chatId: message.chatId,
        forEveryone
      });

      // Emit message revoked event
      this.client.emit(WhatsLynxEvents.MESSAGE_REVOKED, {
        messageId,
        chatId: message.chatId,
        forEveryone,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Mark a chat as read
   * @param chatId Chat ID to mark as read
   * @returns Promise with success status
   */
  async markChatAsRead(chatId: string): Promise<boolean> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    try {
      // Send read command
      await this.sendMessageToServer({
        type: 'chat',
        action: 'read',
        chatId
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Star a message
   * @param messageId ID of message to star
   * @param starred Whether to star or unstar
   * @returns Promise with success status
   */
  async starMessage(messageId: string, starred: boolean = true): Promise<boolean> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Get message details
      const message = await this.client.message.getMessageById(messageId);
      
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Send star command
      await this.sendMessageToServer({
        type: 'message',
        action: 'star',
        messageId,
        chatId: message.chatId,
        starred
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle message acknowledgment
   * @param messageId Message ID
   * @param status New message status
   * @private
   */
  private handleMessageAck(messageId: string, status: MessageStatus): void {
    const pendingMessage = this.pendingMessages.get(messageId);
    
    if (pendingMessage) {
      // Update message status
      pendingMessage.message.status = status;
      
      // Emit message ack event
      this.client.emit(WhatsLynxEvents.MESSAGE_ACK, {
        messageId,
        chatId: pendingMessage.chatId,
        status,
        timestamp: Date.now()
      });
      
      // If the message reached its final state, remove from pending
      if (status === MessageStatus.READ || status === MessageStatus.ERROR) {
        this.pendingMessages.delete(messageId);
      }
      
      // Emit specific events based on status
      if (status === MessageStatus.DELIVERY_ACK) {
        this.client.emit(WhatsLynxEvents.MESSAGE_DELIVERED, {
          messageId,
          chatId: pendingMessage.chatId,
          timestamp: Date.now()
        });
      } else if (status === MessageStatus.READ) {
        this.client.emit(WhatsLynxEvents.MESSAGE_READ, {
          messageId,
          chatId: pendingMessage.chatId,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Send a message to the server
   * @param message Message to send
   * @param retryCount Current retry count
   * @returns Promise that resolves when sent
   * @private
   */
  private async sendMessageToServer(message: any, retryCount: number = 0): Promise<void> {
    try {
      // Set a unique tag for this message
      const tag = message.messageId || generateMessageID();
      message.messageTag = tag;
      
      // Send the message through the socket
      await this.client.socket.sendTaggedMessage(message, tag);
    } catch (error) {
      // Retry if not exceeded max retries
      if (retryCount < this.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        return this.sendMessageToServer(message, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Determine the media type from the provided media
   * @param media Media data
   * @param options Message options
   * @returns Media message type
   * @private
   */
  private determineMediaType(media: string | Buffer, options: SendMessageOptions): MessageType {
    // If specifically requested to send as document
    if (options.sendAsDocumentType) {
      return MessageType.DOCUMENT;
    }

    // Try to determine based on mimetype
    if (options.mimetype) {
      if (options.mimetype.startsWith('image/')) {
        if (options.mimetype === 'image/webp') {
          return MessageType.STICKER;
        }
        return MessageType.IMAGE;
      } else if (options.mimetype.startsWith('video/')) {
        return MessageType.VIDEO;
      } else if (options.mimetype.startsWith('audio/')) {
        return MessageType.AUDIO;
      } else {
        return MessageType.DOCUMENT;
      }
    }

    // Try to determine based on file extension if it's a string (path or URL)
    if (typeof media === 'string' && media.includes('.')) {
      const extension = media.split('.').pop()?.toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif'].includes(extension!)) {
        return MessageType.IMAGE;
      } else if (['mp4', 'mov', '3gp', 'avi'].includes(extension!)) {
        return MessageType.VIDEO;
      } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(extension!)) {
        return MessageType.AUDIO;
      } else if (['webp'].includes(extension!)) {
        return MessageType.STICKER;
      }
    }

    // Default to document if can't determine
    return MessageType.DOCUMENT;
  }

  /**
   * Fetch contact details for vCard generation
   * @param contactIds Array of contact IDs
   * @returns Contact information with vCards
   * @private
   */
  private async fetchContactDetails(contactIds: string[]): Promise<{ displayName: string, vcard: string }[]> {
    // In a real implementation, this would query WhatsApp for contact details
    // and generate proper vCards. This is a simplified version.
    
    const contacts = [];
    
    for (const contactId of contactIds) {
      if (!isValidWhatsAppId(contactId)) {
        throw new Error(`Invalid contact ID format: ${contactId}`);
      }
      
      // Extract phone number from ID
      const phoneNumber = contactId.split('@')[0];
      
      // Create a minimal vCard
      const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${phoneNumber}`,
        `TEL;type=CELL;type=VOICE;waid=${phoneNumber}:+${phoneNumber}`,
        'END:VCARD'
      ].join('\n');
      
      contacts.push({
        displayName: phoneNumber,
        vcard
      });
    }
    
    return contacts;
  }

  /**
   * Initialize event listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for message receipts
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'receipt' && message.data) {
        const { id, status } = message.data;
        
        if (id && status) {
          // Convert receipt status to message status
          let messageStatus: MessageStatus;
          
          switch (status) {
            case 'sent':
              messageStatus = MessageStatus.SERVER_ACK;
              break;
            case 'delivered':
              messageStatus = MessageStatus.DELIVERY_ACK;
              break;
            case 'read':
              messageStatus = MessageStatus.READ;
              break;
            case 'played':
              messageStatus = MessageStatus.PLAYED;
              break;
            case 'error':
              messageStatus = MessageStatus.ERROR;
              break;
            default:
              messageStatus = MessageStatus.PENDING;
          }
          
          this.handleMessageAck(id, messageStatus);
        }
      }
    });
  }
}
