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
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
      timestamp,
      type: mediaType,
      fromMe: true,
      content: {
        caption: options.caption ? sanitizeMessageContent(options.caption) : undefined,
        mimetype: options.mimetype || '',
        fileName: options.fileName || ''
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
      // First, upload the media to WhatsApp servers
      this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_STARTED, {
        messageId,
        chatId,
        type: mediaType
      });

      const mediaData = await this.client.media.upload(media, options);
      
      // Update message with media data
      message.content = {
        ...message.content,
        url: mediaData.url,
        mediaKey: mediaData.mediaKey,
        fileSize: mediaData.fileSize,
        width: mediaData.width,
        height: mediaData.height,
        seconds: mediaData.duration
      };

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
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
      timestamp,
      type: MessageType.LOCATION,
      fromMe: true,
      content: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name: options.name,
        address: options.address
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
    
    // Create message object with default structure
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
      timestamp,
      type: messageType,
      fromMe: true,
      content: {}, // Will be filled below
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
      // Fetch contact details
      const contacts = await this.fetchContactDetails(isMultiple ? contactId as string[] : [contactId as string]);
      
      // Update content based on contact type
      if (isMultiple) {
        message.content = { contacts };
      } else {
        const contact = contacts[0];
        message.content = {
          displayName: contact.displayName,
          vcard: contact.vcard
        };
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
    
    // Format the buttons for WhatsApp
    const formattedButtons = buttons.map(button => ({
      buttonId: button.id,
      buttonText: {
        displayText: button.text
      },
      type: 1
    }));
    
    // Create message object
    const message: Message = {
      id: messageId,
      chatId,
      sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
      timestamp,
      type: MessageType.BUTTON,
      fromMe: true,
      content: {
        contentText: content,
        footerText: options.footerText,
        headerType: 1,
        buttons: formattedButtons,
        headerText: options.title
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
          buttons: {
            contentText: content,
            footerText: options.footerText,
            headerType: 1,
            buttons: formattedButtons,
            headerText: options.title
          }
        },
        quotedMessageId: options.quotedMessageId,
        timestamp
      });

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
      // Send the delete request through the WebSocket
      await this.sendMessageToServer({
        type: 'message-delete',
        messageId,
        forEveryone
      });

      // Emit message deleted event
      this.client.emit(WhatsLynxEvents.MESSAGE_REVOKED, {
        messageId,
        forEveryone
      });

      return true;
    } catch (error: any) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });

      throw error;
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

    try {
      // Get the original message
      const originalMessage = await this.client.message.getMessageById(messageId);
      
      if (!originalMessage) {
        throw new Error('Original message not found');
      }

      // Create a new message ID for the forwarded message
      const newMessageId = generateMessageID();
      const timestamp = Date.now();

      // Create message object based on original message
      const message: Message = {
        ...originalMessage,
        id: newMessageId,
        chatId,
        sender: this.client.getSessionData()?.authCredentials?.me?.id || '',
        timestamp,
        fromMe: true,
        status: MessageStatus.PENDING,
        isForwarded: true,
        forwardingScore: (originalMessage.forwardingScore || 0) + 1
      };

      // Track the pending message
      this.pendingMessages.set(newMessageId, {
        chatId,
        timestamp,
        message
      });

      // Send the message through the WebSocket
      await this.sendMessageToServer({
        type: 'message-forward',
        messageId: newMessageId,
        originalMessageId: messageId,
        chatId,
        timestamp
      });

      // Emit message sent event
      this.client.emit(WhatsLynxEvents.MESSAGE_SENT, message);

      return message;
    } catch (error: any) {
      // Emit error event
      this.client.emit(WhatsLynxEvents.MESSAGE_ERROR, {
        messageId,
        error: error?.message || 'Unknown error'
      });

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
      // Send the read status through the WebSocket
      await this.sendMessageToServer({
        type: 'chat-read',
        chatId
      });

      return true;
    } catch (error: any) {
      this.client.emit(WhatsLynxEvents.ERROR, {
        message: `Failed to mark chat as read: ${error?.message || 'Unknown error'}`,
        chatId
      });

      throw error;
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
      // Send the message through the socket
      await this.client.socket.sendJSON(message);
    } catch (error: any) {
      // Retry if not exceeding maximum retries
      if (retryCount < this.MAX_RETRIES) {
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry with incremented count
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
    // Find message and update its status
    const pendingMessage = this.pendingMessages.get(messageId);
    if (pendingMessage) {
      pendingMessage.message.status = status;
      
      // Emit status update event
      this.client.emit(WhatsLynxEvents.MESSAGE_STATUS_UPDATE, {
        messageId,
        status,
        message: pendingMessage.message
      });
      
      // If the message is delivered or read, remove from pending
      if (status === MessageStatus.DELIVERED || status === MessageStatus.READ) {
        this.client.emit(WhatsLynxEvents.MESSAGE_ACK, {
          messageId,
          status,
          message: pendingMessage.message
        });
        
        this.pendingMessages.delete(messageId);
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
    // If explicitly specified as document
    if (options.sendAsDocumentType) {
      return MessageType.DOCUMENT;
    }
    
    // Check mimetype if provided
    if (options.mimetype) {
      if (options.mimetype.startsWith('image/')) {
        return MessageType.IMAGE;
      }
      if (options.mimetype.startsWith('video/')) {
        return MessageType.VIDEO;
      }
      if (options.mimetype.startsWith('audio/')) {
        return MessageType.AUDIO;
      }
    }
    
    // Try to infer from path
    if (typeof media === 'string') {
      const lowerPath = media.toLowerCase();
      
      // Image extensions
      if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || lowerPath.endsWith('.png') || lowerPath.endsWith('.gif') || lowerPath.endsWith('.webp')) {
        return MessageType.IMAGE;
      }
      
      // Video extensions
      if (lowerPath.endsWith('.mp4') || lowerPath.endsWith('.mov') || lowerPath.endsWith('.avi') || lowerPath.endsWith('.webm')) {
        return MessageType.VIDEO;
      }
      
      // Audio extensions
      if (lowerPath.endsWith('.mp3') || lowerPath.endsWith('.wav') || lowerPath.endsWith('.ogg') || lowerPath.endsWith('.opus')) {
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
    // Implementation depends on contacts module
    // This is a simplified version that generates basic vCards
    return contactIds.map(contactId => {
      // Extract name from JID
      const name = contactId.split('@')[0];
      
      // Generate simple vCard
      const vcard = `BEGIN:VCARD
VERSION:3.0
N:;${name};;;
FN:${name}
TEL;type=CELL;waid=${name}:+${name}
END:VCARD`;
      
      return {
        displayName: name,
        vcard
      };
    });
  }

  /**
   * Initialize message listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for message status updates
    this.client.on(WhatsLynxEvents.MESSAGE_STATUS_UPDATE, (data: any) => {
      if (data.messageId && data.status) {
        this.handleMessageAck(data.messageId, data.status);
      }
    });
    
    // Listen for message delivery confirmation
    this.client.on(WhatsLynxEvents.MESSAGE_DELIVERED, (data: any) => {
      if (data.messageId) {
        this.handleMessageAck(data.messageId, MessageStatus.DELIVERED);
      }
    });
    
    // Listen for message read confirmation
    this.client.on(WhatsLynxEvents.MESSAGE_READ, (data: any) => {
      if (data.messageId) {
        this.handleMessageAck(data.messageId, MessageStatus.READ);
      }
    });
  }
}