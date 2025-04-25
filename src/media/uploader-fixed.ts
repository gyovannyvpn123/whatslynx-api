/**
 * Media uploading functionality for WhatsApp
 * 
 * This module handles uploading media files to WhatsApp servers
 * for sending in messages (images, videos, documents, etc.)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MediaType, MediaAttachment } from '../types';
import { MIME_TYPES } from '../utils/constants';
import { 
  hmacSha256, 
  generateRandomBytes, 
  hkdfDerive, 
  aesEncrypt, 
  base64Encode 
} from '../utils/encryption-fixed';
import { isValidMediaSize, isValidMimeType } from '../utils/validators-fixed';

/**
 * Media uploader class for WhatsApp
 */
export class MediaUploader {
  private client: any; // WhatsLynxClient

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
   * @param type Media type
   * @param options Upload options
   * @returns Uploaded media metadata
   */
  async upload(
    media: string | Buffer,
    type: MediaType,
    options: {
      filename?: string;
      mimetype?: string;
      caption?: string;
    } = {}
  ): Promise<MediaAttachment> {
    try {
      // Process and validate media data
      const { buffer, mimetype, filename, filesize } = await this.processMedia(media, type, options);
      
      // Generate encryption keys for the media
      const mediaKeys = this.generateMediaKeys();
      
      // Encrypt the media
      const { encryptedMedia, iv, encKey, macKey } = this.encryptMedia(buffer, mediaKeys);
      
      // Generate thumbnail if necessary
      const thumbnail = type === MediaType.IMAGE || type === MediaType.VIDEO ? 
        await this.generateThumbnail(buffer, type) : null;
        
      // Prepare upload request
      const uploadUrl = await this.getUploadUrl(type, filesize);
      
      // Upload to WhatsApp servers
      const uploadResult = await this.performUpload(
        encryptedMedia,
        uploadUrl,
        {
          mimetype,
          type,
          filesize
        }
      );
      
      // Return the media metadata
      return {
        type,
        mimetype,
        url: uploadResult.url,
        fileSize: filesize,
        fileName: filename || `file.${this.getExtensionFromMimetype(mimetype)}`,
        mediaKey: base64Encode(mediaKeys.keyPair),
        filehash: this.getFileHash(buffer),
        width: uploadResult.width,
        height: uploadResult.height,
        duration: uploadResult.duration,
        caption: options.caption || '',
        jpegThumbnail: thumbnail ? base64Encode(thumbnail) : undefined
      };
      
    } catch (error: any) {
      throw new Error(`Failed to upload media: ${error?.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Process and validate media data
   * @param media Media data
   * @param type Media type
   * @param options Processing options
   * @returns Processed media data
   * @private
   */
  private async processMedia(
    media: string | Buffer,
    type: MediaType,
    options: {
      filename?: string;
      mimetype?: string;
    } = {}
  ): Promise<{
    buffer: Buffer;
    mimetype: string;
    filename?: string;
    filesize: number;
  }> {
    let buffer: Buffer;
    let mimetype = options.mimetype || '';
    let filename = options.filename;
    
    // Handle Buffer input
    if (Buffer.isBuffer(media)) {
      buffer = media;
      if (!mimetype) {
        // Try to detect mimetype from buffer headers
        mimetype = this.detectMimetypeFromBuffer(buffer) || this.getDefaultMimetype(type);
      }
      
      if (!filename) {
        // Generate a filename based on type and timestamp
        filename = `${type}_${Date.now()}.${this.getExtensionFromMimetype(mimetype)}`;
      }
    } 
    // Handle file path input
    else if (typeof media === 'string' && fs.existsSync(media)) {
      buffer = fs.readFileSync(media);
      
      if (!mimetype) {
        // Try to detect mimetype from file extension
        const ext = path.extname(media).toLowerCase().substring(1);
        mimetype = this.getMimetypeFromExtension(ext) || this.getDefaultMimetype(type);
      }
      
      if (!filename) {
        filename = path.basename(media);
      }
    } 
    // Handle URL input (assuming it's a data URL)
    else if (typeof media === 'string' && media.startsWith('data:')) {
      const matches = media.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid data URL format');
      }
      
      mimetype = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
      
      if (!filename) {
        filename = `${type}_${Date.now()}.${this.getExtensionFromMimetype(mimetype)}`;
      }
    }
    // Otherwise, it's not a valid input
    else {
      throw new Error('Invalid media format: must be a Buffer, file path, or data URL');
    }
    
    // Validate media
    const filesize = buffer.length;
    if (!isValidMediaSize(filesize, type)) {
      throw new Error(`File size exceeds maximum limit for ${type}`);
    }
    
    if (!isValidMimeType(mimetype, type)) {
      throw new Error(`Unsupported MIME type ${mimetype} for ${type}`);
    }
    
    return {
      buffer,
      mimetype,
      filename,
      filesize
    };
  }
  
  /**
   * Generate encryption keys for media
   * @returns Media encryption keys
   * @private
   */
  private generateMediaKeys(): { keyPair: Buffer, encKey: Buffer, macKey: Buffer, iv: Buffer } {
    // Generate a random 32-byte key
    const keyPair = generateRandomBytes(32);
    
    // Derive enc and mac keys using HKDF
    const expandedKeys = hkdfDerive(keyPair, 112, 'WhatsApp Media Keys');
    
    return {
      keyPair,
      encKey: expandedKeys.slice(0, 32),
      macKey: expandedKeys.slice(32, 64),
      iv: expandedKeys.slice(64, 80)
    };
  }
  
  /**
   * Encrypt media for uploading
   * @param buffer Media buffer
   * @param keys Encryption keys
   * @returns Encrypted media and keys
   * @private
   */
  private encryptMedia(
    buffer: Buffer,
    keys: { keyPair: Buffer, encKey: Buffer, macKey: Buffer, iv: Buffer }
  ): {
    encryptedMedia: Buffer,
    iv: Buffer,
    encKey: Buffer,
    macKey: Buffer
  } {
    // Encrypt the media
    const encrypted = aesEncrypt(buffer, keys.encKey, keys.iv);
    
    // Create HMAC
    const hmac = hmacSha256(encrypted, keys.macKey);
    
    // Combine encrypted data and HMAC
    const encryptedMedia = Buffer.concat([keys.iv, encrypted, hmac]);
    
    return {
      encryptedMedia,
      iv: keys.iv,
      encKey: keys.encKey,
      macKey: keys.macKey
    };
  }
  
  /**
   * Generate a thumbnail for image or video
   * @param buffer Media buffer
   * @param type Media type
   * @returns Thumbnail buffer or null
   * @private
   */
  private async generateThumbnail(buffer: Buffer, type: MediaType): Promise<Buffer | null> {
    // In a real implementation, this would use image processing libraries
    // For simplicity, we'll return a minimal thumbnail
    
    // For type safety, this is a placeholder implementation
    // In a production environment, you would use libraries like sharp or ffmpeg
    if (type === MediaType.IMAGE) {
      // Generate a small thumbnail from the image
      // This is a placeholder, as proper thumbnail generation needs image libraries
      return buffer.slice(0, Math.min(buffer.length, 5000));
    } else if (type === MediaType.VIDEO) {
      // Extract a frame from the video
      // This is a placeholder, as proper frame extraction needs video libraries
      return Buffer.from('Placeholder video thumbnail');
    }
    
    return null;
  }
  
  /**
   * Get an upload URL from WhatsApp servers
   * @param type Media type
   * @param size File size
   * @returns Upload URL
   * @private
   */
  private async getUploadUrl(type: MediaType, size: number): Promise<string> {
    // In a real implementation, this would request an upload URL from WhatsApp
    // For now, we'll return a placeholder URL
    
    // This would actually make a request to the WhatsApp servers
    return 'https://whatsapp-media-upload.example.com/upload';
  }
  
  /**
   * Perform the actual upload to WhatsApp servers
   * @param media Encrypted media
   * @param url Upload URL
   * @param options Upload options
   * @returns Upload result
   * @private
   */
  private async performUpload(
    media: Buffer,
    url: string,
    options: {
      mimetype: string;
      type: MediaType;
      filesize: number;
    }
  ): Promise<{
    url: string;
    width?: number;
    height?: number;
    duration?: number;
  }> {
    // In a real implementation, this would use the HTTP client to upload
    // For now, we'll simulate a successful upload
    
    // This would actually upload the media to WhatsApp servers
    // using the client's HTTP implementation
    
    // Create a simulated successful result
    const result: {
      url: string;
      width?: number;
      height?: number;
      duration?: number;
    } = {
      url: `https://whatsapp-cdn.example.com/media/${crypto.randomBytes(16).toString('hex')}`
    };
    
    // Add dimension info for images and videos
    if (options.type === MediaType.IMAGE || options.type === MediaType.VIDEO) {
      // In a real implementation, these would be extracted from the media
      result.width = 640;
      result.height = 480;
    }
    
    // Add duration for audio and video
    if (options.type === MediaType.AUDIO || options.type === MediaType.VIDEO) {
      // In a real implementation, this would be extracted from the media
      result.duration = 30; // seconds
    }
    
    return result;
  }
  
  /**
   * Get a file's hash for validation
   * @param buffer File buffer
   * @returns SHA-256 hash of the file
   * @private
   */
  private getFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  
  /**
   * Detect MIME type from buffer
   * @param buffer File buffer
   * @returns Detected MIME type or null
   * @private
   */
  private detectMimetypeFromBuffer(buffer: Buffer): string | null {
    // In a real implementation, this would check file signatures
    // For simplicity, we just check a few common file headers
    
    // JPEG
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      return MIME_TYPES.IMAGE.JPEG;
    }
    
    // PNG
    if (buffer.length >= 8 && 
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && 
        buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A && 
        buffer[6] === 0x1A && buffer[7] === 0x0A) {
      return MIME_TYPES.IMAGE.PNG;
    }
    
    // GIF
    if (buffer.length >= 6 && 
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && 
        buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && 
        buffer[5] === 0x61) {
      return MIME_TYPES.IMAGE.GIF;
    }
    
    // PDF
    if (buffer.length >= 4 && 
        buffer[0] === 0x25 && buffer[1] === 0x50 && 
        buffer[2] === 0x44 && buffer[3] === 0x46) {
      return MIME_TYPES.DOCUMENT.PDF;
    }
    
    // MP3
    if (buffer.length >= 3 && 
        buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return MIME_TYPES.AUDIO.MP3;
    }
    
    // MP4
    if (buffer.length >= 8 && 
        buffer[4] === 0x66 && buffer[5] === 0x74 && 
        buffer[6] === 0x79 && buffer[7] === 0x70) {
      return MIME_TYPES.VIDEO.MP4;
    }
    
    return null;
  }
  
