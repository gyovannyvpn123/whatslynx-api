import EventEmitter from 'events';
import * as WebSocket from 'ws';
import { DEFAULT_WEBSOCKET_URL, PROTOCOL } from '../utils/constants';
import { generateMessageID, joinBinaryMessage, serializeNode, splitBinaryMessage } from '../utils/binary';
import { ConnectionState, WhatsLynxEvents } from '../types';
import { 
  base64Encode, 
  encryptAndSign, 
  generateKeyPair, 
  computeSharedSecret, 
  generateRandomBytes, 
  hmacSha256,
  verifyAndDecrypt
} from '../utils/encryption';
import { encodeMessage, decodeMessage, parseMessageNode } from '../utils/protobuf';

/**
 * WebSocket connection manager for WhatsApp Web
 */
export class SocketConnection extends EventEmitter {
  private client: any; // WhatsLynxClient
  private socket: WebSocket | null = null;
  private isClosing: boolean = false;
  private messageQueue: any[] = [];
  private messageCallbacks: Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Authentication and encryption
  private clientId: string | null = null;
  private keyPair: { privateKey: Buffer, publicKey: Buffer } | null = null;
  private serverPublicKey: Buffer | null = null;
  private sharedSecret: Buffer | null = null;
  private encKey: Buffer | null = null;
  private macKey: Buffer | null = null;
  private authState: 'connecting' | 'authenticating' | 'authenticated' | 'failed' = 'connecting';

  /**
   * Create a new socket connection manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    
    // Generate key pair for encryption
    this.keyPair = generateKeyPair();
  }

  /**
   * Connect to the WhatsApp WebSocket server
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const options = this.client.getOptions();
        const headers = {
          'User-Agent': options.userAgent,
          'Origin': 'https://web.whatsapp.com',
          'Sec-WebSocket-Protocol': PROTOCOL.WEB_SUBPROTOCOL,
          ...options.customHeaders
        };

        // WebSocket constructor works differently between browser and Node.js
        // In Node.js with the ws package, we need to use it this way
        this.socket = new (WebSocket as any)(DEFAULT_WEBSOCKET_URL, {
          headers,
          timeout: options.connectionTimeout
        });

        if (this.socket) {
          this.socket.on('open', () => {
            this.onOpen();
            resolve();
          });

          this.socket.on('message', (data: WebSocket.Data) => {
            this.onMessage(data);
          });

          this.socket.on('error', (error: Error) => {
            this.onError(error);
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
              reject(error);
            }
          });

          this.socket.on('close', (code: number, reason: string) => {
            this.onClose(code, reason);
            if (!this.isClosing) {
              reject(new Error(`Connection closed unexpectedly: ${reason} (${code})`));
            }
          });
        } else {
          reject(new Error('Failed to create WebSocket connection'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WhatsApp WebSocket server
   */
  async disconnect(): Promise<void> {
    this.isClosing = true;
    this.clearPingInterval();
    this.clearReconnectTimer();
    this.clearMessageCallbacks();

    if (this.socket) {
      // Only attempt to close if socket is open
      if (this.socket.readyState === WebSocket.OPEN) {
        // Send a proper logout message if authenticated
        if (this.authState === 'authenticated') {
          try {
            await this.sendTaggedMessage({
              type: 'admin',
              action: 'logout'
            });
          } catch (error) {
            // Ignore errors during logout
          }
        }
        
        this.socket.close(1000, 'Disconnect requested');
      }
      this.socket = null;
    }

    // Reset authentication state
    this.authState = 'connecting';
    this.serverPublicKey = null;
    this.sharedSecret = null;
    this.encKey = null;
    this.macKey = null;
    
    // Generate new keys for next connection
    this.keyPair = generateKeyPair();

    this.isClosing = false;
  }

  /**
   * Reconnect to the WhatsApp WebSocket server
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Check if socket is connected
   * @returns True if connected
   */
  isConnected(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Check if client is authenticated
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.authState === 'authenticated';
  }

