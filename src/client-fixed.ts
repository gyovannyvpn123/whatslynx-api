import EventEmitter from 'events';
import { AuthManager } from './auth';
import { SocketConnection } from './connection/socket-fixed';
import { HttpClient } from './connection/http-fixed2';
import { KeepAlive } from './connection/keep-alive';
import { MessageManager } from './message';
import { MediaManager } from './media';
import { GroupManager } from './groups/index-fixed';
import { ProfileManager } from './profile';
import { StatusManager } from './status';
import { ClientOptions, ConnectionState, WhatsLynxEvents } from './types';
import { DEFAULT_CLIENT_OPTIONS } from './utils/constants';
import { getErrorMessage } from './utils/error-handler';

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
   * @param options Client options
   */
  constructor(options: Partial<ClientOptions> = {}) {
    super();
    
    // Merge default options with provided options
    this.options = {
      ...DEFAULT_CLIENT_OPTIONS,
      ...options
    };
    
    // Initialize state
    this.connectionState = ConnectionState.DISCONNECTED;
    
    // Set max listeners to higher value
    this.setMaxListeners(50);
    
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
    
    // Initialize event listeners
    this.initializeEventListeners();
  }
  
  /**
   * Connect to WhatsApp Web
   * @param sessionData Optional session data for restoring a session
   * @returns Promise that resolves when connected
   */
  async connect(sessionData?: any): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      if (this.options.logger) {
        this.options.logger('warn', 'Already connected, disconnect first');
      }
      return;
    }
    
    if (this.connectionState === ConnectionState.CONNECTING) {
      if (this.options.logger) {
        this.options.logger('warn', 'Connection already in progress');
      }
      return;
    }
    
    try {
      // Set connection state to connecting
      this.setConnectionState(ConnectionState.CONNECTING);
      
      // Reset reconnect attempts
      this.reconnectAttempts = 0;
      
      // Load session data if provided
      if (sessionData) {
        this.sessionData = sessionData;
      }
      
      // Attempt to connect socket
      if (this.options.logger) {
        this.options.logger('info', 'Connecting to WhatsApp Web...');
      }
      await this.socket.connect();
      
      // Start keepalive if enabled
      if (this.options.keepAliveEnabled) {
        this.keepAlive.start();
      }
      
      // Emit connected event
      this.emit(WhatsLynxEvents.CONNECTED);
      
      // Set connection state to connected
      this.setConnectionState(ConnectionState.CONNECTED);
      
      if (this.options.logger) {
        this.options.logger('info', 'Connected to WhatsApp Web');
      }
    } catch (error) {
      // Set connection state to disconnected
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Set disconnect reason
      this.lastDisconnectReason = getErrorMessage(error);
      
      // Emit error events
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      
      // Throw the error
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
      this.options.logger('warn', 'Already disconnected');
      return;
    }
    
    try {
      // Set connection state to disconnecting
      this.setConnectionState(ConnectionState.DISCONNECTING);
      
      // Emit disconnecting event
      this.emit(WhatsLynxEvents.DISCONNECTING, { reason });
      
      // Stop keepalive
      this.keepAlive.stop();
      
      // Disconnect socket
      await this.socket.disconnect(reason);
      
      // Set connection state to disconnected
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Set disconnect reason
      this.lastDisconnectReason = reason;
      
      // Emit disconnected event
      this.emit(WhatsLynxEvents.DISCONNECTED, { reason });
      
      this.options.logger('info', `Disconnected from WhatsApp Web: ${reason}`);
    } catch (error) {
      // Set connection state to disconnected anyway
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Set disconnect reason
      this.lastDisconnectReason = getErrorMessage(error);
      
      // Emit error events
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
      
      // Throw the error
      throw error;
    }
  }
  
  /**
   * Log out from WhatsApp Web
   * @returns Promise that resolves when logged out
   */
  async logout(): Promise<void> {
    try {
      // Execute logout on the server
      await this.auth.logout();
      
      // Clear session data
      this.clearSessionData();
      
      // Disconnect from server
      await this.disconnect('logout');
      
      this.options.logger('info', 'Logged out successfully');
    } catch (error) {
      // Just clear session data and disconnect anyway
      this.clearSessionData();
      await this.disconnect('logout_error');
      
      // Emit error events
      this.emit(WhatsLynxEvents.AUTH_ERROR, error);
      
      // Throw the error
      throw error;
    }
  }
  
  /**
   * Check if connected to WhatsApp Web
   * @returns True if connected, false otherwise
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
    return this.sessionData;
  }
  
  /**
   * Save session data for future use
   * @param data Session data to save
   */
  saveSessionData(data: any): void {
    this.sessionData = data;
    this.emit(WhatsLynxEvents.AUTH_AUTHENTICATED, data);
  }
  
  /**
   * Clear saved session data
   */
  clearSessionData(): void {
    this.sessionData = null;
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
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Check if auto-reconnect is enabled
    if (!this.options.autoReconnect) {
      this.emit(WhatsLynxEvents.RECONNECT_FAILED, {
        attempts: this.reconnectAttempts,
        reason: 'Auto-reconnect is disabled'
      });
      return;
    }
    
    // Check if maximum reconnect attempts exceeded
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit(WhatsLynxEvents.RECONNECT_FAILED, {
        attempts: this.reconnectAttempts,
        reason: 'Maximum reconnect attempts exceeded'
      });
      return;
    }
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.options.reconnectInitialDelay * Math.pow(this.options.reconnectBackoffFactor, this.reconnectAttempts),
      this.options.reconnectMaxDelay
    );
    
    // Increment reconnect attempts
    this.reconnectAttempts++;
    
    // Set connection state to reconnecting
    this.setConnectionState(ConnectionState.RECONNECTING);
    
    // Emit reconnecting event
    this.emit(WhatsLynxEvents.RECONNECTING, {
      delay,
      attempts: this.reconnectAttempts,
      reason
    });
    
    // Schedule reconnection attempt
    this.reconnectTimeout = setTimeout(async () => {
      try {
        // Connect with existing session data
        await this.connect(this.sessionData);
        
        // Reset reconnect attempts on success
        this.reconnectAttempts = 0;
      } catch (error) {
        // Log the error
        this.options.logger('error', 'Reconnection attempt failed', error);
        
        // Try again
        this.attemptReconnect(getErrorMessage(error));
      }
    }, delay);
  }
  
  /**
   * Update the connection state and emit events
   * @param state New connection state
   * @private
   */
  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState;
    this.connectionState = state;
    
    this.emit(WhatsLynxEvents.CONNECTION_UPDATE, {
      previousState,
      currentState: state
    });
  }
  
  /**
   * Initialize event listeners
   * @private
   */
  private initializeEventListeners(): void {
    // Socket events
    this.socket.on('close', (reason: string) => {
      // Update connection state
      this.setConnectionState(ConnectionState.DISCONNECTED);
      
      // Set disconnect reason
      this.lastDisconnectReason = reason;
      
      // Emit disconnected event
      this.emit(WhatsLynxEvents.DISCONNECTED, { reason });
      
      // Attempt to reconnect if not a clean disconnect
      if (reason !== 'client_disconnect' && reason !== 'logout') {
        this.attemptReconnect(reason);
      }
    });
    
    this.socket.on('error', (error: any) => {
      this.emit(WhatsLynxEvents.CONNECTION_ERROR, error);
    });
    
    // Auth events
    this.auth.on('authenticated', (sessionData: any) => {
      this.saveSessionData(sessionData);
      this.emit(WhatsLynxEvents.AUTHENTICATED, sessionData);
    });
    
    this.auth.on('logout', () => {
      this.clearSessionData();
      this.emit(WhatsLynxEvents.AUTH_LOGOUT);
    });
    
    // General error event
    this.on('error', (error: any) => {
      // Log errors to prevent unhandled error events
      this.options.logger('error', 'WhatsLynx error', error);
    });
  }
}