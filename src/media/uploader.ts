import * as fs from 'fs';
import * as path from 'path';
import { generateMessageID } from '../utils/binary';
import { isValidUrl } from '../utils/validators';
import { WhatsLynxEvents } from '../types/events';
import { encryptAndSign, generateRandomBytes, hkdf } from '../utils/encryption';
import { MessageType } from '../types';
import { getErrorMessage } from '../utils/error-handler';

/**
 * Media uploading implementation
 * Handles uploading media to WhatsApp servers
 */
export class MediaUploader {
  private client: any; // WhatsLynxClient
  private uploadQueue: Map<string, { 
    resolve: Function, 
    reject: Function 
  }> = new Map();

  /**
   * Create a new media uploader
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Upload media to WhatsApp servers
   * @param media Media data (path, buffer, or URL)
   * @param options Upload options
   * @returns Promise with media upload result
   */
  async upload(media: string | Buffer, options: any = {}): Promise<any> {
    // Generate upload ID
    const uploadId = generateMessageID();
    
    try {
      // Determine media data and type
      let mediaData: Buffer;
      let mediaInfo: any = {};
      
      if (Buffer.isBuffer(media)) {
        // If media is already a buffer
        mediaData = media;
        
        // Try to determine mimetype from options or default to application/octet-stream
        mediaInfo.mimetype = options.mimetype || 'application/octet-stream';
        mediaInfo.fileSize = mediaData.length;
        mediaInfo.fileName = options.fileName || 'file';
      } else if (typeof media === 'string') {
        if (isValidUrl(media)) {
          // If media is a URL, download it first
          this.client.getOptions().logger('info', `Downloading media from URL: ${media}`);
          mediaData = await this.client.media.download(media);
          
          // Extract filename from URL
          const urlObj = new URL(media);
          const fileName = path.basename(urlObj.pathname);
          mediaInfo.fileName = options.fileName || fileName || 'file';
        } else {
          // Assume it's a file path
          if (!fs.existsSync(media)) {
            throw new Error(`File not found: ${media}`);
          }
          
          // Read file
          mediaData = fs.readFileSync(media);
          
          // Get file info
          const stats = fs.statSync(media);
          mediaInfo.fileSize = stats.size;
          mediaInfo.fileName = options.fileName || path.basename(media);
        }
        
        // Determine mimetype
        if (options.mimetype) {
          mediaInfo.mimetype = options.mimetype;
        } else {
          // Try to guess from filename
          mediaInfo.mimetype = this.getMimeType(mediaInfo.fileName);
        }
      } else {
        throw new Error('Invalid media format. Provide a Buffer, file path, or URL.');
      }
      
      // Determine media type from mimetype
      const mediaType = this.getMediaTypeFromMimetype(mediaInfo.mimetype);
      
      // Encrypt media if needed
      const mediaKey = this.generateMediaKey();
      const encryptedMedia = this.encryptMedia(mediaData, mediaKey, mediaType);
      
      if (!encryptedMedia) {
        throw new Error('Failed to encrypt media');
      }
      
      // Get additional media info based on type
      mediaInfo = {
        ...mediaInfo,
        ...await this.getAdditionalMediaInfo(mediaData, mediaType, options)
      };
      
      // Prepare upload
      this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_STARTED, {
        uploadId,
        type: mediaType,
        size: mediaData.length
      });
      
      // Create promise for this upload
      const uploadPromise = new Promise((resolve, reject) => {
        this.uploadQueue.set(uploadId, {
          resolve,
          reject
        });
      });
      
      // Determine upload URL based on media type
      const uploadUrl = this.getUploadUrl(mediaType);
      
      // Create upload headers
      const headers = {
        'Content-Type': 'application/octet-stream',
        'Origin': 'https://web.whatsapp.com',
        'Referer': 'https://web.whatsapp.com/'
      };
      
      // Upload encrypted media
      const uploadResponse = await this.client.http.uploadMedia(uploadUrl, encryptedMedia, {
        headers,
        onUploadProgress: (progressEvent: any) => {
          const { loaded, total } = progressEvent;
          
          // Emit progress event
          this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_PROGRESS, {
            uploadId,
            bytesTransferred: loaded,
            bytesTotal: total,
            progress: total ? loaded / total : 0
          });
        }
      });
      
      // Process upload response
      if (!uploadResponse || !uploadResponse.url) {
        throw new Error('Invalid upload response');
      }
      
      // Create result with required info for sending
      const result = {
        mediaKey: mediaKey.toString('base64'),
        url: uploadResponse.url,
        directPath: uploadResponse.directPath,
        mimetype: mediaInfo.mimetype,
        fileSize: mediaInfo.fileSize,
        fileName: mediaInfo.fileName,
        type: mediaType,
        ...mediaInfo
      };
      
