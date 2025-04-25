/**
 * Media downloading functionality for WhatsApp
 * 
 * This module handles downloading media files from WhatsApp servers
 * (images, videos, documents, etc.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { MediaType } from '../types';
import { 
  hkdfDerive, 
  aesDecrypt, 
  base64Decode, 
  hmacSha256
} from '../utils/encryption-fixed';

/**
 * Media downloader class for WhatsApp
 */
export class MediaDownloader {
  private client: any; // WhatsLynxClient

  /**
   * Create a new media downloader
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Download media from WhatsApp servers
   * @param message Message containing media
   * @param options Download options
   * @returns Downloaded media buffer
   */
  async download(
    message: any,
    options: {
      autoSave?: boolean;
      directory?: string;
      filename?: string;
    } = {}
  ): Promise<{
    buffer: Buffer;
    mimetype: string;
    filename: string;
    extension: string;
    size: number;
  }> {
    if (!message || !message.content) {
      throw new Error('Invalid message or missing content');
    }
    
    try {
      // Extract media information from the message
      const mediaInfo = this.extractMediaInfo(message);
      
      // Download the encrypted media from the server
      const encryptedMedia = await this.downloadEncryptedMedia(mediaInfo.url);
      
      // Decrypt the media
      const decryptedMedia = this.decryptMedia(encryptedMedia, mediaInfo.mediaKey);
      
      // Default filename if not provided
      const filename = options.filename || 
        `${mediaInfo.type}_${Date.now()}.${mediaInfo.extension}`;
      
      // Save file if requested
      if (options.autoSave) {
        const directory = options.directory || './downloads';
        await this.saveMedia(decryptedMedia, directory, filename);
      }
      
      // Return media details
      return {
        buffer: decryptedMedia,
        mimetype: mediaInfo.mimetype,
        filename,
        extension: mediaInfo.extension,
        size: decryptedMedia.length
      };
      
    } catch (error: any) {
      throw new Error(`Failed to download media: ${error?.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Extract media information from a message
   * @param message Message containing media
   * @returns Media information
   * @private
   */
  private extractMediaInfo(message: any): {
    url: string;
    mediaKey: Buffer;
    mimetype: string;
    type: MediaType;
    extension: string;
  } {
    // Get media type based on message type
    let type: MediaType;
    
    switch (message.type) {
      case 'image':
        type = MediaType.IMAGE;
        break;
      case 'video':
        type = MediaType.VIDEO;
        break;
      case 'audio':
        type = MediaType.AUDIO;
        break;
      case 'document':
        type = MediaType.DOCUMENT;
        break;
      case 'sticker':
        type = MediaType.STICKER;
        break;
      default:
        throw new Error(`Unsupported media type: ${message.type}`);
    }
    
    // Check required fields
    if (!message.content.url) {
      throw new Error('Media URL not found in message');
    }
    
    if (!message.content.mediaKey) {
      throw new Error('Media key not found in message');
    }
    
    // Extract media key
    const mediaKey = typeof message.content.mediaKey === 'string' 
      ? base64Decode(message.content.mediaKey) 
      : message.content.mediaKey;
    
    // Get mimetype
    const mimetype = message.content.mimetype || this.getMimetypeFromType(type);
    
    // Get extension
    const extension = this.getExtensionFromMimetype(mimetype);
    
    return {
      url: message.content.url,
      mediaKey,
      mimetype,
      type,
      extension
    };
  }
  
  /**
   * Download encrypted media from server
   * @param url Media URL
   * @returns Encrypted media buffer
   * @private
   */
  private async downloadEncryptedMedia(url: string): Promise<Buffer> {
    // In a real implementation, this would use the HTTP client to download
    // For now, we'll simulate a download
    
    // This would actually download from WhatsApp servers
    // using the client's HTTP implementation
    
    try {
      // Make HTTP request to get the file
      return await this.client.http.download(url);
    } catch (error: any) {
      throw new Error(`Failed to download media from server: ${error?.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Decrypt media using the media key
   * @param encryptedMedia Encrypted media buffer
   * @param mediaKey Media key
   * @returns Decrypted media buffer
   * @private
   */
  private decryptMedia(encryptedMedia: Buffer, mediaKey: Buffer): Buffer {
    try {
      // Derive necessary keys from the media key
      const expandedKeys = hkdfDerive(mediaKey, 112, 'WhatsApp Media Keys');
      const encKey = expandedKeys.slice(0, 32);
      const macKey = expandedKeys.slice(32, 64);
      
      // Split encrypted data
      const iv = encryptedMedia.slice(0, 16);
      const ciphertext = encryptedMedia.slice(16, encryptedMedia.length - 10);
      const signature = encryptedMedia.slice(encryptedMedia.length - 10);
      
      // Verify HMAC
      const hmac = hmacSha256(Buffer.concat([iv, ciphertext]), macKey).slice(0, 10);
      if (!hmac.equals(signature)) {
        throw new Error('Media authentication failed');
      }
      
      // Decrypt the media
      return aesDecrypt(ciphertext, encKey, iv);
      
    } catch (error: any) {
      throw new Error(`Failed to decrypt media: ${error?.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Save media to disk
   * @param buffer Media buffer
   * @param directory Directory to save to
   * @param filename Filename
   * @private
   */
  private async saveMedia(buffer: Buffer, directory: string, filename: string): Promise<string> {
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      
      // Full path
      const filePath = path.join(directory, filename);
      
      // Write file
      fs.writeFileSync(filePath, buffer);
      
      return filePath;
      
    } catch (error: any) {
      throw new Error(`Failed to save media: ${error?.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Get mimetype from media type
   * @param type Media type
   * @returns Default mimetype for the type
   * @private
   */
  private getMimetypeFromType(type: MediaType): string {
    switch (type) {
      case MediaType.IMAGE:
        return 'image/jpeg';
      case MediaType.VIDEO:
        return 'video/mp4';
      case MediaType.AUDIO:
        return 'audio/mpeg';
      case MediaType.DOCUMENT:
        return 'application/pdf';
      case MediaType.STICKER:
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
  
  /**
   * Get extension from mimetype
   * @param mimetype MIME type
   * @returns File extension
   * @private
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const mime = mimetype.toLowerCase();
    
    // Images
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/webp') return 'webp';
    
    // Videos
    if (mime === 'video/mp4') return 'mp4';
    if (mime === 'video/3gpp') return '3gp';
    if (mime === 'video/x-matroska') return 'mkv';
    
    // Audio
    if (mime === 'audio/mpeg') return 'mp3';
    if (mime === 'audio/ogg') return 'ogg';
    if (mime === 'audio/mp4') return 'm4a';
    
    // Documents
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'application/msword') return 'doc';
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (mime === 'application/vnd.ms-excel') return 'xls';
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
    if (mime === 'application/vnd.ms-powerpoint') return 'ppt';
    if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
    if (mime === 'text/plain') return 'txt';
    
    // Default
    return 'bin';
  }
}