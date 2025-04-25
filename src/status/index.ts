import EventEmitter from 'events';
import { generateMessageID } from '../utils/binary';
import { isValidWhatsAppId } from '../utils/validators';
import { WhatsLynxEvents } from '../types/events';
import { MessageType } from '../types';

/**
 * Status management module
 * Handles WhatsApp status updates (stories)
 */
export class StatusManager extends EventEmitter {
  private client: any; // WhatsLynxClient
  private statusCache: Map<string, any> = new Map();

  /**
   * Create a new status manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    this.initializeListeners();
  }

  /**
   * Post a text status update
   * @param text Text content for the status
   * @param options Status options
   * @returns Promise with status info
   */
  async sendTextStatus(text: string, options: any = {}): Promise<any> {
    if (!text || typeof text !== 'string') {
      throw new Error('Status text is required');
    }

    try {
      // Create status ID
      const statusId = generateMessageID();
      
      // Create status message
      const statusMessage = {
        type: MessageType.TEXT,
        body: text,
        backgroundColor: options.backgroundColor || '#000000',
        font: options.font || 1
      };

      // Send status
      await this.client.socket.sendTaggedMessage({
        type: 'status',
        action: 'send',
        statusId,
        status: statusMessage
      }, statusId);

      // Status info
      const statusInfo = {
        id: statusId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        type: MessageType.TEXT,
        body: text,
        viewedBy: [],
        backgroundColor: statusMessage.backgroundColor,
        font: statusMessage.font
      };

      // Store in cache
      this.statusCache.set(statusId, statusInfo);

      // Emit status updated event
      this.client.emit(WhatsLynxEvents.STATUS_UPDATED, statusInfo);

      return statusInfo;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to send text status', error);
      throw error;
    }
  }

  /**
   * Post a media status update
   * @param media Media data (path, buffer, or URL)
   * @param options Status options
   * @returns Promise with status info
   */
  async sendMediaStatus(media: string | Buffer, options: any = {}): Promise<any> {
    if (!media) {
      throw new Error('Status media is required');
    }

    try {
      // Upload media
      const uploadResult = await this.client.media.upload(media, options);

      // Create status ID
      const statusId = generateMessageID();
      
      // Determine media type
      const mediaType = uploadResult.type;
      
      // Create status message
      const statusMessage: Record<string, any> = {
        type: mediaType,
        url: uploadResult.url,
        mediaKey: uploadResult.mediaKey,
        mimetype: uploadResult.mimetype,
        fileSize: uploadResult.fileSize,
        fileName: uploadResult.fileName,
        caption: options.caption || ''
      };

      // Add media specific properties
      if (mediaType === MessageType.IMAGE || mediaType === MessageType.VIDEO) {
        statusMessage.width = uploadResult.width;
        statusMessage.height = uploadResult.height;
      }

      if (mediaType === MessageType.VIDEO || mediaType === MessageType.AUDIO) {
        statusMessage.seconds = uploadResult.seconds || uploadResult.duration;
      }

      // Send status
      await this.client.socket.sendTaggedMessage({
        type: 'status',
        action: 'send',
        statusId,
        status: statusMessage
      }, statusId);

      // Status info
      const statusInfo = {
        id: statusId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        type: mediaType,
        url: uploadResult.url,
        caption: options.caption || '',
        viewedBy: [],
        ...uploadResult
      };

      // Store in cache
      this.statusCache.set(statusId, statusInfo);

      // Emit status updated event
      this.client.emit(WhatsLynxEvents.STATUS_UPDATED, statusInfo);

      return statusInfo;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to send media status', error);
      throw error;
    }
  }

