import EventEmitter from 'events';
import WebSocket from 'ws';
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
  encryptAndSign, 
  generateKeyPair, 
  computeSharedSecret, 
  generateRandomBytes, 
  hmacSha256,
  verifyAndDecrypt
} from '../utils/encryption-fixed';

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
  private sharedSecret: Buffer | null = null;
  private encKey: Buffer = Buffer.alloc(0);
  private macKey: Buffer = Buffer.alloc(0);
  private authenticated: boolean = false;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  
  /**
   * Create a new socket connection
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    this.setMaxListeners(50);
  }
  
  /**
   * Connect to WhatsApp Web WebSocket
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.setConnectionState(ConnectionState.CONNECTING);
    
    try {
      // Generate keypair
      const keyPair = generateKeyPair();
      this.privateKey = keyPair.private;
      this.publicKey = keyPair.public;
      
      // Create WebSocket connection
      this.socket = new WebSocket(DEFAULT_WEBSOCKET_URL, {
        headers: {
          'Origin': 'https://web.whatsapp.com',
          'User-Agent': this.client.getOptions().userAgent
        }
      });
      
      // Set up event listeners
      this.setupSocketListeners();
      
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.client.getOptions().connectionTimeout);
        
        this.socket!.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.socket!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      // Start ping interval
      this.startPingInterval();
      
      // Initialize handshake
      await this.sendHandshake();
      
      this.setConnectionState(ConnectionState.CONNECTED);
    } catch (error) {
      this.close();
      throw error;
    }
  }
  
  /**
   * Disconnect from WebSocket connection
   * @param code Close code
   * @param reason Reason for disconnection
   * @returns Promise that resolves when disconnected
   */
  async disconnect(codeOrReason: number | string = 1000, reason: string = 'Normal closure'): Promise<void> {
    if (!this.socket || this.isClosing) {
      return; // Already disconnected or disconnecting
    }
    
    this.isClosing = true;
    this.setConnectionState(ConnectionState.DISCONNECTING);
    
    // Convert string code to numeric code if necessary
    const code = typeof codeOrReason === 'string' ? 1000 : codeOrReason;
    const closeReason = typeof codeOrReason === 'string' ? codeOrReason : reason;
    
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
      if (this.client.options && this.client.options.logger) {
        this.client.options.logger('error', 'Error during disconnect', error);
      }
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
   * @returns Promise that resolves when message is sent
   */
  async sendJsonMessage(data: any): Promise<any> {
    const messageId = data.id || generateMessageID();
    const tag = `${messageId}.--message`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(tag);
        reject(new Error('Message send timeout'));
      }, 30000);
      
      this.messageCallbacks.set(tag, { resolve, reject, timeout });
      
      try {
        // Add message to queue if not connected
        if (!this.isConnected()) {
          this.messageQueue.push({ data, tag });
          return;
        }
        
        // Send message
        this.socket!.send(JSON.stringify(data));
        resolve(data);
      } catch (error) {
        clearTimeout(timeout);
        this.messageCallbacks.delete(tag);
        reject(error);
      }
    });
  }
  
  /**
   * Send a binary message over the WebSocket
   * @param data Binary data to send
   * @returns Promise that resolves when message is sent
   */
  async sendBinaryMessage(data: Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.socket!.send(data, { binary: true }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Send a node message over the WebSocket
   * @param node Node data
   * @returns Promise that resolves when message is sent
   */
  async sendNodeMessage(node: any): Promise<void> {
    const serialized = serializeNode(node);
    return this.sendBinaryMessage(serialized);
  }
  
  /**
   * Send a handshake message
   * @returns Promise that resolves when handshake is complete
   */
  private async sendHandshake(): Promise<void> {
    // Generate client ID if not already generated
    const clientId = this.generateClientId();
    
    // Send handshake message
    const messageTag = `${generateMessageID()}.--init`;
    
    // Create handshake node
    const handshakeNode = [
      'admin',
      'init',
      VERSION,
      ['WhatsLynx', 'Chrome', '10'],
      clientId,
      true
    ];
    
    // Serialize and send node
    const serialized = serializeNode(handshakeNode);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(messageTag);
        reject(new Error('Handshake timeout'));
      }, 30000);
      
      this.messageCallbacks.set(messageTag, { resolve, reject, timeout });
      
      try {
        // Send message
        this.socket!.send(serialized, { binary: true }, (error) => {
          if (error) {
            clearTimeout(timeout);
            this.messageCallbacks.delete(messageTag);
            reject(error);
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        this.messageCallbacks.delete(messageTag);
        reject(error);
      }
    });
  }
  
  /**
   * Restore a session
   * @param sessionData Session data
   * @returns Promise that resolves when session is restored
   */
  async restoreSession(sessionData: any): Promise<void> {
    if (!sessionData) {
      throw new Error('No session data provided');
    }
    
    // Extract session data
    this.clientId = sessionData.clientId;
    this.clientToken = sessionData.clientToken;
    this.serverToken = sessionData.serverToken;
    this.encKey = Buffer.from(sessionData.encKey, 'base64');
    this.macKey = Buffer.from(sessionData.macKey, 'base64');
    
    // Connect to server
    await this.connect();
    
    // Send login message
    await this.sendLoginMessage();
  }
  
  /**
   * Send a login message to restore a session
   * @returns Promise that resolves when login is complete
   */
  private async sendLoginMessage(): Promise<void> {
    if (!this.clientToken || !this.serverToken) {
      throw new Error('No auth tokens available');
    }
    
    // Create login node
    const loginNode = [
      'admin',
      'login',
      this.clientToken,
      this.serverToken,
      this.clientId,
      'takeover'
    ];
    
    // Send node
    await this.sendNodeMessage(loginNode);
  }
  
  /**
   * Send a logout message
   * @returns Promise that resolves when logout is complete
   */
  private async sendLogout(): Promise<void> {
    // Create logout node
    const logoutNode = ['admin', 'Conn', 'disconnect'];
    
    // Send node
    await this.sendNodeMessage(logoutNode);
  }
  
  /**
   * Start the ping interval
   */
  private startPingInterval(): void {
    this.clearPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing().catch(() => {});
      }
    }, PROTOCOL.KEEP_ALIVE_INTERVAL_MS);
  }
  
  /**
   * Clear the ping interval
   */
  private clearPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  /**
   * Clear the reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Send a ping message
   * @returns Promise that resolves when ping is sent
   */
  private async sendPing(): Promise<void> {
    const pingNode = ['admin', 'ping', Date.now().toString()];
    await this.sendNodeMessage(pingNode);
  }
  
  /**
   * Set up socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;
    
    this.socket.on('open', () => {
      this.emit('open');
    });
    
    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
    
    this.socket.on('close', (code, reason) => {
      this.clearPingInterval();
      
      if (!this.isClosing) {
        // Unexpected close
        this.emit('close', `Connection closed unexpectedly (${code}: ${reason})`);
      } else {
        // Expected close
        this.emit('close', reason.toString());
      }
      
      this.isClosing = false;
      this.socket = null;
    });
    
    this.socket.on('message', (data) => {
      this.handleMessage(data);
    });
  }
  
  /**
   * Handle an incoming message
   * @param data Message data
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      // Check if message is a binary message
      if (Buffer.isBuffer(data)) {
        this.handleBinaryMessage(data);
      } else if (typeof data === 'string') {
        this.handleTextMessage(data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Handle a binary message
   * @param data Binary message data
   */
  private handleBinaryMessage(data: Buffer): void {
    try {
      // Decrypt message if needed
      let decrypted = data;
      if (this.authenticated && this.encKey.length > 0 && this.macKey.length > 0) {
        decrypted = verifyAndDecrypt(data, this.encKey, this.macKey);
      }
      
      // Split message
      const [tag, message] = splitBinaryMessage(decrypted);
      
      // Handle message callback
      if (tag && this.messageCallbacks.has(tag)) {
        const { resolve, timeout } = this.messageCallbacks.get(tag)!;
        clearTimeout(timeout);
        resolve(message);
        this.messageCallbacks.delete(tag);
      }
      
      // Handle specific message types
      if (Array.isArray(message)) {
        this.handleNodeMessage(message);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Handle a text message
   * @param data Text message data
   */
  private handleTextMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle specific message types based on message structure
      if (message.tag && this.messageCallbacks.has(message.tag)) {
        const { resolve, timeout } = this.messageCallbacks.get(message.tag)!;
        clearTimeout(timeout);
        resolve(message);
        this.messageCallbacks.delete(message.tag);
      }
      
      // Emit message received event
      this.emit('message', message);
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Handle a node message
   * @param node Node message
   */
  private handleNodeMessage(node: any[]): void {
    if (!Array.isArray(node) || node.length === 0) {
      return;
    }
    
    const [type, subtype, ...data] = node;
    
    switch (type) {
      case 'challenge':
        this.handleChallengeNode(data[0]);
        break;
      case 'success':
        this.handleSuccessNode(data);
        break;
      case 'failure':
        this.handleFailureNode(subtype, data);
        break;
      case 'stream':
        this.handleStreamNode(subtype, data);
        break;
      case 'response':
        this.handleResponseNode(subtype, data);
        break;
      default:
        // Unknown node type
        this.emit('unknown', node);
        break;
    }
  }
  
  /**
   * Handle a challenge node
   * @param challenge Challenge data
   */
  private handleChallengeNode(challenge: string): void {
    try {
      // Decode challenge
      const challengeBuffer = base64Decode(challenge);
      
      // Compute shared secret
      this.sharedSecret = computeSharedSecret(this.privateKey, challengeBuffer);
      
      // Derive keys
      const keys = this.deriveKeys(this.sharedSecret);
      this.encKey = keys.encKey;
      this.macKey = keys.macKey;
      
      // Send challenge response
      const clientPublicKey = Buffer.from(this.publicKey);
      const signedChallenge = hmacSha256(challengeBuffer, this.macKey);
      
      const responseNode = ['admin', 'challenge', base64Encode(clientPublicKey), base64Encode(signedChallenge), this.clientId];
      this.sendNodeMessage(responseNode).catch((error) => {
        this.emit('error', error);
      });
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Handle a success node
   * @param data Success data
   */
  private handleSuccessNode(data: any[]): void {
    try {
      // Extract tokens
      if (data.length >= 2) {
        this.serverToken = data[0];
        this.clientToken = data[1];
      }
      
      // Set authenticated flag
      this.authenticated = true;
      
      // Emit authenticated event
      this.emit('authenticated', {
        clientToken: this.clientToken,
        serverToken: this.serverToken,
        clientId: this.clientId,
        encKey: this.encKey.toString('base64'),
        macKey: this.macKey.toString('base64')
      });
      
      // Process message queue
      this.processMessageQueue();
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Handle a failure node
   * @param reason Failure reason
   * @param data Failure data
   */
  private handleFailureNode(reason: string, data: any[]): void {
    // Emit authentication failure event
    this.emit('auth_failure', { reason, data });
  }
  
  /**
   * Handle a stream node
   * @param subtype Stream subtype
   * @param data Stream data
   */
  private handleStreamNode(subtype: string, data: any[]): void {
    switch (subtype) {
      case 'error':
        this.emit('stream_error', data);
        break;
      case 'update':
        this.emit('stream_update', data);
        break;
      default:
        this.emit('stream', { subtype, data });
        break;
    }
  }
  
  /**
   * Handle a response node
   * @param subtype Response subtype
   * @param data Response data
   */
  private handleResponseNode(subtype: string, data: any[]): void {
    this.emit('response', { subtype, data });
  }
  
  /**
   * Process the message queue
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }
    
    // Process all queued messages
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const { data, tag } of queue) {
      try {
        if (typeof data === 'string') {
          this.socket!.send(data);
        } else {
          this.socket!.send(JSON.stringify(data));
        }
      } catch (error) {
        if (tag && this.messageCallbacks.has(tag)) {
          const { reject, timeout } = this.messageCallbacks.get(tag)!;
          clearTimeout(timeout);
          reject(error);
          this.messageCallbacks.delete(tag);
        }
      }
    }
  }
  
  /**
   * Derive encryption and MAC keys from shared secret
   * @param sharedSecret Shared secret
   * @returns Encryption and MAC keys
   */
  private deriveKeys(sharedSecret: Buffer): { encKey: Buffer, macKey: Buffer } {
    // Expand shared secret to 80 bytes
    const expandedSecret = Buffer.alloc(80);
    
    // Use HKDF to derive keys
    for (let i = 0; i < 80; i += 32) {
      const key = hmacSha256(Buffer.concat([sharedSecret, Buffer.from([i / 32 + 1])]), Buffer.alloc(32));
      key.copy(expandedSecret, i, 0, Math.min(32, 80 - i));
    }
    
    // Split expanded secret into encryption and MAC keys
    return {
      encKey: expandedSecret.slice(0, 32),
      macKey: expandedSecret.slice(32, 64)
    };
  }
  
  /**
   * Force close the connection
   */
  private close(): void {
    this.clearPingInterval();
    this.clearReconnectTimer();
    
    if (this.socket) {
      try {
        this.socket.terminate();
      } catch (error) {
        // Ignore errors
      }
      this.socket = null;
    }
    
    this.isClosing = false;
    this.setConnectionState(ConnectionState.DISCONNECTED);
  }
  
  /**
   * Set the connection state
   * @param state New connection state
   */
  private setConnectionState(state: ConnectionState): void {
    const oldState = this.connectionState;
    this.connectionState = state;
    
    if (oldState !== state) {
      this.emit('state_change', { from: oldState, to: state });
    }
  }
}