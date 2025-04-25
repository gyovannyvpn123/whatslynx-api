/**
 * Group management functionality for WhatsApp
 * 
 * This module handles WhatsApp group operations such as
 * creating groups, adding/removing participants, changing settings, etc.
 */
import { isValidGroupId, isValidPhoneId, phoneToWhatsAppId } from '../utils/validators-fixed';

/**
 * Group participant role types
 */
export enum GroupRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  MEMBER = 'member'
}

/**
 * Group invitation settings
 */
export enum GroupInviteMode {
  ADMINS_ONLY = 'admins_only',
  ALL_PARTICIPANTS = 'all_participants'
}

/**
 * Group message settings
 */
export enum GroupMessageMode {
  ADMINS_ONLY = 'admins_only',
  ALL_PARTICIPANTS = 'all_participants'
}

/**
 * Group participant information
 */
export interface GroupParticipant {
  id: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Group settings
 */
export interface GroupSettings {
  name?: string;
  description?: string;
  picture?: Buffer | string;
  inviteMode?: GroupInviteMode;
  messageMode?: GroupMessageMode;
  disappearingMessages?: number; // Duration in seconds, 0 to disable
}

/**
 * Group information
 */
export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  owner: string;
  createdAt: number;
  participants: GroupParticipant[];
  inviteLink?: string;
  inviteMode: GroupInviteMode;
  messageMode: GroupMessageMode;
  disappearingMessages: number;
  picture?: {
    url: string;
    id: string;
  };
}

/**
 * Group manager class for WhatsApp
 */
export class GroupManager {
  private client: any; // WhatsLynxClient

