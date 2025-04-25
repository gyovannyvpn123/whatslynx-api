/**
 * WebSocket connection to WhatsApp server
 * Handles authentication, encryption and message processing
 */
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  hmacSha256,
  computeSharedSecret,
  base64Encode,
  base64Decode,
  verifyAndDecrypt,
  generateKeyPair,
  deriveSessionKeys
} from '../utils/encryption-fixed';
import { splitBinaryMessage } from '../utils/binary-fixed';
import { WhatsLynxEvents } from '../types/events';
import { ERROR_CODES } from '../utils/constants';

/**
 * Socket connection class
 * Handles the WebSocket communication with WhatsApp servers
 */
export class SocketConnection extends EventEmitter {
  private client: any; // WhatsLynxClient
  private socket: WebSocket | null = null;
  private serverUrl: string;
  private clientId: string;
  private authenticated: boolean = false;
  private clientToken: string = '';
  private serverToken: string = '';
  private encKey: Buffer = Buffer.from([]);
  private macKey: Buffer = Buffer.from([]);
  private privateKey: Buffer;
  private publicKey: Buffer;
  private messageCallbacks: Map<string, { resolve: any, timeout: any }> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 5000;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private lastPingTime: number = 0;
  private lastPongTime: number = 0;
  private connectTimeout: any = null;
  private connectTimeoutMs: number = 10000;
  
  /**
   * Create a new socket connection
   * @param client The client instance
   * @param options Connection options
   */
  constructor(client: any, options: any = {}) {
    super();
    this.client = client;
    this.serverUrl = options.serverUrl || 'wss://web.whatsapp.com/ws';
    this.clientId = options.clientId || `WhatsLynx:${Date.now().toString(36)}`;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.connectTimeoutMs = options.connectTimeout || 10000;
    
    // Generate keys for E2E encryption
    const keys = generateKeyPair();
    this.privateKey = keys.private;
    this.publicKey = keys.public;
  }
  
