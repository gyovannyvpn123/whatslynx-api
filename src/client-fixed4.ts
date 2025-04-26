/**
 * Main client class for WhatsLynx
 * Handles the connection to WhatsApp Web and provides interfaces to all functionality
 */

import { EventEmitter } from 'events';
import { 
  ClientOptions, 
  ConnectionState, 
  Logger 
} from './types';
import { WhatsAppSocket } from './connection/whatsapp-socket';
import { AuthManager } from './auth/auth-manager-fixed';
import { MessageManager } from './message';
import { MediaManager } from './media/index-fixed';
import { GroupManager } from './groups/index-fixed';
import { ProfileManager } from './profile';
import { StatusManager } from './status';
import { HttpClient } from './connection/http-fixed2';
import { KeepAlive } from './connection/keep-alive';

const DEFAULT_OPTIONS: ClientOptions = {
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectInterval: 5000,
  reconnectBaseDelay: 5000,
  reconnectMaxDelay: 60000,
  reconnectInitialDelay: 1000,
  reconnectBackoffFactor: 1.5,
  connectionTimeout: 30000,
  saveInterval: 30000,
  deviceName: 'WhatsLynx',
  browserName: 'Chrome',
  browserVersion: '120.0.0',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  maxQrRequests: 5,
  maxQRAttempts: 5,
  qrTimeout: 60000,
  keepAliveInterval: 30000,
  syncContacts: true,
  syncChats: true,
  handlePresence: true,
  maxMessageQueueSize: 100,
  logger: (level, message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
  }
};

/**
 * Main client class for WhatsLynx
 * Handles the connection to WhatsApp Web and provides interfaces to all functionality
 */
export class WhatsLynxClient extends EventEmitter {
  private options: ClientOptions;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private sessionData: any = null;
  private lastDisconnectReason: string | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private logger: Logger;
  private defaultLogger: Logger = {
    info: (message, data) => {
      if (this.options.logger) {
        this.options.logger('info', message, data);
      }
    },
    warn: (message, data) => {
      if (this.options.logger) {
        this.options.logger('warn', message, data);
      }
    },
    error: (message, data) => {
      if (this.options.logger) {
        this.options.logger('error', message, data);
      }
    },
    debug: (message, data) => {
      if (this.options.logger) {
        this.options.logger('debug', message, data);
      }
    },
    child: (options) => {
      return this.defaultLogger;
    }
  };

  // Componente principale
  public auth: AuthManager;
  public socket: WhatsAppSocket;
  public http: HttpClient;
  private keepAlive: KeepAlive;

  // Manageri funcționali
  public message: MessageManager;
  public media: MediaManager;
  public group: GroupManager;
  public profile: ProfileManager;
  public status: StatusManager;

  /**
   * Create a new WhatsLynx client
   * @param options Client options
   */
  constructor(options: Partial<ClientOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = this.defaultLogger;

    // Inițializează WebSocket cu URL-ul WhatsApp Web
    this.socket = new WhatsAppSocket({
      url: 'wss://web.whatsapp.com/ws',
      timeoutMs: this.options.connectionTimeout,
      logger: this.logger,
      headers: {
        'Origin': 'https://web.whatsapp.com',
        'User-Agent': this.options.userAgent
      }
    });

    // Inițializează managerii
    this.auth = new AuthManager({
      socket: this.socket,
      logger: this.logger,
      printQRInTerminal: true,
      maxQRAttempts: this.options.maxQRAttempts,
      qrTimeout: this.options.qrTimeout
    });

    this.http = new HttpClient({
      logger: this.logger
    });

    this.keepAlive = new KeepAlive({
      socket: this.socket,
      interval: this.options.keepAliveInterval,
      enabled: this.options.keepAliveEnabled !== false,
      logger: this.logger
    });

    this.message = new MessageManager(this);
    this.media = new MediaManager(this);
    this.group = new GroupManager(this);
    this.profile = new ProfileManager(this);
    this.status = new StatusManager(this);

    // Configurează ascultătorii de evenimente
    this.initializeEventListeners();
  }

