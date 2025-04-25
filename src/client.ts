import EventEmitter from 'events';
import { AuthManager } from './auth';
import { SocketConnection } from './connection/socket';
import { HttpClient } from './connection/http';
import { KeepAlive } from './connection/keep-alive';
import { MessageManager } from './message';
import { MediaManager } from './media';
import { GroupManager } from './groups';
import { ProfileManager } from './profile';
import { StatusManager } from './status';
import { ClientOptions, ConnectionState, WhatsLynxEvents } from './types';
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

  // Core components
  public auth: AuthManager;
  public socket: SocketConnection;
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

    // Initialize core components
    this.socket = new SocketConnection(this);
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
    
    try {
      // If session data is provided, attempt to restore session
      if (sessionData) {
        this.sessionData = sessionData;
        this.emit(WhatsLynxEvents.SESSION_RESTORE_ATTEMPT);
        
        try {
          await this.socket.connect();
          await this.auth.restoreSession(sessionData);
        } catch (error) {
          this.emit(WhatsLynxEvents.SESSION_RESTORE_FAILED, error);
          // Fall back to fresh authentication if session restore fails
          this.sessionData = null;
          await this.socket.reconnect();
          await this.auth.startAuthentication();
        }
      } else {
        // Fresh connection
        await this.socket.connect();
        await this.auth.startAuthentication();
      }

      // Once authenticated, start keep-alive mechanism
      this.keepAlive.start();
      this.setConnectionState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.emit(WhatsLynxEvents.CONNECTED);

    } catch (error) {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.lastDisconnectReason = error.message || 'Unknown error during connection';
      this.emit(WhatsLynxEvents.CONNECTION_FAILED, error);
      
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
    } catch (error) {
      this.setConnectionState(ConnectionState.DISCONNECTED);
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      throw error;
    }
  }

  /**
   * Check if client is connected to WhatsApp servers
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
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
    return this.sessionData;
  }

  /**
   * Update the session data
   * @param data New session data
   */
  updateSessionData(data: any): void {
    this.sessionData = { ...this.sessionData, ...data };
    this.emit(WhatsLynxEvents.SESSION_DATA_UPDATED, this.sessionData);
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
  }

  /**
   * Get the last disconnection reason
   * @returns Reason for last disconnection or null
   */
  getLastDisconnectReason(): string | null {
    return this.lastDisconnectReason;
  }

  /**
   * Bind internal event handlers
   * @private
   */
  private bindEvents(): void {
    this.socket.on('error', (error) => {
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = error.message || 'Socket error';
        
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    });

    this.socket.on('close', (event) => {
      if (this.connectionState !== ConnectionState.DISCONNECTING && 
          this.connectionState !== ConnectionState.DISCONNECTED) {
        
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.lastDisconnectReason = 'Connection closed unexpectedly';
        this.emit(WhatsLynxEvents.DISCONNECTED, { reason: this.lastDisconnectReason });
        
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      }
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
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   * @private
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
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
    
    this.emit(WhatsLynxEvents.RECONNECTING, {
      attempt: this.reconnectAttempts,
      delay
    });

    // Schedule reconnection
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(this.sessionData);
      } catch (error) {
        // If reconnection fails, it will trigger another reconnection
        // through the connection event handlers
      }
    }, delay);
  }
}