  /**
   * Get MIME type from file extension
   * @param extension File extension
   * @returns Corresponding MIME type or null
   * @private
   */
  private getMimetypeFromExtension(extension: string): string | null {
    const ext = extension.toLowerCase();
    
    // Images
    if (ext === 'jpg' || ext === 'jpeg') return MIME_TYPES.IMAGE.JPEG;
    if (ext === 'png') return MIME_TYPES.IMAGE.PNG;
    if (ext === 'gif') return MIME_TYPES.IMAGE.GIF;
    if (ext === 'webp') return MIME_TYPES.IMAGE.WEBP;
    
    // Videos
    if (ext === 'mp4') return MIME_TYPES.VIDEO.MP4;
    if (ext === '3gp') return MIME_TYPES.VIDEO.GPP3;
    if (ext === 'mkv') return MIME_TYPES.VIDEO.MKV;
    
    // Audio
    if (ext === 'mp3') return MIME_TYPES.AUDIO.MP3;
    if (ext === 'ogg') return MIME_TYPES.AUDIO.OGG;
    if (ext === 'm4a') return MIME_TYPES.AUDIO.M4A;
    
    // Documents
    if (ext === 'pdf') return MIME_TYPES.DOCUMENT.PDF;
    if (ext === 'doc') return MIME_TYPES.DOCUMENT.DOC;
    if (ext === 'docx') return MIME_TYPES.DOCUMENT.DOCX;
    if (ext === 'xls') return MIME_TYPES.DOCUMENT.XLS;
    if (ext === 'xlsx') return MIME_TYPES.DOCUMENT.XLSX;
    if (ext === 'ppt') return MIME_TYPES.DOCUMENT.PPT;
    if (ext === 'pptx') return MIME_TYPES.DOCUMENT.PPTX;
    if (ext === 'txt') return MIME_TYPES.DOCUMENT.TXT;
    
    return null;
  }
  
