/**
 * Media manager for WhatsApp
 * 
 * This module provides a unified interface for all media operations
 * including uploading, downloading, and processing media files.
 */
import { MediaUploader } from './uploader-fixed';
import { MediaDownloader } from './downloader-fixed';
import { MediaType, MediaAttachment } from '../types';

/**
 * Media manager class for WhatsApp
 */
export class MediaManager {
  private client: any; // WhatsLynxClient
  private uploader: MediaUploader;
  private downloader: MediaDownloader;

  /**
   * Create a new media manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    this.uploader = new MediaUploader(client);
    this.downloader = new MediaDownloader(client);
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
    return this.uploader.upload(media, type, options);
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
    return this.downloader.download(message, options);
  }

  /**
   * Process image before sending
   * @param image Image buffer
   * @param options Processing options
   * @returns Processed image buffer
   */
  async processImage(
    image: Buffer,
    options: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'jpeg' | 'png' | 'webp';
    } = {}
  ): Promise<Buffer> {
    // In a real implementation, this would use an image processing library
    // For now, we'll just return the original buffer
    return image;
  }

  /**
   * Create a sticker from an image or video
   * @param media Media data (path, buffer, or URL)
   * @param options Sticker options
   * @returns Sticker media metadata
   */
  async createSticker(
    media: string | Buffer,
    options: {
      pack?: string;
      author?: string;
      categories?: string[];
      quality?: number;
    } = {}
  ): Promise<MediaAttachment> {
    // In a real implementation, this would convert the image to a WebP sticker
    // For now, we'll just upload it as an image
    
    // Process the image
    let buffer: Buffer;
    if (Buffer.isBuffer(media)) {
      buffer = media;
    } else {
      // Assume it's a file path and read it
      const fs = require('fs');
      buffer = fs.readFileSync(media);
    }
    
    // Upload as a sticker
    return this.uploader.upload(buffer, MediaType.STICKER, {
      mimetype: 'image/webp'
    });
  }

  /**
   * Extract thumbnail from a media message
   * @param message Message containing media
   * @returns Thumbnail buffer
   */
  async extractThumbnail(message: any): Promise<Buffer | null> {
    if (!message || !message.content || !message.content.jpegThumbnail) {
      return null;
    }
    
    try {
      // If it's a base64 string, decode it
      if (typeof message.content.jpegThumbnail === 'string') {
        return Buffer.from(message.content.jpegThumbnail, 'base64');
      }
      
      // If it's already a buffer, return it
      if (Buffer.isBuffer(message.content.jpegThumbnail)) {
        return message.content.jpegThumbnail;
      }
      
      return null;
    } catch (error) {
      this.client.logger('error', 'Failed to extract thumbnail', error);
      return null;
    }
  }

  /**
   * Get media type from message
   * @param message Message to check
   * @returns Media type or null if not a media message
   */
  getMediaType(message: any): MediaType | null {
    if (!message || !message.type) {
      return null;
    }
    
    switch (message.type) {
      case 'image':
        return MediaType.IMAGE;
      case 'video':
        return MediaType.VIDEO;
      case 'audio':
        return MediaType.AUDIO;
      case 'document':
        return MediaType.DOCUMENT;
      case 'sticker':
        return MediaType.STICKER;
      default:
        return null;
    }
  }

  /**
   * Check if a message contains downloadable media
   * @param message Message to check
   * @returns True if message contains downloadable media
   */
  hasMedia(message: any): boolean {
    return (
      message && 
      message.content && 
      message.content.url && 
      message.content.mediaKey && 
      this.getMediaType(message) !== null
    );
  }
}