import EventEmitter from 'events';
import * as WebSocket from 'ws';
import { DEFAULT_WEBSOCKET_URL, PROTOCOL, ERROR_CODES } from '../utils/constants';
import { 
  generateMessageID, 
  joinBinaryMessage, 
  serializeNode, 
  splitBinaryMessage, 
  createMessageNode,
  bufferToString,
  stringToBuffer
} from '../utils/binary-fixed';
import { ConnectionState, WhatsLynxEvents } from '../types';
import { 
  base64Encode, 
  base64Decode,
  generateKeyPair, 
  computeSharedSecret, 
  generateRandomBytes, 
  hmacSha256
} from '../utils/encryption';

import {
  encryptAndSignToBuffer,
  verifyAndDecryptFromBuffer
} from '../utils/encryption-helpers';

const VERSION = [2, 2318, 11];

/**
 * WebSocket connection manager for WhatsApp Web
 * Handles the WebSocket connection to WhatsApp servers
 * and implements the WhatsApp Web protocol
 */
export class SocketConnection extends EventEmitter {
  private client: any; // WhatsLynxClient
  private socket: WebSocket | null = null;
  private isClosing: boolean = false;
  private messageQueue: any[] = [];
  private messageCallbacks: Map<string, { 
    resolve: Function, 
    reject: Function, 
    timeout: NodeJS.Timeout 
  }> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Authentication and encryption
  private clientId: string | null = null;
  private clientToken: string | null = null;
  private serverToken: string | null = null;
  private privateKey: any = null;
  private publicKey: any = null;
  private encKey: Buffer = Buffer.alloc(0);
  private macKey: Buffer = Buffer.alloc(0);
  private authenticated: boolean = false;
  private connectionStartTime: number = 0;
  private reconnectAttempts: number = 0;
  
  // Connection state tracking
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  
  /**
   * Create a new WebSocket connection manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
  }
  
  /**
   * Connect to the WhatsApp WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return; // Already connected
    }
    
    this.setConnectionState(ConnectionState.CONNECTING);
    this.connectionStartTime = Date.now();
    this.isClosing = false;
    
    try {
      // Get WebSocket URL from options or use default
      const options = this.client.getOptions();
      const websocketUrl = options.websocketUrl || DEFAULT_WEBSOCKET_URL;
      
      // Configure WebSocket connection
      const wsClient = WebSocket as unknown as new (url: string, options: any) => WebSocket;
      this.socket = new wsClient(websocketUrl, {
        origin: 'https://web.whatsapp.com',
        headers: {
          'User-Agent': options.userAgent || 'WhatsLynx/1.0.0',
          ...options.customHeaders
        },
        timeout: options.connectionTimeout || 60000
      });
      
      // Set up event handlers
      this.setupSocketEvents();
      
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error('Socket not initialized'));
          return;
        }
        
        // Set up one-time handlers for the initial connection
        this.socket.once('open', () => {
          this.client.logger('info', 'WebSocket connection opened');
          resolve();
        });
        
        this.socket.once('error', (err) => {
          this.client.logger('error', 'WebSocket connection error', err);
          reject(err);
        });
        
        // Set a timeout for the connection
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, options.connectionTimeout || 60000);
        
        // Clear the timeout if we connect or error out
        this.socket.once('open', () => clearTimeout(timeout));
        this.socket.once('error', () => clearTimeout(timeout));
      });
      
      // Start the authentication process
      await this.performInitialHandshake();
      
    } catch (error: any) {
      this.client.logger('error', 'Failed to connect to WebSocket server', error);
      this.setConnectionState(ConnectionState.DISCONNECTED);
      throw error;
    }
  }
  
  /**
   * Disconnect from the WebSocket server
   * @param codeOrReason Close code or reason string
   * @param reason Close reason (when first parameter is code)
   */
  async disconnect(codeOrReason: number | string = 1000, reason?: string): Promise<void> {
    // Process parameters to handle both formats (code, reason) and (reason)
    let code = 1000;
    let closeReason = 'Normal closure';
    
    if (typeof codeOrReason === 'string') {
      closeReason = codeOrReason;
    } else {
      code = codeOrReason;
      if (reason) closeReason = reason;
    }
    if (!this.socket || this.isClosing) {
      return; // Already disconnected or disconnecting
    }
    
    this.isClosing = true;
    this.setConnectionState(ConnectionState.DISCONNECTING);
    
    // Clear timers
    this.clearPingInterval();
    this.clearReconnectTimer();
    
    // Clear pending message callbacks
    for (const [messageId, { reject, timeout }] of this.messageCallbacks.entries()) {
      clearTimeout(timeout);
      reject(new Error('Disconnected'));
      this.messageCallbacks.delete(messageId);
    }
    
    try {
      // Send logout message if authenticated
      if (this.authenticated) {
        await this.sendLogout();
      }
      
      // Close the connection
      this.socket.close(code, closeReason);
      
      // Reset authentication state
      this.authenticated = false;
      this.clientToken = null;
      this.serverToken = null;
      this.encKey = Buffer.alloc(0);
      this.macKey = Buffer.alloc(0);
      
    } catch (error) {
      this.client.logger('error', 'Error during disconnect', error);
    } finally {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.messageQueue = [];
    }
  }
  
