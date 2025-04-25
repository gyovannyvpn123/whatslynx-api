import { WhatsLynxEvents } from '../types/events';
import { MessageType } from '../types';
import { generateMessageID } from '../utils/binary';
import { verifyAndDecrypt } from '../utils/encryption';
import { getErrorMessage } from '../utils/error-handler';

/**
 * Media downloading implementation
 * Handles downloading media from WhatsApp servers
 */
export class MediaDownloader {
  private client: any; // WhatsLynxClient
  private downloadQueue: Map<string, { 
    url: string, 
    mediaKey?: string, 
    resolve: Function, 
    reject: Function 
  }> = new Map();

  /**
   * Create a new media downloader
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Download media from a message
   * @param message Message object containing media
   * @param options Download options
   * @returns Promise with media data as buffer
   */
  async downloadFromMessage(message: any, options: any = {}): Promise<Buffer> {
    if (!message) {
      throw new Error('Message is required');
    }

    // Check if message has media URL
    if (!message.url) {
      throw new Error('Message does not contain a media URL');
    }

    // Check if message has a valid type
    const mediaTypes = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
      MessageType.DOCUMENT,
      MessageType.STICKER
    ];

    if (!mediaTypes.includes(message.type)) {
      throw new Error(`Cannot download media for message type: ${message.type}`);
    }

    try {
      // Generate a download ID
      const downloadId = generateMessageID();
      
      // Emit download started event
      this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_STARTED, {
        messageId: message.id,
        chatId: message.chatId,
        type: message.type,
        downloadId
      });

      // Create a promise for this download
      const downloadPromise = new Promise<Buffer>((resolve, reject) => {
        this.downloadQueue.set(downloadId, {
          url: message.url,
          mediaKey: message.mediaKey,
          resolve,
          reject
        });
      });

      // Start the download
      const mediaData = await this.downloadMedia(message.url, {
        mediaKey: message.mediaKey,
        type: message.type,
        downloadId,
        ...options
      });

      // Process downloaded data
      if (message.mediaKey && mediaData) {
        // If we have a media key, we need to decrypt the data
        const decrypted = this.decryptMedia(mediaData, message.mediaKey, message.type);
        
        if (!decrypted) {
          throw new Error('Failed to decrypt media');
        }
        
        // Emit download complete event
        this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_COMPLETE, {
          messageId: message.id,
          chatId: message.chatId,
          type: message.type,
          downloadId,
          size: decrypted.length
        });
        
        // Resolve the download
        this.resolveDownload(downloadId, decrypted);
        
        return decrypted;
      } else {
        // If no media key, return the data as is
        this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_COMPLETE, {
          messageId: message.id,
          chatId: message.chatId,
          type: message.type,
          downloadId,
          size: mediaData.length
        });
        
        // Resolve the download
        this.resolveDownload(downloadId, mediaData);
        
        return mediaData;
      }
    } catch (error) {
      // Emit download failed event
      this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_FAILED, {
        messageId: message.id,
        chatId: message.chatId,
        type: message.type,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }

  /**
   * Download media from a URL
   * @param url Media URL
   * @param options Download options
   * @returns Promise with media data as buffer
   */
  async downloadFromUrl(url: string, options: any = {}): Promise<Buffer> {
    if (!url) {
      throw new Error('URL is required');
    }

    try {
      // Generate a download ID
      const downloadId = generateMessageID();
      
      // Emit download started event
      this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_STARTED, {
        url,
        downloadId
      });

      // Create a promise for this download
      const downloadPromise = new Promise<Buffer>((resolve, reject) => {
        this.downloadQueue.set(downloadId, {
          url,
          resolve,
          reject
        });
      });

      // Start the download
      const mediaData = await this.downloadMedia(url, {
        downloadId,
        ...options
      });

      // Emit download complete event
      this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_COMPLETE, {
        url,
        downloadId,
        size: mediaData.length
      });
      
      // Resolve the download
      this.resolveDownload(downloadId, mediaData);
      
      return mediaData;
    } catch (error) {
      // Emit download failed event
      this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_FAILED, {
        url,
        error: getErrorMessage(error)
      });
      
      throw error;
    }
  }

  /**
   * Download media from URL
   * @param url Media URL
   * @param options Download options
   * @returns Promise with media data
   * @private
   */
  private async downloadMedia(url: string, options: any = {}): Promise<Buffer> {
    try {
      // Use HTTP client to download
      return await this.client.http.downloadMedia(url, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent: any) => {
          const { loaded, total } = progressEvent;
          
          // Emit progress event
          this.client.emit(WhatsLynxEvents.MEDIA_DOWNLOAD_PROGRESS, {
            downloadId: options.downloadId,
            bytesTransferred: loaded,
            bytesTotal: total,
            progress: total ? loaded / total : 0
          });
        }
      });
    } catch (error) {
      this.client.getOptions().logger('error', 'Media download failed', error);
      
      // Reject the download
      if (options.downloadId && this.downloadQueue.has(options.downloadId)) {
        const download = this.downloadQueue.get(options.downloadId)!;
        download.reject(error);
        this.downloadQueue.delete(options.downloadId);
      }
      
      throw error;
    }
  }

  /**
   * Decrypt media using mediaKey
   * @param encryptedData Encrypted media data
   * @param mediaKeyBase64 Base64 encoded media key
   * @param type Media type
   * @returns Decrypted media buffer or null if decryption fails
   * @private
   */
  private decryptMedia(encryptedData: Buffer, mediaKeyBase64: string, type: string): Buffer | null {
    try {
      // Get auth credentials
      const sessionData = this.client.getSessionData();
      
      if (!sessionData || !sessionData.authCredentials) {
        throw new Error('No authentication credentials available');
      }
      
      const { encKey, macKey } = sessionData.authCredentials;
      
      // Decode media key from base64
      const mediaKeyBuffer = Buffer.from(mediaKeyBase64, 'base64');
      
      // Get media type for HKDF info
      let mediaInfo: string;
      switch (type) {
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
      
      // Verify and decrypt the media
      // This would use the actual crypto implementation
      // using the mediaKey, encKey, and macKey
      
      return verifyAndDecrypt(encKeyBuffer, macKeyBuffer, encryptedData);
    } catch (error) {
      this.client.getOptions().logger('error', 'Media decryption failed', error);
      return null;
    }
  }

  /**
   * Resolve a download with data
   * @param downloadId Download ID
   * @param data Downloaded data
   * @private
   */
  private resolveDownload(downloadId: string, data: Buffer): void {
    if (this.downloadQueue.has(downloadId)) {
      const download = this.downloadQueue.get(downloadId)!;
      download.resolve(data);
      this.downloadQueue.delete(downloadId);
    }
  }
}
