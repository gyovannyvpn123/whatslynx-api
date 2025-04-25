import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { WhatsLynxError } from '../utils/error-handler';

/**
 * HTTP client implementation
 * Handles HTTP requests to WhatsApp servers with authentication
 */
export class HttpClient {
  private axios: AxiosInstance;
  private mediaAxios: AxiosInstance;
  private client: any; // WhatsLynxClient

  /**
   * Create a new HTTP client
   * @param client WhatsApp client instance
   * @param baseURL Base URL for API requests
   * @param mediaURL Base URL for media requests
   */
  constructor(client: any, baseURL: string = 'https://web.whatsapp.com', mediaURL: string = 'https://mmg.whatsapp.net') {
    this.client = client;
    
    // Create Axios instances for API and media
    this.axios = axios.create({
      baseURL,
      headers: {
        'User-Agent': 'WhatsLynx/1.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    this.mediaAxios = axios.create({
      baseURL: mediaURL,
      headers: {
        'User-Agent': 'WhatsLynx/1.0.0',
        'Accept': '*/*'
      },
      timeout: 60000,
      responseType: 'arraybuffer'
    });
    
    // Add request interceptor for authentication
    this.axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      return this.addAuthHeaders(config);
    });
    
    this.mediaAxios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      return this.addAuthHeaders(config);
    });
  }

  /**
   * Add authentication headers to requests
   * @param config Request config
   * @returns Updated request config
   * @private
   */
  private addAuthHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    const sessionData = this.client.getSessionData();
    
    // Add auth headers if available
    if (sessionData?.authCredentials?.serverToken && sessionData?.authCredentials?.clientToken) {
      const { serverToken, clientToken } = sessionData.authCredentials;
      
      // Ensure headers is initialized as AxiosHeaders
      if (!config.headers) {
        // Using constructor properly for type safety
        config.headers = new axios.AxiosHeaders();
      }
      
      // Use the set method to ensure type safety
      if (typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${serverToken}`);
        config.headers.set('X-Client-Token', clientToken);
      } else {
        // Fallback for older Axios versions but we'll avoid using it
        // Setting headers in a more TypeScript-friendly way
        if (typeof config.headers === 'object') {
          const headers = config.headers as Record<string, any>;
          headers['Authorization'] = `Bearer ${serverToken}`;
          headers['X-Client-Token'] = clientToken;
        }
      }
    }
    
    return config;
  }

  /**
   * Send a GET request
   * @param url URL path
   * @param config Request configuration
   * @returns Promise with response
   */
  async get(url: string, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.get(url, config);
      return response.data;
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'HTTP GET request failed',
        error.response?.data?.code || 'HTTP_GET_ERROR'
      );
    }
  }

  /**
   * Send a POST request
   * @param url URL path
   * @param data Request body
   * @param config Request configuration
   * @returns Promise with response
   */
  async post(url: string, data: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.post(url, data, config);
      return response.data;
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'HTTP POST request failed',
        error.response?.data?.code || 'HTTP_POST_ERROR'
      );
    }
  }

  /**
   * Send a PUT request
   * @param url URL path
   * @param data Request body
   * @param config Request configuration
   * @returns Promise with response
   */
  async put(url: string, data: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.put(url, data, config);
      return response.data;
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'HTTP PUT request failed',
        error.response?.data?.code || 'HTTP_PUT_ERROR'
      );
    }
  }

  /**
   * Send a DELETE request
   * @param url URL path
   * @param config Request configuration
   * @returns Promise with response
   */
  async delete(url: string, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.delete(url, config);
      return response.data;
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'HTTP DELETE request failed',
        error.response?.data?.code || 'HTTP_DELETE_ERROR'
      );
    }
  }

  /**
   * Download media from URL
   * @param url Media URL
   * @param config Request configuration
   * @returns Promise with media data as buffer
   */
  async downloadMedia(url: string, config?: AxiosRequestConfig): Promise<Buffer> {
    try {
      const response = await this.mediaAxios.get(url, config);
      return Buffer.from(response.data);
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'Media download failed',
        error.response?.data?.code || 'MEDIA_DOWNLOAD_ERROR'
      );
    }
  }

  /**
   * Upload media to WhatsApp servers
   * @param url Upload URL
   * @param data Media data
   * @param options Upload options
   * @returns Promise with upload result
   */
  async uploadMedia(url: string, data: Buffer, options: any = {}): Promise<any> {
    try {
      const formData = new FormData();
      
      // Append media data
      const blob = new Blob([data], { type: options.mimetype || 'application/octet-stream' });
      formData.append('file', blob, options.filename || 'file');
      
      // Append additional fields
      Object.keys(options).forEach(key => {
        if (key !== 'file' && key !== 'filename' && key !== 'mimetype') {
          formData.append(key, options[key]);
        }
      });
      
      const response = await this.mediaAxios.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      return response.data;
    } catch (error: any) {
      throw new WhatsLynxError(
        error.response?.data?.message || error.message || 'Media upload failed',
        error.response?.data?.code || 'MEDIA_UPLOAD_ERROR'
      );
    }
  }
}