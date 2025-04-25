import EventEmitter from 'events';
import { generateMessageID } from '../utils/binary';
import { WhatsLynxEvents } from '../types/events';
import { isValidWhatsAppId } from '../utils/validators';

/**
 * Profile management module
 * Handles user profile operations like status, name, and pictures
 */
export class ProfileManager extends EventEmitter {
  private client: any; // WhatsLynxClient

  /**
   * Create a new profile manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    this.initializeListeners();
  }

  /**
   * Get your own profile information
   * @returns Promise with profile info
   */
  async getMyProfile(): Promise<any> {
    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getProfile'
      }, generateMessageID());

      if (!response || !response.profile) {
        throw new Error('Failed to get profile information');
      }

      return response.profile;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get profile information', error);
      throw error;
    }
  }

  /**
   * Get another user's profile information
   * @param userId User ID
   * @returns Promise with profile info
   */
  async getUserProfile(userId: string): Promise<any> {
    if (!isValidWhatsAppId(userId)) {
      throw new Error('Invalid user ID format');
    }

    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getProfile',
        jid: userId
      }, generateMessageID());

      if (!response || !response.profile) {
        throw new Error('Failed to get user profile information');
      }

      return response.profile;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get profile for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Set your profile name
   * @param name New profile name
   * @returns Promise with success status
   */
  async setName(name: string): Promise<boolean> {
    if (!name || typeof name !== 'string') {
      throw new Error('Name is required');
    }

    if (name.length > 25) {
      throw new Error('Name cannot be longer than 25 characters');
    }

    try {
      await this.client.socket.sendTaggedMessage({
        type: 'profile',
        action: 'setName',
        name
      }, generateMessageID());

      // Emit profile name changed event
      this.client.emit(WhatsLynxEvents.PROFILE_NAME_CHANGED, {
        name,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to set profile name', error);
      throw error;
    }
  }

  /**
   * Set your about/status message
   * @param status New status message
   * @returns Promise with success status
   */
  async setStatus(status: string): Promise<boolean> {
    if (!status || typeof status !== 'string') {
      throw new Error('Status message is required');
    }

    if (status.length > 139) {
      throw new Error('Status message cannot be longer than 139 characters');
    }

    try {
      await this.client.socket.sendTaggedMessage({
        type: 'profile',
        action: 'setStatus',
        status
      }, generateMessageID());

      // Emit profile status changed event
      this.client.emit(WhatsLynxEvents.PROFILE_STATUS_CHANGED, {
        status,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to set status message', error);
      throw error;
    }
  }

  /**
   * Set your profile picture
   * @param image Image data (path, buffer, or URL)
   * @returns Promise with success status
   */
  async setPicture(image: string | Buffer): Promise<boolean> {
    if (!image) {
      throw new Error('Image is required');
    }

    try {
      // Upload image
      const uploadResult = await this.client.media.upload(image, {
        mimetype: 'image/jpeg'
      });

      // Set profile picture
      await this.client.socket.sendTaggedMessage({
        type: 'profile',
        action: 'setPicture',
        picture: uploadResult.url
      }, generateMessageID());

      // Emit profile picture changed event
      this.client.emit(WhatsLynxEvents.PROFILE_PICTURE_CHANGED, {
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to set profile picture', error);
      throw error;
    }
  }

  /**
   * Get a user's profile picture
   * @param userId User ID (if omitted, gets your own)
   * @returns Promise with profile picture URL
   */
  async getProfilePicture(userId?: string): Promise<string> {
    try {
      const jid = userId || this.client.getSessionData()?.authCredentials?.me?.id;

      if (!isValidWhatsAppId(jid)) {
        throw new Error('Invalid user ID format');
      }

      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getPicture',
        jid
      }, generateMessageID());

      if (!response || !response.url) {
        throw new Error('Failed to get profile picture');
      }

      return response.url;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get profile picture', error);
      throw error;
    }
  }

  /**
   * Remove your profile picture
   * @returns Promise with success status
   */
  async removePicture(): Promise<boolean> {
    try {
      await this.client.socket.sendTaggedMessage({
        type: 'profile',
        action: 'removePicture'
      }, generateMessageID());

      // Emit profile picture changed event
      this.client.emit(WhatsLynxEvents.PROFILE_PICTURE_CHANGED, {
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to remove profile picture', error);
      throw error;
    }
  }

  /**
   * Update your presence status (online, typing, etc)
   * @param presence Presence status to set
   * @param chatId Optional chat ID to set presence for specific chat
   * @returns Promise with success status
   */
  async updatePresence(
    presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused',
    chatId?: string
  ): Promise<boolean> {
    try {
      const messageData: any = {
        type: 'presence',
        presence
      };

      if (chatId) {
        if (!isValidWhatsAppId(chatId)) {
          throw new Error('Invalid chat ID format');
        }
        messageData.to = chatId;
      }

      await this.client.socket.sendTaggedMessage(messageData, generateMessageID());
      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to update presence', error);
      throw error;
    }
  }

  /**
   * Get privacy settings
   * @returns Promise with privacy settings
   */
  async getPrivacySettings(): Promise<any> {
    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getPrivacySettings'
      }, generateMessageID());

      if (!response || !response.settings) {
        throw new Error('Failed to get privacy settings');
      }

      return response.settings;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get privacy settings', error);
      throw error;
    }
  }

  /**
   * Update privacy settings
   * @param settings Privacy settings to update
   * @returns Promise with success status
   */
  async updatePrivacySettings(settings: {
    lastSeen?: 'all' | 'contacts' | 'none',
    profile?: 'all' | 'contacts' | 'none',
    status?: 'all' | 'contacts' | 'none',
    readReceipts?: boolean,
    groupAdd?: 'all' | 'contacts' | 'none'
  }): Promise<boolean> {
    try {
      await this.client.socket.sendTaggedMessage({
        type: 'profile',
        action: 'setPrivacySettings',
        settings
      }, generateMessageID());

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to update privacy settings', error);
      throw error;
    }
  }

  /**
   * Get business profile details (if applicable)
   * @returns Promise with business profile or null if not a business account
   */
  async getBusinessProfile(): Promise<any | null> {
    try {
      const response = await this.client.socket.sendTaggedMessage({
        type: 'query',
        kind: 'getBusinessProfile'
      }, generateMessageID());

      return response?.businessProfile || null;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get business profile', error);
      return null;
    }
  }

  /**
   * Initialize listeners for profile events
   * @private
   */
  private initializeListeners(): void {
    // Listen for profile update events
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'profile-update' && message.data) {
        this.handleProfileUpdate(message.data);
      }
    });

    // Listen for presence updates
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'presence' && message.data) {
        const { id, type, lastSeen } = message.data;
        
        this.client.emit(WhatsLynxEvents.PRESENCE_UPDATED, {
          id,
          type,
          timestamp: Date.now(),
          lastSeen
        });
      }
    });
  }

  /**
   * Handle profile update notifications
   * @param data Profile update data
   * @private
   */
  private handleProfileUpdate(data: any): void {
    if (!data) return;

    // Handle name updates
    if (data.name !== undefined) {
      this.client.emit(WhatsLynxEvents.PROFILE_NAME_CHANGED, {
        id: data.jid,
        name: data.name,
        timestamp: Date.now()
      });
    }

    // Handle status updates
    if (data.status !== undefined) {
      this.client.emit(WhatsLynxEvents.PROFILE_STATUS_CHANGED, {
        id: data.jid,
        status: data.status,
        timestamp: Date.now()
      });
    }

    // Handle picture updates
    if (data.pictureMTime !== undefined) {
      this.client.emit(WhatsLynxEvents.PROFILE_PICTURE_CHANGED, {
        id: data.jid,
        timestamp: Date.now()
      });
    }
  }
}
