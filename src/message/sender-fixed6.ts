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
        error: getErrorMessage(error)
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
        error: getErrorMessage(error)
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
    content: string, 
    buttons: { id: string, text: string }[], 
    options: SendMessageOptions = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('Content is required');
    }

    if (!Array.isArray(buttons) || buttons.length === 0) {
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
      type: MessageType.BUTTONS,
      fromMe: true,
      status: MessageStatus.PENDING,
      content: sanitizeMessageContent(content),
      buttons: buttons.map(button => ({
        id: button.id,
        text: button.text
      }))
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
          buttons: {
            text: sanitizeMessageContent(content),
            buttons: buttons
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
        error: getErrorMessage(error)
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
    options: SendMessageOptions = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!title || typeof title !== 'string') {
      throw new Error('Title is required');
    }

    if (!buttonText || typeof buttonText !== 'string') {
      throw new Error('Button text is required');
    }

    if (!Array.isArray(sections) || sections.length === 0) {
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
      title: sanitizeMessageContent(title),
      buttonText,
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
          list: {
            title: sanitizeMessageContent(title),
            buttonText,
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
        error: getErrorMessage(error)
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
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    try {
      // Send forward message request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'message',
        action: 'forward',
        messageId,
        chatId
      });
      
      return response.message;
    } catch (error) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
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
  async deleteMessage(messageId: string, forEveryone: boolean = false): Promise<boolean> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Send delete message request
      await this.client.socket.sendTaggedMessage({
        type: 'message',
        action: 'delete',
        messageId,
        forEveryone
      });
      
      return true;
    } catch (error) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
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
      // Send mark as read request
      await this.client.socket.sendTaggedMessage({
        type: 'chat',
        action: 'read',
        chatId
      });
      
      return true;
    } catch (error) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.ERROR, {
        error: getErrorMessage(error)
      });
      
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
      // Send star message request
      await this.client.socket.sendTaggedMessage({
        type: 'message',
        action: 'star',
        messageId,
        starred
      });
      
      return true;
    } catch (error) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: getErrorMessage(error)
      });
      
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
      pendingMessage.message.status = status;
      
      this.client.emit(WhatsLynxEvents.MESSAGE_STATUS_UPDATE, {
        messageId,
        status
      });
      
      if (status === MessageStatus.SENT || status === MessageStatus.DELIVERED || status === MessageStatus.READ || status === MessageStatus.ERROR) {
        this.pendingMessages.delete(messageId);
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
      await this.client.socket.sendMessage(message);
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.sendMessageToServer(message, retryCount + 1);
      } else {
        throw error;
      }
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
    if (options.mediaType) {
      return options.mediaType;
    }
    
    // Simple check based on file extension or MIME type
    if (options.mimetype) {
      if (options.mimetype.startsWith('image/')) {
        return MessageType.IMAGE;
      } else if (options.mimetype.startsWith('video/')) {
        return MessageType.VIDEO;
      } else if (options.mimetype.startsWith('audio/')) {
        return MessageType.AUDIO;
      } else {
        return MessageType.DOCUMENT;
      }
    }
    
    if (typeof media === 'string' && media.indexOf('.') > -1) {
      const extension = media.split('.').pop()?.toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
        return MessageType.IMAGE;
      } else if (['mp4', 'mov', 'avi', 'webm'].includes(extension || '')) {
        return MessageType.VIDEO;
      } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(extension || '')) {
        return MessageType.AUDIO;
      }
    }
    
    // Default to document
    return MessageType.DOCUMENT;
  }

  /**
   * Fetch contact details for vCard generation
   * @param contactIds Array of contact IDs
   * @returns Contact information with vCards
   * @private
   */
  private async fetchContactDetails(contactIds: string[]): Promise<{ displayName: string, vcard: string }[]> {
    // Placeholder for fetching contact details - in a full implementation,
    // we would query the server or use cached contact information to generate vCards
    return contactIds.map(id => {
      const name = id.split('@')[0];
      return {
        displayName: name,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${id.split('@')[0]}:+${id.split('@')[0]}\nEND:VCARD`
      };
    });
  }

  /**
   * Initialize event listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for message acknowledgments
    this.client.on(WhatsLynxEvents.MESSAGE_ACK, (data: { messageId: string, status: string }) => {
      let messageStatus: MessageStatus;
      
      switch (data.status) {
        case 'sent':
          messageStatus = MessageStatus.SENT;
          break;
        case 'delivered':
          messageStatus = MessageStatus.DELIVERED;
          break;
        case 'read':
          messageStatus = MessageStatus.READ;
          break;
        case 'error':
          messageStatus = MessageStatus.ERROR;
          break;
        default:
          messageStatus = MessageStatus.PENDING;
      }
      
      this.handleMessageAck(data.messageId, messageStatus);
    });
  }
}