  /**
   * Get your own status updates
   * @returns Promise with array of status updates
   */
  async getMyStatuses(): Promise<any[]> {
    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getStatuses',
        own: true
      }, generateMessageID());

      if (!response || !Array.isArray(response.statuses)) {
        throw new Error('Failed to get status updates');
      }

      // Update the cache
      for (const status of response.statuses) {
        this.statusCache.set(status.id, status);
      }

      return response.statuses;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get own status updates', error);
      throw error;
    }
  }

  /**
   * Get status updates from contacts
   * @returns Promise with map of user IDs to status updates
   */
  async getContactStatuses(): Promise<Map<string, any[]>> {
    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getStatuses'
      }, generateMessageID());

      if (!response || !response.statuses) {
        throw new Error('Failed to get contact status updates');
      }

      // Process the response
      const contactStatuses = new Map<string, any[]>();
      
      for (const [userId, statuses] of Object.entries(response.statuses)) {
        if (Array.isArray(statuses)) {
          contactStatuses.set(userId, statuses);
          
          // Update the cache
          for (const status of statuses) {
            this.statusCache.set(status.id, status);
          }
        }
      }

      return contactStatuses;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get contact status updates', error);
      throw error;
    }
  }

  /**
   * Delete a status update
   * @param statusId Status ID to delete
   * @returns Promise with success status
   */
  async deleteStatus(statusId: string): Promise<boolean> {
    if (!statusId) {
      throw new Error('Status ID is required');
    }

    try {
      // Delete status
      await this.client.socket.sendTaggedMessage({
        type: 'status',
        action: 'delete',
        statusId
      }, generateMessageID());

      // Remove from cache
      this.statusCache.delete(statusId);

      // Emit status deleted event
      this.client.emit(WhatsLynxEvents.STATUS_DELETED, {
        statusId,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to delete status ${statusId}`, error);
      throw error;
    }
  }

  /**
   * Get who viewed a status update
   * @param statusId Status ID
   * @returns Promise with array of viewers
   */
  async getStatusViewers(statusId: string): Promise<any[]> {
    if (!statusId) {
      throw new Error('Status ID is required');
    }

    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getStatusViewers',
        statusId
      }, generateMessageID());

      if (!response || !Array.isArray(response.viewers)) {
        throw new Error('Failed to get status viewers');
      }

      // Update cache
      if (this.statusCache.has(statusId)) {
        const status = this.statusCache.get(statusId);
        status.viewedBy = response.viewers;
        this.statusCache.set(statusId, status);
      }

      return response.viewers;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get viewers for status ${statusId}`, error);
      throw error;
    }
  }

  /**
   * Mark a status as viewed
   * @param userId User ID of the status owner
   * @param statusId Status ID
   * @returns Promise with success status
   */
  async markStatusAsViewed(userId: string, statusId: string): Promise<boolean> {
    if (!userId || !statusId) {
      throw new Error('User ID and Status ID are required');
    }

    if (!isValidWhatsAppId(userId)) {
      throw new Error('Invalid user ID format');
    }

    try {
      await this.client.socket.sendTaggedMessage({
        type: 'status',
        action: 'markViewed',
        jid: userId,
        statusId
      }, generateMessageID());

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to mark status ${statusId} as viewed`, error);
      throw error;
    }
  }

  /**
   * Get a specific status by ID
   * @param statusId Status ID
   * @returns Status info or null if not found
   */
  getStatus(statusId: string): any | null {
    return this.statusCache.get(statusId) || null;
  }

  /**
   * Initialize listeners for status events
   * @private
   */
  private initializeListeners(): void {
    // Listen for status updates from contacts
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'status' && message.data) {
        this.handleStatusUpdate(message.data);
      }
    });
  }

  /**
   * Handle status update messages
   * @param data Status update data
   * @private
   */
  private handleStatusUpdate(data: any): void {
    if (!data || !data.id) {
      return;
    }

    // Process based on action
    switch (data.action) {
      case 'update':
        // New or updated status
        const statusInfo = {
          id: data.id,
          jid: data.jid,
          timestamp: data.timestamp || Date.now(),
          type: data.type,
          ...data.content
        };

        // Store in cache
        this.statusCache.set(data.id, statusInfo);

        // Emit status updated event
        this.client.emit(WhatsLynxEvents.STATUS_UPDATED, statusInfo);
        break;

      case 'delete':
        // Status deleted
        this.statusCache.delete(data.id);

        // Emit status deleted event
        this.client.emit(WhatsLynxEvents.STATUS_DELETED, {
          statusId: data.id,
          timestamp: Date.now()
        });
        break;

      case 'viewed':
        // Status viewed
        if (this.statusCache.has(data.id)) {
          const status = this.statusCache.get(data.id);
          
          // Add viewer if not already in the list
          if (!status.viewedBy.includes(data.viewer)) {
            status.viewedBy.push(data.viewer);
            this.statusCache.set(data.id, status);
          }
        }
        break;
    }
  }
}