  /**
   * Send a message over the socket
   * @param data Message data to send
   * @returns Promise that resolves when message is sent
   */
  async send(data: string | Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Socket is not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.send(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send a JSON message over the socket
   * @param data Object to send as JSON
   * @returns Promise that resolves when message is sent
   */
  async sendJSON(data: any): Promise<void> {
    return this.send(JSON.stringify(data));
  }

  /**
   * Send a binary message over the socket
   * @param data Binary data to send
   * @returns Promise that resolves when message is sent
   */
  async sendBinary(data: Buffer): Promise<void> {
    return this.send(data);
  }

  /**
   * Generate a unique client ID
   * @returns Client ID string
   */
  generateClientId(): string {
    if (!this.clientId) {
      this.clientId = base64Encode(generateRandomBytes(16));
    }
    return this.clientId;
  }

  /**
   * Send a WhatsApp protocol message with a tag
   * @param message Message to send
   * @param tag Message tag (should be unique)
   * @returns Promise that resolves with the response
   */
  async sendTaggedMessage(message: any, tag: string = generateMessageID()): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add tag to message
      const taggedMessage = {
        ...message,
        messageTag: tag
      };

      // Set up response timeout
      const timeout = setTimeout(() => {
        this.messageCallbacks.delete(tag);
        reject(new Error(`Message ${tag} timed out after ${this.client.getOptions().connectionTimeout}ms`));
      }, this.client.getOptions().connectionTimeout);

      // Store callback
      this.messageCallbacks.set(tag, {
        resolve,
        reject,
        timeout
      });

      // Encrypt message if authenticated and not an administrative message
      const sendMessage = async () => {
        try {
          if (this.authState === 'authenticated' && this.encKey && this.macKey && message.type !== 'admin') {
            // Serialize and encrypt the message
            const messageBuffer = await this.encryptMessage(taggedMessage);
            await this.sendBinary(messageBuffer);
          } else {
            // Send as JSON for admin/auth messages
            await this.sendJSON(taggedMessage);
          }
        } catch (error) {
          clearTimeout(timeout);
          this.messageCallbacks.delete(tag);
          reject(error);
        }
      };

      sendMessage();
    });
  }

  /**
   * Encrypt a message using session keys
   * @param message Message to encrypt
   * @returns Encrypted message buffer
   * @private
   */
  private async encryptMessage(message: any): Promise<Buffer> {
    if (!this.encKey || !this.macKey) {
      throw new Error('Encryption keys not available');
    }
    
    // Convert message to binary format
    const messageType = message.type || 'message';
    const messageBuffer = await encodeMessage(messageType, message);
    
    // Encrypt and sign the message
    return encryptAndSign(this.encKey, this.macKey, messageBuffer);
  }

  /**
   * Decrypt a received message
   * @param data Encrypted message data
   * @returns Decrypted message or null
   * @private
   */
  private async decryptMessage(data: Buffer): Promise<any | null> {
    if (!this.encKey || !this.macKey) {
      return null;
    }
    
    // Decrypt and verify the message
    const decrypted = verifyAndDecrypt(this.encKey, this.macKey, data);
    if (!decrypted) {
      return null;
    }
    
    // Decode the protobuf message
    return await decodeMessage(decrypted);
  }

  /**
   * Send a request to restore a session
   * @param credentials Authentication credentials
   * @returns Promise that resolves when sent
   */
  async sendRestoreSessionCommand(credentials: any): Promise<void> {
    this.authState = 'authenticating';
    
    const tag = generateMessageID();
    const message = {
      messageTag: tag,
      type: 'admin',
      content: {
        action: 'restore-session',
        credentials: {
          clientId: credentials.clientId,
          serverToken: credentials.serverToken,
          clientToken: credentials.clientToken,
          encKey: credentials.encKey.toString('base64'),
          macKey: credentials.macKey.toString('base64')
        }
      }
    };
    
    // Store keys from credentials
    this.encKey = credentials.encKey;
    this.macKey = credentials.macKey;
    
    await this.sendJSON(message);
    
    // Emit event for session restore attempt
    this.emit('session-restore-attempt');
  }

  /**
   * Send a QR code request
   * @returns Promise that resolves when sent
   */
  async sendQRCodeRequest(): Promise<void> {
    this.authState = 'authenticating';
    
    const tag = generateMessageID();
    const message = {
      messageTag: tag,
      type: 'admin',
      content: {
        action: 'get-qr',
        version: PROTOCOL.VERSION
      }
    };
    
    await this.sendJSON(message);
  }

  /**
   * Send a pairing code request
   * @param phoneNumber Phone number for pairing (without +)
   * @returns Promise that resolves when sent
   */
  async sendPairingCodeRequest(phoneNumber: string): Promise<void> {
    this.authState = 'authenticating';
    
    const tag = generateMessageID();
    const message = {
      messageTag: tag,
      type: 'admin',
      content: {
        action: 'get-pairing-code',
        phoneNumber,
        version: PROTOCOL.VERSION
      }
    };
    
    await this.sendJSON(message);
  }

  /**
   * Initiate authentication handshake
   * @private
   */
  private async initiateHandshake(): Promise<void> {
    if (!this.keyPair) {
      throw new Error('Key pair not generated');
    }
    
    // Generate client ID if not already done
    const clientId = this.generateClientId();
    
    // Create handshake message
    const handshakeMessage = {
      messageTag: generateMessageID(),
      type: 'admin',
      content: {
        action: 'init',
        clientId,
        version: PROTOCOL.VERSION,
        publicKey: base64Encode(this.keyPair.publicKey)
      }
    };
    
    // Send handshake
    await this.sendJSON(handshakeMessage);
  }

  /**
   * Handle socket open event
   * @private
   */
  private onOpen(): void {
    this.startPingInterval();
    
    // Initiate handshake
    this.initiateHandshake().catch(error => {
      this.client.getOptions().logger('error', 'Failed to initiate handshake', error);
      this.emit('error', error);
    });
    
    this.processMessageQueue();
    this.emit('open');
  }

  /**
   * Handle socket message event
   * @param data Message data
   * @private
   */
  private onMessage(data: WebSocket.Data): void {
    try {
      // Handle binary vs text messages differently
      if (data instanceof Buffer) {
        this.handleBinaryMessage(data);
      } else {
        this.handleTextMessage(data.toString());
      }
    } catch (error) {
      this.client.getOptions().logger('error', 'Error processing message', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle socket error event
   * @param error Error object
   * @private
   */
  private onError(error: Error): void {
    this.client.getOptions().logger('error', 'Socket error', error);
    this.emit('error', error);
  }

  /**
   * Handle socket close event
   * @param code Close code
   * @param reason Close reason
   * @private
   */
  private onClose(code: number, reason: string): void {
    this.clearPingInterval();
    
    this.client.getOptions().logger('info', `Socket closed: ${reason} (${code})`);
    this.emit('close', { code, reason });
    
    // If this wasn't an intentional close, attempt to reconnect
    if (!this.isClosing && this.client.getConnectionState() !== ConnectionState.DISCONNECTED) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle binary message from socket
   * @param data Binary message data
   * @private
   */
  private async handleBinaryMessage(data: Buffer): Promise<void> {
    // In authenticated state, decrypt the message
    if (this.authState === 'authenticated' && this.encKey && this.macKey) {
      try {
        const decrypted = await this.decryptMessage(data);
        
        if (decrypted) {
          // Process decrypted message
          if (decrypted.messageInfo) {
            // Handle message info (regular message)
            this.emit('message', decrypted.messageInfo);
          } else if (decrypted.notification) {
            // Handle notification
            this.emit('notification', decrypted.notification);
          } else if (decrypted.presence) {
            // Handle presence update
            this.emit('presence', decrypted.presence);
          } else if (decrypted.messageTag && this.messageCallbacks.has(decrypted.messageTag)) {
            // Handle response to a tagged message
            const { resolve, timeout } = this.messageCallbacks.get(decrypted.messageTag)!;
            clearTimeout(timeout);
            this.messageCallbacks.delete(decrypted.messageTag);
            resolve(decrypted);
          }
          
          // Generic binary message event
          this.emit('binary-message', decrypted);
        }
      } catch (error) {
        this.client.getOptions().logger('error', 'Failed to decrypt binary message', error);
      }
      return;
    }
    
    // For non-authenticated state, try to parse the message nodes
    try {
      const nodes = splitBinaryMessage(data);
      for (const node of nodes) {
        const parsedNode = parseMessageNode(node);
        if (parsedNode) {
          this.emit('node', parsedNode);
        }
      }
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to parse binary message', error);
    }
    
    // Emit raw binary message event
    this.emit('binary-data', data);
  }

  /**
   * Handle text message from socket
   * @param data Text message data
   * @private
   */
  private handleTextMessage(data: string): void {
    try {
      // Parse JSON message
      const message = JSON.parse(data);
      
      // If message has a tag, check for pending callbacks
      if (message.messageTag && this.messageCallbacks.has(message.messageTag)) {
        const { resolve, reject, timeout } = this.messageCallbacks.get(message.messageTag)!;
        clearTimeout(timeout);
        this.messageCallbacks.delete(message.messageTag);
        
        // Check for error
        if (message.status === 'error') {
          reject(new Error(message.error || 'Unknown error'));
        } else {
          resolve(message);
        }
      }
      
      // Handle admin messages
      if (message.type === 'admin') {
        this.handleAdminMessage(message);
        return;
      }
      
      // Process specific message types
      switch (message.type) {
        case 'auth':
          this.handleAuthMessage(message);
          break;
          
        case 'message':
          this.emit('message', message.data);
          break;
          
        default:
          // Generic message event
          this.emit('text-message', message);
      }
    } catch (error) {
      this.client.getOptions().logger('error', 'Failed to parse text message', error);
    }
  }

  /**
   * Handle administrative messages
   * @param message Admin message
   * @private
   */
  private handleAdminMessage(message: any): void {
    if (!message.content || !message.content.action) {
      return;
    }
    
    switch (message.content.action) {
      case 'init-response':
        // Handle server handshake response
        if (message.content.serverPublicKey) {
          try {
            // Store server public key
            this.serverPublicKey = Buffer.from(message.content.serverPublicKey, 'base64');
            
            // Compute shared secret
            if (this.keyPair && this.serverPublicKey) {
              this.sharedSecret = computeSharedSecret(this.keyPair.privateKey, this.serverPublicKey);
              
              // Derive encryption keys
              const keys = this.client.auth.deriveSessionKeys(this.sharedSecret);
              this.encKey = keys.encKey;
              this.macKey = keys.macKey;
              
              // Emit handshake completed event
              this.emit('handshake-completed');
            }
          } catch (error) {
            this.client.getOptions().logger('error', 'Failed to process handshake response', error);
          }
        }
        break;
        
      case 'challenge':
        // Handle authentication challenge
        if (message.content.challenge) {
          try {
            // Sign the challenge with our mac key
            const challenge = Buffer.from(message.content.challenge, 'base64');
            const signature = hmacSha256(this.macKey!, challenge);
            
            // Send response
            this.sendJSON({
              messageTag: generateMessageID(),
              type: 'admin',
              content: {
                action: 'challenge-response',
                challengeResponse: base64Encode(signature)
              }
            }).catch(error => {
              this.client.getOptions().logger('error', 'Failed to respond to challenge', error);
            });
          } catch (error) {
            this.client.getOptions().logger('error', 'Failed to process challenge', error);
          }
        }
        break;
        
      case 'connected':
        // Handle successful connection and authentication
        this.authState = 'authenticated';
        this.emit('authenticated', message.content.userData);
        break;
        
      case 'qr':
        // Handle QR code
        this.emit('qr-code', {
          qrCode: message.content.qrCode,
          timeout: message.content.timeout || PROTOCOL.QR_CODE_TTL_MS,
          attempts: message.content.attempts || 1
        });
        break;
        
      case 'pairing-code':
        // Handle pairing code
        this.emit('pairing-code', {
          pairingCode: message.content.pairingCode,
          pairingCodeExpiresAt: message.content.expiresAt || (Date.now() + PROTOCOL.PAIRING_CODE_TTL_MS),
          phoneNumber: message.content.phoneNumber
        });
        break;
        
      case 'logout':
        // Handle logout
        this.authState = 'connecting';
        this.emit('logout');
        break;
    }
  }

  /**
   * Handle authentication messages
   * @param message Auth message
   * @private
   */
  private handleAuthMessage(message: any): void {
    if (message.status === 'success') {
      // Handle successful authentication
      this.authState = 'authenticated';
      this.emit('authenticated', message.data);
    } else {
      // Handle authentication failure
      this.authState = 'failed';
      this.emit('auth-failure', message.error);
    }
  }

  /**
   * Start ping interval to keep connection alive
   * @private
   */
  private startPingInterval(): void {
    this.clearPingInterval();
    
    // Send a ping every 20 seconds to keep the connection alive
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        const pingMessage = {
          messageTag: generateMessageID(),
          type: 'admin',
          content: { action: 'ping' }
        };
        
        this.sendJSON(pingMessage).catch(error => {
          this.client.getOptions().logger('error', 'Failed to send ping', error);
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
   * Schedule a reconnection attempt
   * @private
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    // Only reconnect if auto-reconnect is enabled
    if (!this.client.getOptions().autoReconnect) {
      return;
    }
    
    // Schedule reconnect after a delay
    this.reconnectTimer = setTimeout(() => {
      this.client.getOptions().logger('info', 'Attempting to reconnect...');
      this.connect().catch(error => {
        this.client.getOptions().logger('error', 'Failed to reconnect', error);
        this.scheduleReconnect();
      });
    }, PROTOCOL.RECONNECT_INTERVAL_MS);
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
   * Process any queued messages after connection
   * @private
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length > 0 && this.isConnected()) {
      const queueCopy = [...this.messageQueue];
      this.messageQueue = [];
      
      queueCopy.forEach(item => {
        this.send(item.data).then(item.resolve).catch(item.reject);
      });
    }
  }

  /**
   * Clear all pending message callbacks
   * @private
   */
  private clearMessageCallbacks(): void {
    for (const [tag, { reject, timeout }] of this.messageCallbacks.entries()) {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
      this.messageCallbacks.delete(tag);
    }
  }
}
