// Using the fixed implementations
import { MessageSender } from './sender-fixed5';
import { MessageReceiver } from './receiver-fixed2';
import { MessageFormatter } from './formatter';
import { MessageType } from '../types';

/**
 * Message management module
 * Handles sending, receiving, and formatting messages
 */
export class MessageManager {
  private client: any; // WhatsLynxClient
  public sender: MessageSender;
  public receiver: MessageReceiver;
  public formatter: MessageFormatter;

  /**
   * Create a new message manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    this.sender = new MessageSender(client);
    this.receiver = new MessageReceiver(client);
    this.formatter = new MessageFormatter(client);
  }

  /**
   * Send a text message
   * @param chatId Chat ID to send message to
   * @param text Text content
   * @param options Message options
   * @returns Promise with message info
   */
  async sendText(chatId: string, text: string, options: any = {}): Promise<any> {
    return this.sender.sendText(chatId, text, options);
  }

  /**
   * Send a media message (image, video, audio, document)
   * @param chatId Chat ID to send message to
   * @param media Media data (path, buffer, or URL)
   * @param options Message options
   * @returns Promise with message info
   */
  async sendMedia(chatId: string, media: string | Buffer, options: any = {}): Promise<any> {
    return this.sender.sendMedia(chatId, media, options);
  }

  /**
   * Send a location message
   * @param chatId Chat ID to send message to
   * @param latitude Latitude
   * @param longitude Longitude
   * @param options Message options
   * @returns Promise with message info
   */
  async sendLocation(chatId: string, latitude: number, longitude: number, options: any = {}): Promise<any> {
    return this.sender.sendLocation(chatId, latitude, longitude, options);
  }

  /**
   * Send a contact card message
   * @param chatId Chat ID to send message to
   * @param contact Contact data with name and number, or array of contacts
   * @param options Message options
   * @returns Promise with message info
   */
  async sendContact(
    chatId: string, 
    contact: { name: string, number: string } | Array<{ name: string, number: string }>, 
    options: any = {}
  ): Promise<any> {
    // Extract contact information
    if (Array.isArray(contact)) {
      // Not currently supported in the base sender
      throw new Error('Multiple contacts not yet supported');
    } else {
      return this.sender.sendContact(chatId, contact.number, {
        ...options,
        name: contact.name
      });
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
  async sendButtons(chatId: string, content: { title: string, text: string, footer?: string }, buttons: any[], options: any = {}): Promise<any> {
    // Feature not yet implemented in base sender
    throw new Error('Button messages not yet implemented in this version');
  }

  /**
   * Send a list message
   * @param chatId Chat ID to send message to
   * @param title List title
   * @param description Description text
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
    options: any = {}
  ): Promise<any> {
    // Feature not yet implemented in base sender
    throw new Error('List messages not yet implemented in this version');
  }

  /**
   * Reply to a message
   * @param messageId ID of message to reply to
   * @param text Reply text
   * @param options Message options
   * @returns Promise with message info
   */
  async reply(messageId: string, text: string, options: any = {}): Promise<any> {
    // First, find the original message
    const message = await this.receiver.getMessageById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    // Send reply
    return this.sender.sendText(message.chatId, text, {
      ...options,
      quotedMessageId: messageId
    });
  }

  /**
   * Forward a message
   * @param messageId ID of message to forward
   * @param chatId Chat ID to forward message to
   * @returns Promise with message info
   */
  async forward(messageId: string, chatId: string): Promise<any> {
    // First, get the original message
    const message = await this.receiver.getMessageById(messageId);
    
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    // Implement forwarding based on message type
    switch (message.type) {
      case MessageType.TEXT:
        return this.sender.sendText(chatId, message.content.body);
      case MessageType.IMAGE:
      case MessageType.VIDEO:
      case MessageType.AUDIO:
      case MessageType.DOCUMENT:
      case MessageType.STICKER:
        // Download and re-upload media
        const mediaData = await this.receiver.downloadMedia(messageId);
        
        // Extract the proper media type and exclude STICKER if needed
        let mediaType = message.type;
        if (mediaType === MessageType.STICKER) {
          mediaType = MessageType.IMAGE; // Convert sticker to image for compatibility
        }
        
        return this.sender.sendMedia(chatId, mediaData, {
          mediaType,
          caption: message.caption,
          fileName: message.fileName,
          mimetype: message.mimetype
        });
      default:
        throw new Error(`Forwarding message of type ${message.type} is not yet supported`);
    }
  }

  /**
   * Delete a message
   * @param messageId ID of message to delete
   * @param forEveryone Whether to delete for everyone or just for me
   * @returns Promise with success status
   */
  async delete(messageId: string, forEveryone: boolean = false): Promise<any> {
    // Feature not yet implemented in base sender
    throw new Error('Message deletion not yet implemented in this version');
  }

  /**
   * Mark a chat as read
   * @param chatId Chat ID to mark as read
   * @returns Promise with success status
   */
  async markAsRead(chatId: string): Promise<any> {
    return this.client.chat ? this.client.chat.markAsRead(chatId) : Promise.resolve(false);
  }

  /**
   * Star a message
   * @param messageId ID of message to star
   * @param starred Whether to star or unstar
   * @returns Promise with success status
   */
  async starMessage(messageId: string, starred: boolean = true): Promise<any> {
    // This method is not directly implemented in the sender yet
    // Return a not implemented error for now
    return Promise.reject(new Error('Star message functionality not implemented yet'));
  }

  /**
   * Get all messages in a chat
   * @param chatId Chat ID to get messages from
   * @param options Query options
   * @returns Promise with messages
   */
  async getMessages(chatId: string, options: any = {}): Promise<any[]> {
    return this.receiver.getMessages(chatId, options);
  }

  /**
   * Get a message by ID
   * @param messageId Message ID to get
   * @returns Promise with message or null
   */
  async getMessageById(messageId: string): Promise<any | null> {
    return this.receiver.getMessageById(messageId);
  }

  /**
   * Download media from a message
   * @param messageId Message ID containing media
   * @returns Promise with media data
   */
  async downloadMedia(messageId: string): Promise<Buffer> {
    return this.receiver.downloadMedia(messageId);
  }
}

export { MessageSender, MessageReceiver, MessageFormatter };