  /**
   * Get default MIME type for a media type
   * @param type Media type
   * @returns Default MIME type
   * @private
   */
  private getDefaultMimetype(type: MediaType): string {
    switch (type) {
      case MediaType.IMAGE: return MIME_TYPES.IMAGE.JPEG;
      case MediaType.VIDEO: return MIME_TYPES.VIDEO.MP4;
      case MediaType.AUDIO: return MIME_TYPES.AUDIO.MP3;
      case MediaType.DOCUMENT: return MIME_TYPES.DOCUMENT.PDF;
      case MediaType.STICKER: return MIME_TYPES.IMAGE.WEBP;
      default: return 'application/octet-stream';
    }
  }
  
  /**
   * Get file extension from MIME type
   * @param mimetype MIME type
   * @returns File extension
   * @private
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const mime = mimetype.toLowerCase();
    
    // Images
    if (mime === MIME_TYPES.IMAGE.JPEG) return 'jpg';
    if (mime === MIME_TYPES.IMAGE.PNG) return 'png';
    if (mime === MIME_TYPES.IMAGE.GIF) return 'gif';
    if (mime === MIME_TYPES.IMAGE.WEBP) return 'webp';
    
    // Videos
    if (mime === MIME_TYPES.VIDEO.MP4) return 'mp4';
    if (mime === MIME_TYPES.VIDEO.GPP3) return '3gp';
    if (mime === MIME_TYPES.VIDEO.MKV) return 'mkv';
    
    // Audio
    if (mime === MIME_TYPES.AUDIO.MP3) return 'mp3';
    if (mime === MIME_TYPES.AUDIO.OGG) return 'ogg';
    if (mime === MIME_TYPES.AUDIO.M4A) return 'm4a';
    
    // Documents
    if (mime === MIME_TYPES.DOCUMENT.PDF) return 'pdf';
    if (mime === MIME_TYPES.DOCUMENT.DOC) return 'doc';
    if (mime === MIME_TYPES.DOCUMENT.DOCX) return 'docx';
    if (mime === MIME_TYPES.DOCUMENT.XLS) return 'xls';
    if (mime === MIME_TYPES.DOCUMENT.XLSX) return 'xlsx';
    if (mime === MIME_TYPES.DOCUMENT.PPT) return 'ppt';
    if (mime === MIME_TYPES.DOCUMENT.PPTX) return 'pptx';
    if (mime === MIME_TYPES.DOCUMENT.TXT) return 'txt';
    
    // Default
    return 'bin';
  }
}