  /**
   * Connect to the WhatsApp server
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clean up any existing socket
        this.disconnect();
        
        // Create a new WebSocket connection
        this.socket = new WebSocket(this.serverUrl, {
          headers: {
            'Origin': 'https://web.whatsapp.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        // Set up connection timeout
        this.connectTimeout = setTimeout(() => {
          if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
            const error = new Error('Connection timeout');
            this.client.logger('error', 'Connection timeout', error);
            this.socket.terminate();
            this.socket = null;
            reject(error);
          }
        }, this.connectTimeoutMs);
        
        // Set up event handlers
        if (this.socket) {
          this.socket.on('open', () => {
            this.client.logger('info', 'Socket connected');
            this.reconnectAttempts = 0;
            clearTimeout(this.connectTimeout);
            
            // Start ping interval
            this.startPingInterval();
            
            // Send initial handshake
            this.sendInitialHandshake().catch(error => {
              this.client.logger('error', 'Failed to send initial handshake', error);
              reject(error);
            });
            
            // Emit connect event
            this.emit('connect');
            
            // Resolve the promise
            resolve();
          });
          
          this.socket.on('message', (data: any) => {
            this.handleMessage(data);
          });
          
          this.socket.on('close', (code: number, reason: string) => {
            this.client.logger('warn', `Socket closed: ${code} - ${reason}`);
            clearTimeout(this.connectTimeout);
            this.stopPingInterval();
          
          // Emit disconnect event
          this.emit('disconnect', { code, reason });
          
          // Attempt to reconnect if configured
          if (this.client.getOptions().autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.client.logger('info', `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch(error => {
                this.client.logger('error', 'Failed to reconnect', error);
              });
            }, this.reconnectInterval);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            // Maximum reconnect attempts reached
            this.client.logger('error', 'Maximum reconnect attempts reached');
            this.client.emit(WhatsLynxEvents.DISCONNECTED, {
              reason: 'Maximum reconnect attempts reached',
              timestamp: Date.now()
            });
          }
        });
        
          this.socket.on('error', (error: any) => {
            this.client.logger('error', 'Socket error', error);
            
            // Emit error event
            this.emit('error', error);
            
            // Reject the promise if still pending
            reject(error);
          });
          
          this.socket.on('pong', () => {
            this.lastPongTime = Date.now();
            this.client.logger('debug', 'Received pong');
          });
        } // Close if(this.socket) block
      } catch (error) {
        this.client.logger('error', 'Failed to connect', error);
        reject(error);
      }
    });
  }
  
  /**
   * Disconnect from the WhatsApp server
   * @param options Disconnect options
   */
  disconnect(options: { sendLogout?: boolean } = {}): void {
    // Clear all timeouts and intervals
    clearTimeout(this.reconnectTimeout);
    this.stopPingInterval();
    clearTimeout(this.connectTimeout);
    
    // Send logout message if requested
    if (options.sendLogout && this.isConnected() && this.authenticated) {
      this.sendLogout().catch(error => {
        this.client.logger('error', 'Failed to send logout message', error);
      });
    }
    
    // Close the socket if it exists
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.close();
        } else {
          this.socket.terminate();
        }
      } catch (error) {
        this.client.logger('error', 'Error while closing socket', error);
      }
      this.socket = null;
    }
    
    // Clear authentication state
    this.authenticated = false;
  }
  
  /**
   * Check if the socket is connected
   * @returns Whether the socket is connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
  
  /**
   * Check if authenticated with the server
   * @returns Whether the client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }
  
  /**
   * Send a JSON message to the server
   * @param message JSON message to send
   * @param messageTag Optional message tag for tracking responses
   * @returns Promise that resolves when the message is sent
   */
  async sendJsonMessage(message: any, messageTag: string = ''): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('Not connected to the server');
    }
    
    try {
      // Add message tag if provided
      const taggedMessage = messageTag ? { ...message, messageTag } : message;
      
      // Serialize message to JSON
      const serialized = JSON.stringify(taggedMessage);
      
      // Log the message
      this.client.logger('debug', 'Sending JSON message', taggedMessage);
      
      // Send the message
      this.socket!.send(serialized);
      
      return taggedMessage;
    } catch (error) {
      this.client.logger('error', 'Failed to send JSON message', error);
      throw error;
    }
  }
  
  /**
   * Send a binary message to the server
   * @param message Binary message to send
   * @returns Promise that resolves when the message is sent
   */
  async sendBinaryMessage(message: Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected to the server');
    }
    
    try {
      // Log the message
      this.client.logger('debug', 'Sending binary message', { length: message.length });
      
      // Send the message
      this.socket!.send(message);
    } catch (error) {
      this.client.logger('error', 'Failed to send binary message', error);
      throw error;
    }
  }
  
  /**
   * Send a tagged message and wait for a response
   * @param message Message to send
   * @param messageTag Message tag for tracking the response
   * @param timeout Timeout in milliseconds
   * @returns Promise that resolves with the response
   */
  async sendTaggedMessage(message: any, messageTag: string, timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // Create a timeout handler
        const timeoutHandler = setTimeout(() => {
          if (this.messageCallbacks.has(messageTag)) {
            this.messageCallbacks.delete(messageTag);
            reject(new Error(`Timeout waiting for response to message: ${messageTag}`));
          }
        }, timeout);
        
        // Store the callback
        this.messageCallbacks.set(messageTag, { resolve, timeout: timeoutHandler });
        
        // Send the message
        this.sendJsonMessage(message, messageTag).catch(error => {
          clearTimeout(timeoutHandler);
          this.messageCallbacks.delete(messageTag);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Start the ping interval to keep the connection alive
   * @private
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.lastPingTime = Date.now();
    this.lastPongTime = Date.now();
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        try {
          this.lastPingTime = Date.now();
          this.socket!.ping();
          this.client.logger('debug', 'Sent ping');
          
          // Check if we've received pongs
          const pongDiff = this.lastPingTime - this.lastPongTime;
          if (pongDiff > 30000) {
            this.client.logger('warn', 'No pongs received for 30s, reconnecting...');
            this.reconnectIfNeeded();
          }
        } catch (error) {
          this.client.logger('error', 'Error sending ping', error);
          this.reconnectIfNeeded();
        }
      } else {
        this.reconnectIfNeeded();
      }
    }, 25000); // 25 seconds ping interval
  }
  
  /**
   * Stop the ping interval
   * @private
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  /**
   * Reconnect if needed and not already reconnecting
   * @private
   */
  private reconnectIfNeeded(): void {
    if (!this.reconnectTimeout && this.client.getOptions().autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.client.logger('info', 'Connection seems dead, attempting to reconnect...');
      this.reconnectAttempts++;
      
      // Close the current socket
      if (this.socket) {
        try {
          this.socket.terminate();
        } catch (error) {
          // Ignore errors during terminate
        }
        this.socket = null;
      }
      
      // Attempt to reconnect
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.connect().catch(error => {
          this.client.logger('error', 'Failed to reconnect', error);
        });
      }, this.reconnectInterval);
    }
  }
  
  /**
   * Send initial handshake message
   * @private
   */
  private async sendInitialHandshake(): Promise<void> {
    const handshake = {
      type: 'init',
      client: this.clientId,
      publicKey: base64Encode(this.publicKey),
      protocol: 4 // Protocol version
    };
    
    await this.sendJsonMessage(handshake);
  }
  
  /**
   * Handle a message from the server
   * @param data Message data
   * @private
   */
  private handleMessage(data: any): void {
    // Check if it's a JSON message or binary
    if (typeof data === 'string') {
      try {
        const jsonMessage = JSON.parse(data);
        this.handleJsonMessage(jsonMessage);
      } catch (error) {
        this.client.logger('error', 'Failed to parse JSON message', { data, error });
      }
      return;
    }
    
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      
      try {
        // Decrypt the message if encryption is set up
        let decrypted = buffer;
        if (this.encKey.length > 0 && this.macKey.length > 0) {
          // Keys are initialized and valid
          try {
            decrypted = verifyAndDecrypt(buffer, this.encKey, this.macKey);
          } catch (error) {
            // Log the error but continue with the original buffer
            this.client.logger('error', 'Failed to decrypt message', error);
          }
        }
        
        // Split and process the message nodes
        const nodes = splitBinaryMessage(decrypted);
        for (const node of nodes) {
          this.handleBinaryNode(node);
        }
      } catch (error) {
        this.client.logger('error', 'Failed to process binary message', error);
      }
    }
  }
  
  /**
   * Handle a JSON message from the server
   * @param data JSON message data
   * @private
   */
  private handleJsonMessage(data: any): void {
    // Check if this is a response to a tagged message
    if (data.messageTag && this.messageCallbacks.has(data.messageTag)) {
      const { resolve, timeout } = this.messageCallbacks.get(data.messageTag)!;
      clearTimeout(timeout);
      resolve(data);
      this.messageCallbacks.delete(data.messageTag);
      return;
    }
    
    // Handle specific message types
    switch (data.type) {
      case 'error':
        this.handleErrorMessage(data, null);
        break;
        
      case 'auth':
        // Handle auth-related JSON message
        this.emit('auth', data);
        break;
        
      case 'pong':
        // No need to do anything, already handled by WebSocket pong event
        break;
        
      default:
        // Forward the message to any listeners
        this.emit(data.type, data);
        break;
    }
  }
  
  /**
   * Handle a binary node from the server
   * @param node Binary node
   * @private
   */
  private handleBinaryNode(node: any[]): void {
    if (!Array.isArray(node) || node.length < 3) {
      return; // Invalid node
    }
    
    const [tag, attributes, content] = node;
    
    // Check if this is a response to a tagged message
    if (attributes && attributes.id && this.messageCallbacks.has(attributes.id)) {
      const { resolve, timeout } = this.messageCallbacks.get(attributes.id)!;
      clearTimeout(timeout);
      resolve({ tag, attributes, content });
      this.messageCallbacks.delete(attributes.id);
      return;
    }
    
    // Handle different node types
    switch (tag) {
      case 's':
        this.handleServerHello(attributes, content);
        break;
        
      case 'challenge':
        this.handleChallenge(attributes, content);
        break;
        
      case 'success':
        this.handleAuthSuccess(attributes, content);
        break;
        
      case 'failure':
        this.handleAuthFailure(attributes, content);
        break;
        
      case 'stream:error':
        this.handleStreamError(attributes, content);
        break;
        
      case 'pairing-code':
        this.handlePairingCode(attributes, content);
        break;
        
      case 'message':
        this.handleMessageNode(attributes, content);
        break;
        
      case 'presence':
        this.handlePresence(attributes, content);
        break;
        
      case 'notification':
        this.handleNotification(attributes, content);
        break;
        
      case 'receipt':
        this.handleReceipt(attributes, content);
        break;
        
      default:
        // Forward the node to any listeners
        this.emit(tag, { tag, attributes, content });
        break;
    }
  }
  
  /**
   * Handle server hello message
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleServerHello(attributes: any, content: any): void {
    this.client.logger('debug', 'Received server hello');
    
    // Extract server information if available
    if (attributes) {
      if (attributes.serverVersion) {
        this.client.logger('info', `Server version: ${attributes.serverVersion}`);
      }
    }
    
    // Emit the server hello event
    this.emit('server-hello', attributes);
  }
  
  /**
   * Handle authentication challenge
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleChallenge(attributes: any, content: any): void {
    this.client.logger('debug', 'Received authentication challenge');
    
    // Extract challenge data
    if (content && attributes) {
      // Respond to the challenge
      this.respondToChallenge(content).catch(error => {
        this.client.logger('error', 'Failed to respond to challenge', error);
      });
    }
  }
  
  /**
   * Handle authentication success
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleAuthSuccess(attributes: any, content: any): void {
    this.client.logger('info', 'Authentication successful');
    
    // Extract authentication data
    if (attributes) {
      this.clientToken = attributes.clientToken || this.clientToken;
      this.serverToken = attributes.serverToken || this.serverToken;
      
      // Set up encryption keys if provided
      if (attributes.encKey && attributes.macKey) {
        this.encKey = base64Decode(attributes.encKey);
        this.macKey = base64Decode(attributes.macKey);
      }
      
      // Update authentication state
      this.authenticated = true;
      
      // Emit authentication success event
      this.emit('authenticated', {
        ...attributes,
        timestamp: Date.now()
      });
      
      // Notify the client
      this.client.emit(WhatsLynxEvents.AUTHENTICATED, {
        ...attributes,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Handle authentication failure
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleAuthFailure(attributes: any, content: any): void {
    this.client.logger('error', 'Authentication failed', attributes);
    
    // Extract failure reason
    const reason = attributes?.reason || 'unknown';
    
    // Emit authentication failure event
    this.emit('auth-failure', {
      reason,
      attributes,
      timestamp: Date.now()
    });
    
    // Notify the client
    this.client.emit(WhatsLynxEvents.AUTH_FAILED, {
      reason,
      attributes,
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle stream error
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleStreamError(attributes: any, content: any): void {
    this.client.logger('error', 'Stream error', { attributes, content });
    
    // Extract error information
    const errorCode = attributes?.code || 'unknown';
    const errorText = attributes?.text || 'Unknown stream error';
    
    // Emit stream error event
    this.emit('stream-error', {
      code: errorCode,
      text: errorText,
      attributes,
      timestamp: Date.now()
    });
    
    // Notify the client
    this.client.emit(WhatsLynxEvents.CONNECTION_ERROR, {
      code: errorCode,
      message: errorText,
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle pairing code response
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handlePairingCode(attributes: any, content: any): void {
    this.client.logger('info', 'Received pairing code', attributes);
    
    // Extract pairing code data
    if (attributes) {
      const pairingCodeData = {
        pairingCode: attributes.code,
        pairingCodeExpiresAt: Date.now() + (attributes.expiration || 300) * 1000,
        phoneNumber: attributes.phoneNumber || '',
        method: attributes.method || 'multi-device',
        timestamp: Date.now()
      };
      
      // Emit pairing code event
      this.emit('pairing-code', pairingCodeData);
    }
  }
  
  /**
   * Handle incoming message node
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleMessageNode(attributes: any, content: any): void {
    // Forward to the message receiver for processing
    this.emit('raw-message', { attributes, content });
  }
  
  /**
   * Handle presence update
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handlePresence(attributes: any, content: any): void {
    // Forward the presence update
    this.emit('presence', { attributes, content });
  }
  
  /**
   * Handle notification
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleNotification(attributes: any, content: any): void {
    // Forward the notification
    this.emit('notification', { attributes, content });
  }
  
  /**
   * Handle message receipt
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleReceipt(attributes: any, content: any): void {
    // Forward the receipt
    this.emit('receipt', { attributes, content });
  }
  
  /**
   * Handle error message
   * @param data Error message data
   * @param extraData Additional error data (optional)
   * @private
   */
  private handleErrorMessage(data: any, extraData: any = null): void {
    const errorCode = data.code || ERROR_CODES.UNKNOWN_ERROR;
    const errorMessage = data.message || 'Unknown error';
    
    this.client.logger('error', `Server error: ${errorCode} - ${errorMessage}`, data);
    
    // Emit error event
    this.emit('error', {
      code: errorCode,
      message: errorMessage,
      data
    });
    
    // Notify the client
    this.client.emit(WhatsLynxEvents.ERROR, {
      code: errorCode,
      message: errorMessage,
      data
    });
  }
  
  /**
   * Respond to an authentication challenge
   * @param challenge Challenge data
   * @private
   */
  private async respondToChallenge(challenge: any): Promise<void> {
    try {
      // Decode the challenge if it's a string
      const challengeData = typeof challenge === 'string' 
        ? Buffer.from(challenge, 'base64') 
        : challenge;
      
      // Generate a response using our keys
      const sharedSecret = computeSharedSecret(this.privateKey, challengeData);
      const response = hmacSha256(challengeData, sharedSecret);
      
      // Send the challenge response
      await this.sendTaggedMessage({
        type: 'auth',
        challenge: base64Encode(response),
        clientId: this.clientId,
        publicKey: base64Encode(this.publicKey)
      }, `auth_${Date.now()}`);
      
    } catch (error) {
      this.client.logger('error', 'Failed to respond to challenge', error);
      throw error;
    }
  }
  
  /**
   * Send a logout message
   * @private
   */
  private async sendLogout(): Promise<void> {
    if (!this.isConnected() || !this.authenticated) {
      return;
    }
    
    try {
      await this.sendTaggedMessage({
        type: 'logout',
        clientToken: this.clientToken,
        serverToken: this.serverToken
      }, `logout_${Date.now()}`);
    } catch (error) {
      this.client.logger('error', 'Failed to send logout message', error);
      throw error;
    }
  }
}