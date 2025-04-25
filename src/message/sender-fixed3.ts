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
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

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
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

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
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

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
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

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
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!content || !content.text) {
      throw new Error('Button content is required');
    }

    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
      throw new Error('At least one button is required');
    }

    // Create message metadata
    const messageId = options.messageId || generateMessageID();
    const timestamp = Date.now();
    
    // Format buttons for WhatsApp
    const formattedButtons = buttons.map(button => ({
      buttonId: button.id,
      buttonText: {
        displayText: button.text
      },
      type: 1
    }));
    
    // Create message object
    const message: any = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id,
      timestamp,
      type: MessageType.BUTTON,
      fromMe: true,
      status: MessageStatus.PENDING,
      title: content.title,
      contentText: content.text,
      footerText: content.footer,
      buttons: formattedButtons
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
            title: content.title,
            contentText: content.text,
            footerText: content.footer,
            buttons: formattedButtons,
            headerType: 1
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);

      return message;
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

      throw error;
    }
  }

  /**
   * Delete a message
   * @param messageId ID of message to delete
   * @param forEveryone Whether to delete for everyone or just for me
   * @returns Promise with success result
   */
  async deleteMessage(messageId: string, forEveryone: boolean = false): Promise<boolean> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Get current message info if available
      const pendingMessage = this.pendingMessages.get(messageId);
      
      // Send delete request to server
      await this.sendMessageToServer({
        type: 'message',
        subtype: 'delete',
        messageId,
        chatId: pendingMessage?.chatId,
        forEveryone,
        timestamp: Date.now()
      });
      
      // Remove from pending if it exists
      if (pendingMessage) {
        this.pendingMessages.delete(messageId);
      }
      
      return true;
    } catch (error: unknown) {
      this.client.emit(WhatsLynxEvents.ERROR, 
        createErrorObject(messageId, error)
      );
      
      return false;
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
    sections: Array<{ title: string, rows: Array<{ id: string, title: string, description: string }> }>,
    options: SendMessageOptions = {}
  ): Promise<Message> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    if (!title || !buttonText || !sections || !Array.isArray(sections) || sections.length === 0) {
      throw new Error('List parameters are invalid');
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
            title,
            buttonText,
            description: options.description,
            footerText: options.footerText,
            sections,
            listType: 0
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);

      return message;
    } catch (error: unknown) {
      // Remove from pending messages
      this.pendingMessages.delete(messageId);

      // Update message status and emit error
      message.status = MessageStatus.ERROR;
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, 
        createErrorObject(messageId, error)
      );

      throw error;
    }
  }

  /**
   * Star a message
   * @param messageId ID of message to star
   * @param starred Whether to star or unstar
   * @returns Promise with success result
   */
  async starMessage(messageId: string, starred: boolean = true): Promise<boolean> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    try {
      // Send star/unstar request to server
      await this.sendMessageToServer({
        type: 'message',
        subtype: 'star',
        messageId,
        starred,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error: unknown) {
      this.client.emit(WhatsLynxEvents.ERROR, 
        createErrorObject(messageId, error)
      );
      
      return false;
    }
  }

  /**
   * Forward a message
   * @param messageId ID of message to forward
   * @param chatId Chat ID to forward message to
   * @returns Promise with new message info
   */
  async forwardMessage(messageId: string, chatId: string): Promise<Message> {
    if (!messageId) {
      throw new Error('Message ID is required');
    }

    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    // Create a new message ID for the forwarded message
    const newMessageId = generateMessageID();
    const timestamp = Date.now();

    try {
      // Send forward request to server
      await this.sendMessageToServer({
        type: 'message',
        subtype: 'forward',
        messageId,
        newMessageId,
        chatId,
        timestamp
      });
      
      // Create a placeholder for the forwarded message
      const message: Message = {
        id: newMessageId,
        chatId,
        sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
        timestamp,
        type: MessageType.TEXT, // Will be updated when received
        fromMe: true,
        content: {},
        isForwarded: true,
        status: MessageStatus.PENDING
      };
      
      // Track the pending message
      this.pendingMessages.set(newMessageId, {
        chatId,
        timestamp,
        message
      });
      
      return message;
    } catch (error: unknown) {
      this.client.emit(WhatsLynxEvents.ERROR, 
        createErrorObject(messageId, error)
      );
      
      throw error;
    }
  }

  /**
   * Mark a chat as read
   * @param chatId Chat ID to mark as read
   * @returns Promise with success result
   */
  async markChatAsRead(chatId: string): Promise<boolean> {
    if (!isValidWhatsAppId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    try {
      // Send read receipt to server
      await this.sendMessageToServer({
        type: 'receipt',
        chatId,
        action: 'read',
        timestamp: Date.now()
      });
      
      return true;
    } catch (error: unknown) {
      this.client.emit(WhatsLynxEvents.ERROR, 
        createErrorObject(chatId, error)
      );
      
      return false;
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
      await this.client.connection.socket.sendTaggedMessage(message);
    } catch (error: unknown) {
      // Handle retries for transient errors
      if (retryCount < this.MAX_RETRIES) {
        this.client.logger('warn', `Retrying message send (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        
        // Exponential backoff: 1s, 2s, 4s, ...
        const backoffTime = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        
        return this.sendMessageToServer(message, retryCount + 1);
      }
      
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
    if (!pendingMessage) return;
    
    // Update message status
    pendingMessage.message.status = status;
    
    // Emit status update event
    this.client.emit(WhatsLynxEvents.MESSAGE_STATUS_UPDATE, {
      messageId,
      status
    });
    
    // If the message is delivered or read, we can remove it from pending
    if (status === MessageStatus.DELIVERED || status === MessageStatus.READ) {
      this.pendingMessages.delete(messageId);
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
    // If force document type is set
    if (options.sendAsDocumentType) {
      return MessageType.DOCUMENT;
    }
    
    // Try to determine by MIME type if provided
    if (options.mimetype) {
      const mimePrefix = options.mimetype.split('/')[0].toLowerCase();
      
      switch (mimePrefix) {
        case 'image':
          return MessageType.IMAGE;
        case 'video':
          return MessageType.VIDEO;
        case 'audio':
          return MessageType.AUDIO;
        default:
          return MessageType.DOCUMENT;
      }
    }
    
    // If it's a string URL or file path, try to determine from extension
    if (typeof media === 'string') {
      const lowerCasePath = media.toLowerCase();
      
      // Check image extensions
      if (/\.(jpe?g|png|gif|webp)$/i.test(lowerCasePath)) {
        return MessageType.IMAGE;
      }
      
      // Check video extensions
      if (/\.(mp4|mov|avi|mkv|webm)$/i.test(lowerCasePath)) {
        return MessageType.VIDEO;
      }
      
      // Check audio extensions
      if (/\.(mp3|wav|ogg|aac|m4a)$/i.test(lowerCasePath)) {
        return MessageType.AUDIO;
      }
    }
    
    // Default to document type
    return MessageType.DOCUMENT;
  }

  /**
   * Fetch contact details for vCard generation
   * @param contactIds Array of contact IDs
   * @returns Contact information with vCards
   * @private
   */
  private async fetchContactDetails(contactIds: string[]): Promise<{ displayName: string, vcard: string }[]> {
    // This is a placeholder - in a real implementation, we would fetch contact
    // information from WhatsApp servers or local storage
    
    return contactIds.map(id => {
      // Generate a simple vCard
      const displayName = id.split('@')[0];
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:;${displayName};;;\nFN:${displayName}\nTEL;type=CELL;waid=${id.split('@')[0]}:${id.split('@')[0]}\nEND:VCARD`;
      
      return { displayName, vcard };
    });
  }

  /**
   * Initialize message listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for message acknowledgments
    this.client.on(WhatsLynxEvents.MESSAGE_ACK, (data: any) => {
      if (data && data.messageId) {
        this.handleMessageAck(data.messageId, data.status);
      }
    });
  }
}