  /**
   * Connect to WhatsApp Web
   * @param sessionData Optional session data for restoring a session
   * @returns Promise that resolves when connected
   */
  async connect(sessionData?: any): Promise<void> {
    if (this.connectionState !== ConnectionState.DISCONNECTED) {
      this.logger.warn('Already connected or connecting');
      return;
    }

    this.setConnectionState(ConnectionState.CONNECTING);

    try {
      // Conectare la serverul WhatsApp
      await this.socket.connect(sessionData);
      
      this.setConnectionState(ConnectionState.CONNECTED);
      
      // Inițiază autentificarea
      if (sessionData) {
        await this.auth.startAuthentication(sessionData);
      }
      
      // Activează keep-alive
      if (this.options.keepAliveEnabled !== false) {
        this.keepAlive.start();
      }
    } catch (error: any) {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.lastDisconnectReason = error.message || 'Unknown error during connection';
      
      if (this.options.autoReconnect) {
        this.attemptReconnect('connection_failed');
      }
      
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp Web
   * @param reason Reason for disconnecting
   * @returns Promise that resolves when disconnected
   */
  async disconnect(reason: string = 'client_disconnect'): Promise<void> {
    if (this.connectionState === ConnectionState.DISCONNECTED) {
      this.logger.warn('Already disconnected');
      return;
    }

    this.setConnectionState(ConnectionState.DISCONNECTING);

    // Oprește reconnect și keep-alive
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.keepAlive.stop();

    try {
      // Deconectare de la serverul WhatsApp
      await this.socket.disconnect();
    } catch (error) {
      this.logger.error('Error during disconnect', error);
    } finally {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.lastDisconnectReason = reason;
      this.logger.info(`Disconnected from WhatsApp Web: ${reason}`);
    }
  }

  /**
   * Log out from WhatsApp Web
   * @returns Promise that resolves when logged out
   */
  async logout(): Promise<void> {
    if (!this.isConnected() || !this.auth.isAuthenticated()) {
      throw new Error('Not connected or authenticated');
    }

    try {
      // Logout de la serverul WhatsApp
      await this.auth.logout();
      
      // Curăță datele de sesiune
      this.clearSessionData();
      
      this.logger.info('Logged out successfully');
    } catch (error) {
      this.logger.error('Error during logout', error);
      throw error;
    }
  }

  /**
   * Check if connected to WhatsApp Web
   * @returns True if connected, false otherwise
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED || 
           this.connectionState === ConnectionState.AUTHENTICATED;
  }

  /**
   * Get the current connection state
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get the reason for the last disconnection
   * @returns Last disconnect reason or null if not applicable
   */
  getLastDisconnectReason(): string | null {
    return this.lastDisconnectReason;
  }

  /**
   * Get the session data for the current connection
   * @returns Session data object or null if not connected
   */
  getSessionData(): any {
    return this.sessionData || this.auth.getSessionData();
  }

  /**
   * Save session data for future use
   * @param data Session data to save
   */
  saveSessionData(data: any): void {
    this.sessionData = data;
    this.auth.setSessionData(data);
    this.emit('session.update', data);
  }

  /**
   * Clear saved session data
   */
  clearSessionData(): void {
    this.sessionData = null;
    this.auth.setSessionData(null);
    this.emit('session.update', null);
  }

  /**
   * Get the client options
   * @returns Client options object
   */
  getOptions(): ClientOptions {
    return this.options;
  }

  /**
   * Handle connectivity issues and attempt auto-reconnect
   * @param reason Reason for reconnection attempt
   * @private
   */
  private attemptReconnect(reason: string): void {
    if (this.reconnectTimeout || !this.options.autoReconnect || 
        this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState(ConnectionState.RECONNECTING);

    // Calculează delay cu backoff exponențial
    const delay = Math.min(
      this.options.reconnectInitialDelay! * Math.pow(this.options.reconnectBackoffFactor!, this.reconnectAttempts),
      this.options.reconnectMaxDelay
    );

    this.logger.info(`Reconnecting (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${delay}ms`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      try {
        await this.connect(this.sessionData);
        this.reconnectAttempts = 0;
        this.logger.info('Reconnected successfully');
      } catch (error) {
        this.logger.error('Reconnection attempt failed', error);
        
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.attemptReconnect(reason);
        } else {
          this.emit('connection.failed', { reason: 'max_reconnect_attempts' });
        }
      }
    }, delay);
  }

  /**
   * Update the connection state and emit events
   * @param state New connection state
   * @private
   */
  private setConnectionState(state: ConnectionState): void {
    const oldState = this.connectionState;
    this.connectionState = state;

    if (oldState !== state) {
      this.emit('connection.state', { 
        old: oldState, 
        new: state 
      });

      // Emit specific events pentru stări importante
      if (state === ConnectionState.CONNECTED) {
        this.emit('connection.open');
      } else if (state === ConnectionState.DISCONNECTED) {
        this.emit('connection.closed', this.lastDisconnectReason);
      } else if (state === ConnectionState.AUTHENTICATED) {
        this.emit('connection.authenticated');
      }
    }
  }

  /**
   * Initialize event listeners
   * @private
   */
  private initializeEventListeners(): void {
    // Ascultă pentru evenimente de autentificare
    this.auth.on('authenticated', (data) => {
      this.saveSessionData(data);
      this.setConnectionState(ConnectionState.AUTHENTICATED);
      this.emit('auth.authenticated', data);
    });

    this.auth.on('logout', () => {
      this.clearSessionData();
      this.emit('auth.logout');
    });

    this.auth.on('qr', (qrData) => {
      this.emit('auth.qr', qrData);
    });

    this.auth.on('pairing.code', (pairingData) => {
      this.emit('auth.pairing_code', pairingData);
    });

    // Ascultă pentru evenimente de socket
    this.socket.on('close', (data) => {
      if (this.connectionState !== ConnectionState.DISCONNECTING) {
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = data.reason || 'connection_closed';
        
        if (this.options.autoReconnect) {
          this.attemptReconnect('connection_closed');
        }
      }
    });

    this.socket.on('error', (error) => {
      this.emit('connection.error', error);
      
      if (this.connectionState !== ConnectionState.DISCONNECTING && 
          this.connectionState !== ConnectionState.DISCONNECTED) {
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = error.message || 'connection_error';
        
        if (this.options.autoReconnect) {
          this.attemptReconnect('connection_error');
        }
      }
    });

    // Ascultă pentru evenimente generale de eroare
    this.on('error', (error) => {
      this.logger.error('WhatsLynx error', error);
    });
  }
}