      // Emit upload complete event
      this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_COMPLETE, {
        uploadId,
        type: mediaType,
        url: result.url,
        size: mediaInfo.fileSize
      });
      
      // Resolve the upload
      if (this.uploadQueue.has(uploadId)) {
        const upload = this.uploadQueue.get(uploadId)!;
        upload.resolve(result);
        this.uploadQueue.delete(uploadId);
      }
      
      return result;
    } catch (error) {
      // Emit upload failed event
      this.client.emit(WhatsLynxEvents.MEDIA_UPLOAD_FAILED, {
        uploadId,
        error: getErrorMessage(error)
      });
      
      // Reject the upload
      if (this.uploadQueue.has(uploadId)) {
        const upload = this.uploadQueue.get(uploadId)!;
        upload.reject(error);
        this.uploadQueue.delete(uploadId);
      }
      
      throw error;
    }
  }

  /**
   * Get media information from a file
   * @param filePath Path to media file
   * @returns Promise with media information
   */
  async getMediaInfo(filePath: string): Promise<any> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Read file
    const mediaData = fs.readFileSync(filePath);
    
    // Get file info
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    
    // Determine mimetype
    const mimetype = this.getMimeType(fileName);
    
    // Determine media type from mimetype
    const mediaType = this.getMediaTypeFromMimetype(mimetype);
    
    // Get additional media info based on type
    const additionalInfo = await this.getAdditionalMediaInfo(mediaData, mediaType, {});
    
    return {
      fileName,
      fileSize: stats.size,
      mimetype,
      type: mediaType,
      ...additionalInfo
    };
  }

  /**
   * Create a thumbnail for media
   * @param media Media data (path, buffer, or URL)
   * @param options Thumbnail options
   * @returns Promise with thumbnail as base64 string
   */
  async createThumbnail(media: string | Buffer, options: any = {}): Promise<string> {
    // This would use image manipulation libraries to create thumbnails
    // In a real implementation, it would use something like sharp or jimp
    
    // Placeholder implementation
    return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVDN//9k=';
  }

  /**
   * Get the appropriate upload URL for media type
   * @param mediaType Media type
   * @returns Upload URL
   * @private
   */
  private getUploadUrl(mediaType: string): string {
    // In a real implementation, this would return different URLs based on media type
    return 'https://mmg.whatsapp.net/v/t62.7118-24/upload';
  }

  /**
   * Generate a random media key
   * @returns Random 32-byte key
   * @private
   */
  private generateMediaKey(): Buffer {
    return generateRandomBytes(32);
  }

  /**
   * Encrypt media using mediaKey
   * @param mediaData Media data to encrypt
   * @param mediaKey Media key
   * @param mediaType Media type
   * @returns Encrypted media buffer or null if encryption fails
   * @private
   */
  private encryptMedia(mediaData: Buffer, mediaKey: Buffer, mediaType: string): Buffer | null {
    try {
      // Get auth credentials
      const sessionData = this.client.getSessionData();
      
      if (!sessionData || !sessionData.authCredentials) {
        throw new Error('No authentication credentials available');
      }
      
      const { encKey, macKey } = sessionData.authCredentials;
      
      // Get media type for HKDF info
      let mediaInfo: string;
      switch (mediaType) {
        case MessageType.IMAGE:
          mediaInfo = 'WhatsApp Image Keys';
          break;
        case MessageType.VIDEO:
          mediaInfo = 'WhatsApp Video Keys';
          break;
        case MessageType.AUDIO:
          mediaInfo = 'WhatsApp Audio Keys';
          break;
        case MessageType.DOCUMENT:
          mediaInfo = 'WhatsApp Document Keys';
          break;
        case MessageType.STICKER:
          mediaInfo = 'WhatsApp Image Keys';
          break;
        default:
          mediaInfo = 'WhatsApp Media Keys';
      }
      
      // Convert encKey and macKey from base64 if they are strings
      const encKeyBuffer = typeof encKey === 'string' ? Buffer.from(encKey, 'base64') : encKey;
      const macKeyBuffer = typeof macKey === 'string' ? Buffer.from(macKey, 'base64') : macKey;
      
      // Derive keys from media key
      const mediaKeyExpanded = hkdf(mediaKey, 112, mediaInfo);
      
      const iv = mediaKeyExpanded.slice(0, 16);
      const cipherKey = mediaKeyExpanded.slice(16, 48);
      const derivedMacKey = mediaKeyExpanded.slice(48, 80);
      
      // Encrypt and sign
      return encryptAndSign(cipherKey, derivedMacKey, mediaData);
    } catch (error) {
      this.client.getOptions().logger('error', 'Media encryption failed', error);
      return null;
    }
  }

  /**
   * Get additional media information based on media type
   * @param mediaData Media data
   * @param mediaType Media type
   * @param options Options
   * @returns Promise with additional media info
   * @private
   */
  private async getAdditionalMediaInfo(mediaData: Buffer, mediaType: string, options: any): Promise<any> {
    // This would extract information like dimensions, duration, etc.
    // In a real implementation, it would use libraries like probe-image-size, ffprobe, etc.
    
    // Placeholder implementation
    const info: any = {};
    
    if (mediaType === MessageType.IMAGE || mediaType === MessageType.STICKER) {
      // For images, would get dimensions
      info.width = options.width || 800;
      info.height = options.height || 600;
    } else if (mediaType === MessageType.VIDEO) {
      // For videos, would get dimensions and duration
      info.width = options.width || 1280;
      info.height = options.height || 720;
      info.duration = options.duration || 10; // seconds
    } else if (mediaType === MessageType.AUDIO) {
      // For audio, would get duration
      info.duration = options.duration || 30; // seconds
      info.ptt = options.ptt || false; // voice message flag
    }
    
    return info;
  }

  /**
   * Determine MIME type from filename
   * @param fileName File name
   * @returns MIME type
   * @private
   */
  private getMimeType(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Determine media type from MIME type
   * @param mimetype MIME type
   * @returns MessageType
   * @private
   */
  private getMediaTypeFromMimetype(mimetype: string): MessageType {
    if (mimetype.startsWith('image/')) {
      if (mimetype === 'image/webp') {
        return MessageType.STICKER;
      }
      return MessageType.IMAGE;
    } else if (mimetype.startsWith('video/')) {
      return MessageType.VIDEO;
    } else if (mimetype.startsWith('audio/')) {
      return MessageType.AUDIO;
    } else {
      return MessageType.DOCUMENT;
    }
  }
}