  /**
   * Create a new group manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Create a new WhatsApp group
   * @param name Group name
   * @param participants Array of participant phone numbers or WhatsApp IDs
   * @param options Group creation options
   * @returns Created group information
   */
  async create(
    name: string,
    participants: string[],
    options: {
      description?: string;
      picture?: Buffer | string;
    } = {}
  ): Promise<GroupInfo> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Group name is required');
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }
    
    // Convert phone numbers to WhatsApp IDs if needed
    const formattedParticipants = participants.map(participant => {
      if (isValidPhoneId(participant)) {
        return participant;
      }
      
      const waId = phoneToWhatsAppId(participant);
      if (!waId) {
        throw new Error(`Invalid participant: ${participant}`);
      }
      
      return waId;
    });
    
    try {
      // Prepare group data
      const groupData: {
        name: string;
        participants: string[];
        description?: string;
        picture?: string;
      } = {
        name: name.trim(),
        participants: formattedParticipants
      };
      
      // Set optional fields
      if (options.description) {
        groupData['description'] = options.description;
      }
      
      // Upload picture if provided
      if (options.picture) {
        const pictureData = await this.client.media.upload(
          options.picture,
          'image',
          { filename: 'group_picture.jpg' }
        );
        
        groupData['picture'] = pictureData.url;
      }
      
      // Send group creation request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'create',
        data: groupData
      });
      
      // Process and return the group info
      return this.processGroupInfo(response.group);
      
    } catch (error: any) {
      throw new Error(`Failed to create group: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get information about a group
   * @param groupId Group ID
   * @returns Group information
   */
  async getInfo(groupId: string): Promise<GroupInfo> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    try {
      // Send group info request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'query',
        id: groupId
      });
      
      // Process and return the group info
      return this.processGroupInfo(response.group);
      
    } catch (error: any) {
      throw new Error(`Failed to get group info: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get all groups that I'm a participant in
   * @returns Array of group IDs and names
   */
  async getGroups(): Promise<{ id: string, name: string }[]> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    try {
      // Send groups list request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'list'
      });
      
      // Process and return the groups
      return response.groups.map((group: { id: string; name: string }) => ({
        id: group.id,
        name: group.name
      }));
      
    } catch (error: any) {
      throw new Error(`Failed to get groups: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Leave a group
   * @param groupId Group ID
   * @returns Success status
   */
  async leave(groupId: string): Promise<boolean> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    try {
      // Send leave group request
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'leave',
        id: groupId
      });
      
      return true;
      
    } catch (error: any) {
      throw new Error(`Failed to leave group: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Add participants to a group
   * @param groupId Group ID
   * @param participants Array of participant phone numbers or WhatsApp IDs
   * @returns Success status
   */
  async addParticipants(groupId: string, participants: string[]): Promise<boolean> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }
    
    // Convert phone numbers to WhatsApp IDs if needed
    const formattedParticipants = participants.map(participant => {
      if (isValidPhoneId(participant)) {
        return participant;
      }
      
      const waId = phoneToWhatsAppId(participant);
      if (!waId) {
        throw new Error(`Invalid participant: ${participant}`);
      }
      
      return waId;
    });
    
    try {
      // Send add participants request
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'add',
        id: groupId,
        participants: formattedParticipants
      });
      
      return true;
      
    } catch (error: any) {
      throw new Error(`Failed to add participants: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Remove participants from a group
   * @param groupId Group ID
   * @param participants Array of participant phone numbers or WhatsApp IDs
   * @returns Success status
   */
  async removeParticipants(groupId: string, participants: string[]): Promise<boolean> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }
    
    // Convert phone numbers to WhatsApp IDs if needed
    const formattedParticipants = participants.map(participant => {
      if (isValidPhoneId(participant)) {
        return participant;
      }
      
      const waId = phoneToWhatsAppId(participant);
      if (!waId) {
        throw new Error(`Invalid participant: ${participant}`);
      }
      
      return waId;
    });
    
    try {
      // Send remove participants request
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'remove',
        id: groupId,
        participants: formattedParticipants
      });
      
      return true;
      
    } catch (error: any) {
      throw new Error(`Failed to remove participants: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Promote participants to admin
   * @param groupId Group ID
   * @param participants Array of participant phone numbers or WhatsApp IDs
   * @returns Success status
   */
  async promoteParticipants(groupId: string, participants: string[]): Promise<boolean> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }
    
    // Convert phone numbers to WhatsApp IDs if needed
    const formattedParticipants = participants.map(participant => {
      if (isValidPhoneId(participant)) {
        return participant;
      }
      
      const waId = phoneToWhatsAppId(participant);
      if (!waId) {
        throw new Error(`Invalid participant: ${participant}`);
      }
      
      return waId;
    });
    
    try {
      // Send promote participants request
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'promote',
        id: groupId,
        participants: formattedParticipants
      });
      
      return true;
      
    } catch (error: any) {
      throw new Error(`Failed to promote participants: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Demote admins to regular participants
   * @param groupId Group ID
   * @param participants Array of participant phone numbers or WhatsApp IDs
   * @returns Success status
   */
  async demoteParticipants(groupId: string, participants: string[]): Promise<boolean> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('At least one participant is required');
    }
    
    // Convert phone numbers to WhatsApp IDs if needed
    const formattedParticipants = participants.map(participant => {
      if (isValidPhoneId(participant)) {
        return participant;
      }
      
      const waId = phoneToWhatsAppId(participant);
      if (!waId) {
        throw new Error(`Invalid participant: ${participant}`);
      }
      
      return waId;
    });
    
    try {
      // Send demote participants request
      await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'demote',
        id: groupId,
        participants: formattedParticipants
      });
      
      return true;
      
    } catch (error: any) {
      throw new Error(`Failed to demote participants: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Update group settings
   * @param groupId Group ID
   * @param settings New group settings
   * @returns Updated group information
   */
  async updateSettings(groupId: string, settings: GroupSettings): Promise<GroupInfo> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    if (!settings || typeof settings !== 'object') {
      throw new Error('Settings are required');
    }
    
    try {
      // Prepare update data
      const updateData: any = {
        id: groupId
      };
      
      // Set optional fields
      if (settings.name !== undefined) {
        updateData.name = settings.name;
      }
      
      if (settings.description !== undefined) {
        updateData.description = settings.description;
      }
      
      if (settings.inviteMode !== undefined) {
        updateData.inviteMode = settings.inviteMode;
      }
      
      if (settings.messageMode !== undefined) {
        updateData.messageMode = settings.messageMode;
      }
      
      if (settings.disappearingMessages !== undefined) {
        updateData.disappearingMessages = settings.disappearingMessages;
      }
      
      // Upload picture if provided
      if (settings.picture) {
        const pictureData = await this.client.media.upload(
          settings.picture,
          'image',
          { filename: 'group_picture.jpg' }
        );
        
        updateData.picture = pictureData.url;
      }
      
      // Send update request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'update',
        data: updateData
      });
      
      // Process and return the updated group info
      return this.processGroupInfo(response.group);
      
    } catch (error: any) {
      throw new Error(`Failed to update group settings: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get group invite link
   * @param groupId Group ID
   * @returns Invite link
   */
  async getInviteLink(groupId: string): Promise<string> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    try {
      // Send invite link request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'invite_link',
        id: groupId,
        operation: 'get'
      });
      
      return response.link;
      
    } catch (error: any) {
      throw new Error(`Failed to get invite link: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Revoke group invite link
   * @param groupId Group ID
   * @returns New invite link
   */
  async revokeInviteLink(groupId: string): Promise<string> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!isValidGroupId(groupId)) {
      throw new Error('Invalid group ID');
    }
    
    try {
      // Send revoke invite link request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'invite_link',
        id: groupId,
        operation: 'revoke'
      });
      
      return response.link;
      
    } catch (error: any) {
      throw new Error(`Failed to revoke invite link: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Join a group via invite link
   * @param inviteLink Group invite link
   * @returns Group information
   */
  async joinViaLink(inviteLink: string): Promise<GroupInfo> {
    if (!this.client.socket.isConnected() || !this.client.socket.isAuthenticated()) {
      throw new Error('Not connected or not authenticated');
    }
    
    if (!inviteLink || typeof inviteLink !== 'string') {
      throw new Error('Invite link is required');
    }
    
    // Extract the invite code from the link
    const inviteCode = this.extractInviteCode(inviteLink);
    if (!inviteCode) {
      throw new Error('Invalid invite link format');
    }
    
    try {
      // Send join request
      const response = await this.client.socket.sendTaggedMessage({
        type: 'group',
        action: 'join',
        code: inviteCode
      });
      
      // Process and return the group info
      return this.processGroupInfo(response.group);
      
    } catch (error: any) {
      throw new Error(`Failed to join group: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Extract invite code from invite link
   * @param inviteLink Group invite link
   * @returns Invite code or null if invalid
   * @private
   */
  private extractInviteCode(inviteLink: string): string | null {
    // WhatsApp invite links are in the format:
    // https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXX
    
    try {
      const url = new URL(inviteLink);
      if (url.hostname !== 'chat.whatsapp.com') {
        return null;
      }
      
      const code = url.pathname.substring(1); // Remove leading /
      if (!code || code.length < 10) {
        return null;
      }
      
      return code;
    } catch (error) {
      // If it's not a valid URL, check if it's just the code
      if (inviteLink.match(/^[A-Za-z0-9_-]{10,}$/)) {
        return inviteLink;
      }
      return null;
    }
  }

  /**
   * Process group info from server response
   * @param groupData Group data from server
   * @returns Structured group information
   * @private
   */
  private processGroupInfo(groupData: any): GroupInfo {
    // Process participants
    const participants = (groupData.participants || []).map((p: { id: string; isAdmin?: boolean; isSuperAdmin?: boolean }) => ({
      id: p.id,
      isAdmin: p.isAdmin || false,
      isSuperAdmin: p.isSuperAdmin || false
    }));
    
    // Create group info object
    return {
      id: groupData.id,
      name: groupData.name || 'Unknown Group',
      description: groupData.description,
      owner: groupData.owner,
      createdAt: groupData.createdAt || Date.now(),
      participants,
      inviteLink: groupData.inviteLink,
      inviteMode: groupData.inviteMode || GroupInviteMode.ADMINS_ONLY,
      messageMode: groupData.messageMode || GroupMessageMode.ALL_PARTICIPANTS,
      disappearingMessages: groupData.disappearingMessages || 0,
      picture: groupData.picture
    };
  }
}