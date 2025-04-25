import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { DEFAULT_WEB_URL } from '../utils/constants';

/**
 * HTTP client for WhatsApp Web API
 */
export class HttpClient {
  private client: any; // WhatsLynxClient
  private axios: AxiosInstance;
  private mediaAxios: AxiosInstance;

  /**
   * Create a new HTTP client
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
    
    // Create Axios instance for API requests
    this.axios = axios.create({
      baseURL: DEFAULT_WEB_URL,
      timeout: this.client.getOptions().connectionTimeout,
      headers: {
        'User-Agent': this.client.getOptions().userAgent,
        'Origin': 'https://web.whatsapp.com',
        'Referer': 'https://web.whatsapp.com/'
      }
    });
    
    // Create separate Axios instance for media requests (longer timeout)
    this.mediaAxios = axios.create({
      timeout: 3 * 60 * 1000, // 3 minutes
      headers: {
        'User-Agent': this.client.getOptions().userAgent,
        'Origin': 'https://web.whatsapp.com',
        'Referer': 'https://web.whatsapp.com/'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
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
   * Add authentication headers to request if authenticated
   * @param config Axios request config
   * @returns Modified config
   * @private
   */
  private addAuthHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    const sessionData = this.client.getSessionData();
    
    if (sessionData?.authCredentials) {
      const { serverToken, clientToken } = sessionData.authCredentials;
      
      if (!config.headers) {
        config.headers = new axios.AxiosHeaders();
      }
      
      if (typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${serverToken}`);
        config.headers.set('X-Client-Token', clientToken);
      } else {
        // Fallback for older Axios versions
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${serverToken}`,
          'X-Client-Token': clientToken
        } as any;
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
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    }
  }

  /**
   * Send a POST request
   * @param url URL path
   * @param data Request body
   * @param config Request configuration
   * @returns Promise with response
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.post(url, data, config);
      return response.data;
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    }
  }

  /**
   * Send a PUT request
   * @param url URL path
   * @param data Request body
   * @param config Request configuration
   * @returns Promise with response
   */
  async put(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    try {
      const response = await this.axios.put(url, data, config);
      return response.data;
    } catch (error) {
      this.handleRequestError(error);
      throw error;
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
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    }
  }

  /**
   * Download media file
   * @param url URL to download from
   * @param options Download options
   * @returns Promise with response
   */
  async downloadMedia(url: string, options: { responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' | 'stream' } = {}): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        responseType: options.responseType || 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          const { loaded, total } = progressEvent;
          this.client.emit('media.download-progress', {
            bytesTransferred: loaded,
            bytesTotal: total,
            progress: total ? loaded / total : 0
          });
        }
      };
      
      const response = await this.mediaAxios.get(url, config);
      return response.data;
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    }
  }

  /**
   * Upload media file
   * @param url URL to upload to
   * @param data File data
   * @param options Upload options
   * @returns Promise with response
   */
  async uploadMedia(url: string, data: Buffer | FormData, options: { headers?: Record<string, string> } = {}): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {
          ...options.headers
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (progressEvent) => {
          const { loaded, total } = progressEvent;
          this.client.emit('media.upload-progress', {
            bytesTransferred: loaded,
            bytesTotal: total,
            progress: total ? loaded / total : 0
          });
        }
      };
      
      const response = await this.mediaAxios.post(url, data, config);
      return response.data;
    } catch (error) {
      this.handleRequestError(error);
      throw error;
    }
  }

  /**
   * Handle request errors
   * @param error Error object
   * @private
   */
  private handleRequestError(error: any): void {
    // Emit different events based on error type
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      this.client.getOptions().logger('error', 'HTTP request error', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
      
      // Check for authentication errors
      if (error.response.status === 401 || error.response.status === 403) {
        this.client.emit('auth.failed', {
          code: 'HTTP_AUTH_ERROR',
          message: 'Authentication failed for HTTP request',
          status: error.response.status
        });
      }
    } else if (error.request) {
      // The request was made but no response was received
      this.client.getOptions().logger('error', 'No response received', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      this.client.getOptions().logger('error', 'Request setup error', error.message);
    }
  }
}