  /**
   * Check if the socket is connected
   * @returns True if connected
   */
  isConnected(): boolean {
    return (
      this.socket !== null && 
      this.socket.readyState === WebSocket.OPEN &&
      this.connectionState === ConnectionState.CONNECTED
    );
  }
  
  /**
   * Check if the client is authenticated
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }
  
  /**
   * Get the connection state
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
  
  /**
   * Generate a new client ID
   * @returns Random client ID
   */
  generateClientId(): string {
    if (this.clientId) {
      return this.clientId;
    }
    
    // Generate a random 16-byte client ID
    const randomBytes = generateRandomBytes(16);
    this.clientId = base64Encode(randomBytes);
    return this.clientId;
  }
  
  /**
   * Send a JSON message over the WebSocket
   * @param data JSON data to send
   * @returns Promise that resolves when the message is sent
   */
  async sendJSON(data: any): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    try {
      const jsonStr = JSON.stringify(data);
      this.socket!.send(jsonStr);
    } catch (error) {
      this.client.logger('error', 'Error sending JSON message', error);
      throw error;
    }
  }
  
  /**
   * Send a binary message over the WebSocket
   * @param data Binary data to send
   * @returns Promise that resolves when the message is sent
   */
  async sendBinary(data: Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    try {
      this.socket!.send(data);
    } catch (error) {
      this.client.logger('error', 'Error sending binary message', error);
      throw error;
    }
  }
  
  /**
   * Send a tagged binary message and wait for a response
   * @param data Data to send
   * @param tag Tag for the message
   * @param timeout Timeout in milliseconds
   * @returns Promise that resolves with the response
   */
  async sendTaggedMessage(data: any, tag?: string, timeout: number = 60000): Promise<any> {
    const messageTag = tag || generateMessageID();
    
    return new Promise((resolve, reject) => {
      // Create the message
      const message = createMessageNode(data.type, {
        id: messageTag,
        ...data
      });
      
      // Serialize and encrypt the message
      let serialized = serializeNode(message);
      if (this.encKey && this.macKey) {
        serialized = encryptAndSignToBuffer(this.encKey, this.macKey, serialized);
      }
      
      // Set up the callback
      const timeoutId = setTimeout(() => {
        this.messageCallbacks.delete(messageTag);
        reject(new Error(`Message timed out: ${messageTag}`));
      }, timeout);
      
      this.messageCallbacks.set(messageTag, {
        resolve,
        reject,
        timeout: timeoutId
      });
      
      // Send the message
      this.sendBinary(serialized)
        .catch(error => {
          clearTimeout(timeoutId);
          this.messageCallbacks.delete(messageTag);
          reject(error);
        });
    });
  }
  
  /**
   * Send a pairing code request
   * @param phoneNumber Phone number to pair with
   * @returns Promise that resolves when the request is sent
   */
  async sendPairingCodeRequest(phoneNumber: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    try {
      // Format the phone number
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber.substring(1) 
        : phoneNumber;
      
      // Create the pairing code request message
      const pairingRequest = {
        type: 'pairing',
        phoneNumber: formattedPhone,
        method: 'request_code',
        platform: 'web',
        clientId: this.generateClientId()
      };
      
      // Send the request with a unique tag
      await this.sendTaggedMessage(pairingRequest, `pairing_${Date.now()}`);
      
    } catch (error) {
      this.client.logger('error', 'Error sending pairing code request', error);
      throw error;
    }
  }
  
  /**
   * Send a presence update
   * @param type Presence type (available, unavailable, composing, etc.)
   * @param chatId Chat ID to send the presence update to
   */
  async sendPresenceUpdate(type: string, chatId?: string): Promise<void> {
    if (!this.isConnected() || !this.authenticated) {
      throw new Error('Not connected or not authenticated');
    }
    
    const presenceData: Record<string, any> = {
      type: 'presence',
      presence: type
    };
    
    if (chatId) {
      presenceData.to = chatId;
    }
    
    await this.sendTaggedMessage(presenceData);
  }
  
  /**
   * Perform the initial handshake with the WhatsApp server
   * @private
   */
  private async performInitialHandshake(): Promise<void> {
    try {
      // Generate a new key pair for encryption
      const keyPair = generateKeyPair();
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
      
      // Initial handshake message
      const initialData = {
        clientId: this.generateClientId(),
        connectType: 'WIFI_UNKNOWN',
        connectReason: 'USER_ACTIVATED',
        userAgent: 'WhatsLynx/1.0.0',
        version: VERSION,
        platform: 'WEB',
        publicKey: base64Encode(this.publicKey),
        browser: {
          name: 'WhatsLynx',
          version: '1.0.0'
        }
      };
      
      // Send the initial handshake message with a unique tag
      await this.sendTaggedMessage(
        { type: 'handshake', ...initialData },
        `handshake_${Date.now()}`
      );
      
      // Start ping interval to keep the connection alive
      this.startPingInterval();
      
      // Update connection state
      this.setConnectionState(ConnectionState.CONNECTED);
      
      // Emit the connected event
      this.client.emit(WhatsLynxEvents.CONNECTED);
      
    } catch (error) {
      this.client.logger('error', 'Error during initial handshake', error);
      throw error;
    }
  }
  
  /**
   * Set up WebSocket event handlers
   * @private
   */
  private setupSocketEvents(): void {
    if (!this.socket) {
      return;
    }
    
    // Handle messages
    this.socket.on('message', (data) => {
      try {
        this.handleIncomingMessage(data);
      } catch (error) {
        this.client.logger('error', 'Error handling incoming message', error);
      }
    });
    
    // Handle socket close
    this.socket.on('close', (code, reason) => {
      this.client.logger('info', `WebSocket closed: ${code} - ${reason}`);
      
      // Clear intervals and timers
      this.clearPingInterval();
      
      // Update state
      const wasConnected = this.connectionState === ConnectionState.CONNECTED;
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Don't attempt to reconnect if we're intentionally closing
      if (this.isClosing) {
        this.isClosing = false;
        return;
      }
      
      // Emit disconnected event
      this.client.emit(WhatsLynxEvents.DISCONNECTED, {
        code,
        reason: reason.toString(),
        wasConnected
      });
      
      // Attempt to reconnect if auto-reconnect is enabled
      if (wasConnected && this.client.getOptions().autoReconnect) {
        this.scheduleReconnect();
      }
    });
    
    // Handle socket errors
    this.socket.on('error', (error) => {
      this.client.logger('error', 'WebSocket error', error);
      this.client.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
    });
    
    // Handle pong messages
    this.socket.on('pong', () => {
      this.client.logger('debug', 'Received pong from server');
    });
  }
  
  /**
   * Handle an incoming WebSocket message
   * @param data Message data
   * @private
   */
  private handleIncomingMessage(data: WebSocket.Data): void {
    // Handle text messages (JSON)
    if (typeof data === 'string') {
      try {
        const parsedData = JSON.parse(data);
        this.handleJsonMessage(parsedData);
      } catch (error) {
        this.client.logger('error', 'Failed to parse JSON message', error);
      }
      return;
    }
    
    // Handle binary messages
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      
      try {
        // Decrypt the message if encryption is set up
        let decrypted = buffer;
        if (this.encKey.length > 0 && this.macKey.length > 0) {
          // Keys are initialized and valid
          const result = verifyAndDecryptFromBuffer(this.encKey, this.macKey, buffer);
          // Verificăm dacă rezultatul nu este null înainte de a-l atribui
          if (result !== null) {
            decrypted = result;
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
        this.handleMessage(data, null);
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
        this.handleMessage(attributes, content);
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
   * Handle incoming message
   * @param attributes Node attributes
   * @param content Node content
   * @private
   */
  private handleMessage(attributes: any, content: any): void {
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
        clientId: this.clientId
      }, `logout_${Date.now()}`);
    } catch (error) {
      this.client.logger('error', 'Error sending logout message', error);
    }
  }
  
  /**
   * Start the ping interval to keep the connection alive
   * @private
   */
  private startPingInterval(): void {
    this.clearPingInterval();
    
    // Send a ping to the server every 20 seconds
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing().catch(error => {
          this.client.logger('error', 'Failed to send ping', error);
        });
      }
    }, PROTOCOL.KEEP_ALIVE_INTERVAL_MS);
  }
  
  /**
   * Clear the ping interval
   * @private
   */
  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  /**
   * Send a ping to the server
   * @private
   */
  private async sendPing(): Promise<void> {
    try {
      await this.sendTaggedMessage({
        type: 'ping',
        timestamp: Date.now()
      }, `ping_${Date.now()}`);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Schedule a reconnection attempt
   * @private
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    // Get options
    const options = this.client.getOptions();
    const maxAttempts = options.maxReconnectAttempts || 10;
    const baseDelay = options.reconnectBaseDelay || 1000;
    const maxDelay = options.reconnectMaxDelay || 60000;
    
    // Check if we've reached the maximum number of attempts
    if (this.reconnectAttempts >= maxAttempts) {
      this.client.logger('error', `Maximum reconnection attempts (${maxAttempts}) reached`);
      this.client.emit(WhatsLynxEvents.RECONNECT_FAILED, {
        attempts: this.reconnectAttempts,
        maxAttempts
      });
      return;
    }
    
    // Calculate backoff delay with exponential backoff
    const factor = 1.5;
    let delay = baseDelay * Math.pow(factor, this.reconnectAttempts);
    delay = Math.min(delay, maxDelay);
    
    // Add some jitter to prevent thundering herd
    delay = delay * (0.8 + Math.random() * 0.4);
    
    this.client.logger('info', `Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${maxAttempts})`);
    
    // Notify about reconnection attempt
    this.client.emit(WhatsLynxEvents.RECONNECTING, {
      attempt: this.reconnectAttempts + 1,
      maxAttempts,
      delay
    });
    
    // Schedule the reconnection
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      
      // Attempt to reconnect
      this.connect().catch(error => {
        this.client.logger('error', 'Reconnection attempt failed', error);
        this.scheduleReconnect(); // Schedule another attempt
      });
    }, delay);
  }
  
  /**
   * Clear the reconnect timer
   * @private
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Update the connection state and emit event
   * @param state New connection state
   * @private
   */
  private setConnectionState(state: ConnectionState): void {
    // Skip if the state hasn't changed
    if (state === this.connectionState) {
      return;
    }
    
    // Update the state
    const oldState = this.connectionState;
    this.connectionState = state;
    
    // Reset reconnect attempts when connected
    if (state === ConnectionState.CONNECTED) {
      this.reconnectAttempts = 0;
    }
    
    // Emit state change event
    this.emit('connection-state-change', {
      oldState,
      newState: state,
      timestamp: Date.now()
    });
  }
}