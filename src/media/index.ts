import { MediaUploader } from './uploader';
import { MediaDownloader } from './downloader';
import { MessageType } from '../types';

/**
 * Media manager module
 * Handles uploading and downloading media files
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
   * Upload a media file to WhatsApp servers
   * @param media Media data (path, buffer, or URL)
   * @param options Upload options
   * @returns Promise with media upload result
   */
  async upload(media: string | Buffer, options: any = {}): Promise<any> {
    return this.uploader.upload(media, options);
  }

  /**
   * Download media from a message or URL
   * @param messageOrUrl Message object or media URL
   * @param options Download options
   * @returns Promise with media data as buffer
   */
  async download(messageOrUrl: any, options: any = {}): Promise<Buffer> {
    if (typeof messageOrUrl === 'string') {
      // If it's a URL, download directly
      return this.downloader.downloadFromUrl(messageOrUrl, options);
    } else {
      // If it's a message object, extract media info and download
      return this.downloader.downloadFromMessage(messageOrUrl, options);
    }
  }

  /**
   * Get media URL for a message
   * @param message Message object containing media
   * @returns Media URL or null if not available
   */
  getMediaUrl(message: any): string | null {
    if (!message) {
      return null;
    }

    // Check if message has media URL
    if (message.url) {
      return message.url;
    }

    // Media types that should have URLs
    const mediaTypes = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
      MessageType.DOCUMENT,
      MessageType.STICKER
    ];

    if (!mediaTypes.includes(message.type)) {
      return null;
    }

    return null;
  }

  /**
   * Get media information from a file
   * @param filePath Path to media file
   * @returns Promise with media information
   */
  async getMediaInfo(filePath: string): Promise<any> {
    return this.uploader.getMediaInfo(filePath);
  }

  /**
   * Create a thumbnail for a media file
   * @param media Media data (path, buffer, or URL)
   * @param options Thumbnail options
   * @returns Promise with thumbnail as base64 string
   */
  async createThumbnail(media: string | Buffer, options: any = {}): Promise<string> {
    return this.uploader.createThumbnail(media, options);
  }

  /**
   * Generate a voice note from audio
   * @param audio Audio data (path, buffer, or URL)
   * @returns Promise with processed audio data
   */
  async generateVoiceNote(audio: string | Buffer): Promise<Buffer> {
    // This would convert audio to the format used by WhatsApp voice notes
    // Usually this is opus in an ogg container
    
    // Simplified implementation
    if (Buffer.isBuffer(audio)) {
      return audio;
    }
    
    // If it's a path or URL, download and return
    return this.download(audio);
  }

  /**
   * Check if a file is too large for WhatsApp
   * @param sizeInBytes File size in bytes
   * @param type Media type
   * @returns Whether the file is too large
   */
  isFileTooLarge(sizeInBytes: number, type: string): boolean {
    // WhatsApp media size limits
    const limits: Record<string, number> = {
      image: 16 * 1024 * 1024, // 16 MB
      video: 16 * 1024 * 1024, // 16 MB
      audio: 16 * 1024 * 1024, // 16 MB
      document: 100 * 1024 * 1024, // 100 MB
      sticker: 500 * 1024 // 500 KB
    };
    
    const maxSize = limits[type] || limits.document;
    
    return sizeInBytes > maxSize;
  }
}

export { MediaUploader, MediaDownloader };
