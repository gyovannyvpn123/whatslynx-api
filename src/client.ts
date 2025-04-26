import EventEmitter from 'events';
import { AuthManager } from './auth';
import { WhatsAppSocket } from './connection/whatsapp-socket';
import { HttpClient } from './connection/http';
import { KeepAlive } from './connection/keep-alive';
import { MessageManager } from './message';
import { MediaManager } from './media';
import { GroupManager } from './groups';
import { ProfileManager } from './profile';
import { StatusManager } from './status';
import { ClientOptions, ConnectionState, WhatsLynxEvents, Logger } from './types';
import { DEFAULT_CLIENT_OPTIONS } from './utils/constants';

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

  // Core components
  public auth: AuthManager;
  public socket: WhatsAppSocket;
  public http: HttpClient;
  private keepAlive: KeepAlive;

  // Feature managers
  public message: MessageManager;
  public media: MediaManager;
  public group: GroupManager;
  public profile: ProfileManager;
  public status: StatusManager;

  /**
   * Create a new WhatsLynx client
   * @param options Client configuration options
   */
  constructor(options: Partial<ClientOptions> = {}) {
    super();
    this.options = { ...DEFAULT_CLIENT_OPTIONS, ...options };
    
    // Initialize logger
    this.logger = this.options.logger || {
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: this.options.logLevel === 'debug' ? console.debug : () => {}
    };

    // Initialize core components
    this.socket = new WhatsAppSocket({
      url: this.options.serverUrl,
      timeoutMs: this.options.connectionTimeout,
      logger: this.logger,
      browser: this.options.browser,
      version: this.options.version
    });
    
    this.http = new HttpClient(this);
    this.auth = new AuthManager(this);
    this.keepAlive = new KeepAlive(this);

    // Initialize feature managers
    this.message = new MessageManager(this);
    this.media = new MediaManager(this);
    this.group = new GroupManager(this);
    this.profile = new ProfileManager(this);
    this.status = new StatusManager(this);

    // Bind event handlers
    this.bindEvents();
  }

  /**
   * Connect to WhatsApp Web servers
   * @param sessionData Optional session data for reconnection
   * @returns Promise that resolves when connection is established
   */
  async connect(sessionData?: any): Promise<void> {
    if (this.connectionState !== ConnectionState.DISCONNECTED) {
      throw new Error('Client is already connecting or connected');
    }

    this.setConnectionState(ConnectionState.CONNECTING);
    this.logger.info('Connecting to WhatsApp Web servers');
    
    try {
      // If session data is provided, attempt to restore session
      if (sessionData) {
        this.sessionData = sessionData;
        this.emit(WhatsLynxEvents.SESSION_RESTORE_ATTEMPT);
        this.logger.info('Attempting to restore session');
        
        try {
          // Set session data in socket
          this.socket.setSessionData(sessionData);
          
          // Connect to WhatsApp servers
          await this.socket.connect(sessionData);
          
          // Wait for authentication event
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Session restore timeout'));
            }, this.options.connectionTimeout);
            
            this.socket.once('authenticated', () => {
              clearTimeout(timeout);
              resolve(null);
            });
            
            this.socket.once('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
          
          // Authentication successful
          this.logger.info('Session restored successfully');
        } catch (error) {
          this.logger.warn('Failed to restore session', error);
          this.emit(WhatsLynxEvents.SESSION_RESTORE_FAILED, error);
          
          // Fall back to fresh authentication
          this.sessionData = null;
          await this.disconnect('Session restore failed');
          await this.socket.connect(); // Fresh connection
          await this.auth.startAuthentication();
        }
      } else {
        // Fresh connection
        this.logger.info('Starting fresh connection to WhatsApp');
        await this.socket.connect();
        await this.auth.startAuthentication();
      }

      // Once authenticated, start keep-alive mechanism
      this.keepAlive.start();
      this.setConnectionState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.emit(WhatsLynxEvents.CONNECTED);
      this.logger.info('Connected to WhatsApp Web services');

    } catch (error) {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.lastDisconnectReason = error instanceof Error ? error.message : 'Unknown error during connection';
      this.emit(WhatsLynxEvents.CONNECTION_FAILED, error);
      this.logger.error('Connection failed', { reason: this.lastDisconnectReason });
      
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp Web servers
   * @param reason Reason for disconnection
   * @returns Promise that resolves when disconnected
   */
  async disconnect(reason: string = 'Manual disconnect'): Promise<void> {
    if (this.connectionState === ConnectionState.DISCONNECTED) {
      return;
    }

    try {
      this.logger.info('Disconnecting from WhatsApp Web', { reason });
      this.setConnectionState(ConnectionState.DISCONNECTING);
      this.keepAlive.stop();
      await this.socket.disconnect();
      
      // Clear any pending reconnect attempts
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      this.lastDisconnectReason = reason;
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit(WhatsLynxEvents.DISCONNECTED, { reason });
      this.logger.info('Disconnected from WhatsApp Web');
    } catch (error) {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      this.logger.error('Error during disconnect', error);
      throw error;
    }
  }

  /**
   * Check if client is connected to WhatsApp servers
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && this.socket.isConnected();
  }

  /**
   * Check if client is authenticated with WhatsApp
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.isConnected() && this.socket.isAuthenticatedConnection();
  }

  /**
   * Get the current connection state
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get the client's session data for persistence
   * @returns Session data object that can be used to restore session
   */
  getSessionData(): any {
    // Combine socket session data with any other relevant session info
    const socketSession = this.socket.getSessionData();
    return {
      ...this.sessionData,
      socketSession
    };
  }

  /**
   * Update the session data
   * @param data New session data
   */
  updateSessionData(data: any): void {
    this.sessionData = { ...this.sessionData, ...data };
    
    // Update socket session if needed
    if (data.socketSession) {
      this.socket.setSessionData(data.socketSession);
    }
    
    this.emit(WhatsLynxEvents.SESSION_DATA_UPDATED, this.sessionData);
    this.logger.debug('Session data updated');
  }

  /**
   * Get the client configuration options
   * @returns Client options
   */
  getOptions(): ClientOptions {
    return this.options;
  }

  /**
   * Update client options
   * @param options New partial options to apply
   */
  updateOptions(options: Partial<ClientOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Update logger level if changed
    if (options.logLevel) {
      this.logger.debug = options.logLevel === 'debug' ? console.debug : () => {};
    }
  }

  /**
   * Get the last disconnection reason
   * @returns Reason for last disconnection or null
   */
  getLastDisconnectReason(): string | null {
    return this.lastDisconnectReason;
  }

  /**
   * Get the client logger
   * @returns Logger interface
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Bind internal event handlers
   * @private
   */
  private bindEvents(): void {
    // Handle socket events
    this.socket.on('error', (error) => {
      this.logger.error('Socket error', error);
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = error instanceof Error ? error.message : 'Socket error';
        
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    this.socket.on('close', (event) => {
      if (this.connectionState !== ConnectionState.DISCONNECTING && 
          this.connectionState !== ConnectionState.DISCONNECTED) {
        
        this.logger.warn('Connection closed unexpectedly', event);
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = 'Connection closed unexpectedly';
        this.emit(WhatsLynxEvents.DISCONNECTED, { reason: this.lastDisconnectReason });
        
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    // Handle authentication events
    this.socket.on('authenticated', (data) => {
      this.logger.info('Authentication successful');
      this.emit(WhatsLynxEvents.AUTHENTICATED, data);
      
      // Save session data
      const sessionData = this.socket.getSessionData();
      if (sessionData) {
        this.updateSessionData({ socketSession: sessionData });
      }
    });

    // Forward message events
    this.socket.on('message', (data) => {
      this.logger.debug('Received message from WhatsApp', { size: data.length });
      this.emit(WhatsLynxEvents.RAW_MESSAGE_RECEIVED, data);
      
      // Message handlers in MessageManager will process this data
    });
  }

  /**
   * Update the connection state and emit event
   * @param state New connection state
   * @private
   */
  private setConnectionState(state: ConnectionState): void {
    const oldState = this.connectionState;
    this.connectionState = state;
    this.emit(WhatsLynxEvents.CONNECTION_STATE_CHANGED, { 
      oldState, 
      newState: state 
    });
    this.logger.debug('Connection state changed', { from: oldState, to: state });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   * @private
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.warn('Maximum reconnection attempts reached', { attempts: this.reconnectAttempts });
      this.emit(WhatsLynxEvents.RECONNECT_FAILED, {
        attempts: this.reconnectAttempts,
        message: 'Maximum reconnection attempts reached'
      });
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.options.reconnectBaseDelay * Math.pow(1.5, this.reconnectAttempts),
      this.options.reconnectMaxDelay
    );

    this.reconnectAttempts++;
    
    this.logger.info('Scheduling reconnection attempt', { 
      attempt: this.reconnectAttempts, 
      delay,
      maxAttempts: this.options.maxReconnectAttempts
    });
    
    this.emit(WhatsLynxEvents.RECONNECTING, {
      attempt: this.reconnectAttempts,
      delay
    });

    // Schedule reconnection
    this.reconnectTimeout = setTimeout(async () => {
      try {
        this.logger.info('Attempting reconnection', { attempt: this.reconnectAttempts });
        await this.connect(this.sessionData);
      } catch (error) {
        this.logger.error('Reconnection attempt failed', error);
        // If reconnection fails, it will trigger another reconnection
        // through the connection event handlers
      }
    }, delay);
  }
}
