import EventEmitter from 'events';
import { generateMessageID } from '../utils/binary';
import { isValidWhatsAppId } from '../utils/validators';
import { WhatsLynxEvents } from '../types/events';

/**
 * Group management module
 * Handles group creation, management, and updates
 */
export class GroupManager extends EventEmitter {
  private client: any; // WhatsLynxClient

  /**
   * Create a new group manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    this.initializeListeners();
  }

  /**
   * Create a new group
   * @param name Group name
   * @param participants Array of participant IDs to add
   * @returns Promise with group info
   */
  async create(name: string, participants: string[]): Promise<any> {
    if (!name || typeof name !== 'string') {
      throw new Error('Group name is required');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    // Validate all participant IDs
    for (const participant of participants) {
      if (!isValidWhatsAppId(participant)) {
        throw new Error(`Invalid participant ID: ${participant}`);
      }
    }

    try {
      // Create group
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'create',
        name,
        participants
      }, generateMessageID());

      // Process response
      if (!response || !response.gid) {
        throw new Error('Failed to create group');
      }

      // Group info
      const groupInfo = {
        id: response.gid,
        name,
        owner: this.client.getSessionData()?.authCredentials?.me?.id,
        creation: Date.now(),
        participants: [
          ...participants.map((id: string) => ({ id, isAdmin: false })),
          { id: this.client.getSessionData()?.authCredentials?.me?.id, isAdmin: true }
        ]
      };

      // Emit group created event
      this.client.emit(WhatsLynxEvents.GROUP_CREATED, groupInfo);

      return groupInfo;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to create group', error);
      throw error;
    }
  }

  /**
   * Get group info
   * @param groupId Group ID
   * @returns Promise with group info
   */
  async getInfo(groupId: string): Promise<any> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Request group info
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'query',
        jid: groupId
      }, generateMessageID());

      if (!response || !response.group) {
        throw new Error('Failed to get group info');
      }

      return response.group;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get info for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Get a list of all groups
   * @returns Promise with array of groups
   */
  async getAllGroups(): Promise<any[]> {
    try {
      // Request all groups
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'list'
      }, generateMessageID());

      if (!response || !Array.isArray(response.groups)) {
        throw new Error('Failed to get group list');
      }

      return response.groups;
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to get all groups', error);
      throw error;
    }
  }

  /**
   * Change group subject (name)
   * @param groupId Group ID
   * @param subject New group subject
   * @returns Promise with success status
   */
  async changeSubject(groupId: string, subject: string): Promise<boolean> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!subject || typeof subject !== 'string') {
      throw new Error('Group subject is required');
    }

    try {
      // Change subject
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'subject',
        jid: groupId,
        subject
      }, generateMessageID());

      // Emit group subject changed event
      this.client.emit(WhatsLynxEvents.GROUP_SUBJECT_CHANGED, {
        groupId,
        subject,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to change subject for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Change group description
   * @param groupId Group ID
   * @param description New group description
   * @returns Promise with success status
   */
  async changeDescription(groupId: string, description: string): Promise<boolean> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Change description
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'description',
        jid: groupId,
        description: description || ''
      }, generateMessageID());

      // Emit group description changed event
      this.client.emit(WhatsLynxEvents.GROUP_DESCRIPTION_CHANGED, {
        groupId,
        description,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to change description for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Get group invite link
   * @param groupId Group ID
   * @returns Promise with invite link
   */
  async getInviteLink(groupId: string): Promise<string> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Request invite link
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'inviteLink',
        jid: groupId
      }, generateMessageID());

      if (!response || !response.link) {
        throw new Error('Failed to get invite link');
      }

      return response.link;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get invite link for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Reset (revoke) group invite link
   * @param groupId Group ID
   * @returns Promise with new invite link
   */
  async revokeInviteLink(groupId: string): Promise<string> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Revoke invite link
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'revokeInviteLink',
        jid: groupId
      }, generateMessageID());

      if (!response || !response.link) {
        throw new Error('Failed to revoke invite link');
      }

      // Emit group invite code changed event
      this.client.emit(WhatsLynxEvents.GROUP_INVITE_CODE_CHANGED, {
        groupId,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return response.link;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to revoke invite link for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Add participants to a group
   * @param groupId Group ID
   * @param participants Array of participant IDs to add
   * @returns Promise with success status
   */
  async addParticipants(groupId: string, participants: string[]): Promise<any> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    // Validate all participant IDs
    for (const participant of participants) {
      if (!isValidWhatsAppId(participant)) {
        throw new Error(`Invalid participant ID: ${participant}`);
      }
    }

    try {
      // Add participants
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'add',
        jid: groupId,
        participants
      }, generateMessageID());

      // Process results
      const results: any = {};
      
      if (response && response.participants) {
        for (const p of response.participants) {
          const id = p.jid;
          results[id] = p.error || true;
          
          if (!p.error) {
            // Emit participant added event
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_ADDED, {
              groupId,
              participantId: id,
              actor: this.client.getSessionData()?.authCredentials?.me?.id,
              timestamp: Date.now()
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to add participants to group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Remove participants from a group
   * @param groupId Group ID
   * @param participants Array of participant IDs to remove
   * @returns Promise with success status
   */
  async removeParticipants(groupId: string, participants: string[]): Promise<any> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    // Validate all participant IDs
    for (const participant of participants) {
      if (!isValidWhatsAppId(participant)) {
        throw new Error(`Invalid participant ID: ${participant}`);
      }
    }

    try {
      // Remove participants
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'remove',
        jid: groupId,
        participants
      }, generateMessageID());

      // Process results
      const results: any = {};
      
      if (response && response.participants) {
        for (const p of response.participants) {
          const id = p.jid;
          results[id] = p.error || true;
          
          if (!p.error) {
            // Emit participant removed event
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_REMOVED, {
              groupId,
              participantId: id,
              actor: this.client.getSessionData()?.authCredentials?.me?.id,
              timestamp: Date.now()
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to remove participants from group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Promote participants to admins
   * @param groupId Group ID
   * @param participants Array of participant IDs to promote
   * @returns Promise with success status
   */
  async promoteParticipants(groupId: string, participants: string[]): Promise<any> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    // Validate all participant IDs
    for (const participant of participants) {
      if (!isValidWhatsAppId(participant)) {
        throw new Error(`Invalid participant ID: ${participant}`);
      }
    }

    try {
      // Promote participants
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'promote',
        jid: groupId,
        participants
      }, generateMessageID());

      // Process results
      const results: any = {};
      
      if (response && response.participants) {
        for (const p of response.participants) {
          const id = p.jid;
          results[id] = p.error || true;
          
          if (!p.error) {
            // Emit participant promoted event
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_PROMOTED, {
              groupId,
              participantId: id,
              actor: this.client.getSessionData()?.authCredentials?.me?.id,
              timestamp: Date.now()
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to promote participants in group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Demote participants from admins
   * @param groupId Group ID
   * @param participants Array of participant IDs to demote
   * @returns Promise with success status
   */
  async demoteParticipants(groupId: string, participants: string[]): Promise<any> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }

    // Validate all participant IDs
    for (const participant of participants) {
      if (!isValidWhatsAppId(participant)) {
        throw new Error(`Invalid participant ID: ${participant}`);
      }
    }

    try {
      // Demote participants
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'demote',
        jid: groupId,
        participants
      }, generateMessageID());

      // Process results
      const results: any = {};
      
      if (response && response.participants) {
        for (const p of response.participants) {
          const id = p.jid;
          results[id] = p.error || true;
          
          if (!p.error) {
            // Emit participant demoted event
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_DEMOTED, {
              groupId,
              participantId: id,
              actor: this.client.getSessionData()?.authCredentials?.me?.id,
              timestamp: Date.now()
            });
          }
        }
      }

      return results;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to demote participants in group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Leave a group
   * @param groupId Group ID
   * @returns Promise with success status
   */
  async leave(groupId: string): Promise<boolean> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Leave group
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'leave',
        jid: groupId
      }, generateMessageID());

      // Emit group left event
      this.client.emit(WhatsLynxEvents.GROUP_LEFT, {
        groupId,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to leave group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Set group settings
   * @param groupId Group ID
   * @param settings Group settings
   * @returns Promise with success status
   */
  async setSettings(groupId: string, settings: { 
    onlyAdminsMessage?: boolean, 
    onlyAdminsEdit?: boolean 
  }): Promise<boolean> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // If onlyAdminsMessage is provided
      if (settings.onlyAdminsMessage !== undefined) {
        await this.client.socket.sendTaggedMessage({
          type: 'group',
          action: 'settings',
          jid: groupId,
          setting: 'announcement',
          value: settings.onlyAdminsMessage
        }, generateMessageID());
      }

      // If onlyAdminsEdit is provided
      if (settings.onlyAdminsEdit !== undefined) {
        await this.client.socket.sendTaggedMessage({
          type: 'group',
          action: 'settings',
          jid: groupId,
          setting: 'restrict',
          value: settings.onlyAdminsEdit
        }, generateMessageID());
      }

      // Emit group settings changed event
      this.client.emit(WhatsLynxEvents.GROUP_SETTINGS_CHANGED, {
        groupId,
        settings,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to set settings for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Change group picture
   * @param groupId Group ID
   * @param image Image data (path, buffer, or URL)
   * @returns Promise with success status
   */
  async setPicture(groupId: string, image: string | Buffer): Promise<boolean> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    if (!image) {
      throw new Error('Image is required');
    }

    try {
      // Upload image
      const uploadResult = await this.client.media.upload(image, {
        mimetype: 'image/jpeg'
      });

      // Set picture
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'picture',
        jid: groupId,
        picture: uploadResult.url
      }, generateMessageID());

      // Emit group picture changed event
      this.client.emit(WhatsLynxEvents.GROUP_PICTURE_CHANGED, {
        groupId,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to set picture for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Join a group via invite code
   * @param inviteCode Group invite code
   * @returns Promise with group info
   */
  async join(inviteCode: string): Promise<any> {
    if (!inviteCode || typeof inviteCode !== 'string') {
      throw new Error('Invite code is required');
    }

    try {
      // Extract code from invite link if needed
      let code = inviteCode;
      if (inviteCode.includes('/')) {
        const match = inviteCode.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]{22})/);
        if (!match) {
          throw new Error('Invalid invite code or link');
        }
        code = match[1];
      }

      // Join group
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'join',
        code
      }, generateMessageID());

      if (!response || !response.gid) {
        throw new Error('Failed to join group');
      }

      // Emit group joined event
      this.client.emit(WhatsLynxEvents.GROUP_JOINED, {
        groupId: response.gid,
        actor: this.client.getSessionData()?.authCredentials?.me?.id,
        timestamp: Date.now()
      });

      return {
        id: response.gid,
        name: response.subject,
        ...response
      };
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to join group', error);
      throw error;
    }
  }

  /**
   * Get group participants
   * @param groupId Group ID
   * @returns Promise with array of participants
   */
  async getParticipants(groupId: string): Promise<any[]> {
    if (!isValidWhatsAppId(groupId) || !groupId.endsWith('@g.us')) {
      throw new Error('Invalid group ID format');
    }

    try {
      // Request participants
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'participants',
        jid: groupId
      }, generateMessageID());

      if (!response || !Array.isArray(response.participants)) {
        throw new Error('Failed to get participants');
      }

      return response.participants;
    } catch (error) {
      this.client.getOptions().logger('error', `Failed to get participants for group ${groupId}`, error);
      throw error;
    }
  }

  /**
   * Initialize group event listeners
   * @private
   */
  private initializeListeners(): void {
    // Listen for group events
    this.client.socket.on('text-message', (message: any) => {
      if (message.type === 'group-notification' && message.data) {
        this.handleGroupNotification(message.data);
      }
    });
  }

  /**
   * Handle group notification messages
   * @param data Notification data
   * @private
   */
  private handleGroupNotification(data: any): void {
    if (!data || !data.type || !data.jid) {
      return;
    }

    const groupId = data.jid;
    const actor = data.author;
    const timestamp = data.timestamp || Date.now();

    switch (data.type) {
      case 'create':
        this.client.emit(WhatsLynxEvents.GROUP_CREATED, {
          groupId,
          actor,
          timestamp,
          name: data.subject
        });
        break;

      case 'subject':
        this.client.emit(WhatsLynxEvents.GROUP_SUBJECT_CHANGED, {
          groupId,
          actor,
          timestamp,
          subject: data.subject
        });
        break;

      case 'description':
        this.client.emit(WhatsLynxEvents.GROUP_DESCRIPTION_CHANGED, {
          groupId,
          actor,
          timestamp,
          description: data.description
        });
        break;

      case 'picture':
        this.client.emit(WhatsLynxEvents.GROUP_PICTURE_CHANGED, {
          groupId,
          actor,
          timestamp
        });
        break;

      case 'add':
        if (data.participants) {
          for (const participantId of data.participants) {
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_ADDED, {
              groupId,
              actor,
              timestamp,
              participantId
            });
          }
        }
        break;

      case 'remove':
        if (data.participants) {
          for (const participantId of data.participants) {
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_REMOVED, {
              groupId,
              actor,
              timestamp,
              participantId
            });
          }
        }
        break;

      case 'promote':
        if (data.participants) {
          for (const participantId of data.participants) {
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_PROMOTED, {
              groupId,
              actor,
              timestamp,
              participantId
            });
          }
        }
        break;

      case 'demote':
        if (data.participants) {
          for (const participantId of data.participants) {
            this.client.emit(WhatsLynxEvents.GROUP_PARTICIPANT_DEMOTED, {
              groupId,
              actor,
              timestamp,
              participantId
            });
          }
        }
        break;

      case 'announce':
        this.client.emit(WhatsLynxEvents.GROUP_SETTINGS_CHANGED, {
          groupId,
          actor,
          timestamp,
          settings: {
            onlyAdminsMessage: data.announce
          }
        });
        break;

      case 'restrict':
        this.client.emit(WhatsLynxEvents.GROUP_SETTINGS_CHANGED, {
          groupId,
          actor,
          timestamp,
          settings: {
            onlyAdminsEdit: data.restrict
          }
        });
        break;

      case 'leave':
        this.client.emit(WhatsLynxEvents.GROUP_LEFT, {
          groupId,
          actor,
          timestamp
        });
        break;
    }
  }
}
