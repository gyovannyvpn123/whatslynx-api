import EventEmitter from 'events';
import { QRCodeAuth } from './qr-auth';
import { PairingCodeAuth } from './pairing-code-auth';
import { 
  AuthMethod, 
  AuthState, 
  PairingCodeOptions, 
  SessionData,
  WhatsLynxEvents
} from '../types';

/**
 * Main authentication manager
 * Handles the authentication process and session management
 */
export class AuthManager extends EventEmitter {
  private client: any; // WhatsLynxClient
  private qrAuth: QRCodeAuth;
  private pairingAuth: PairingCodeAuth;
  private state: AuthState = AuthState.NEED_AUTH;
  private authMethod: AuthMethod | null = null;
  private sessionData: SessionData | null = null;

  /**
   * Create a new authentication manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
    this.qrAuth = new QRCodeAuth(client);
    this.pairingAuth = new PairingCodeAuth(client);
    
    // Forward auth events from authentication methods
    this.forwardEvents();
  }

  /**
   * Start the authentication process
   * Uses QR code authentication by default
   */
  async startAuthentication(): Promise<void> {
    if (this.state === AuthState.AUTHENTICATED) {
      throw new Error('Client is already authenticated');
    }

    this.setState(AuthState.AUTHENTICATING);
    this.authMethod = AuthMethod.QR_CODE;
    
    try {
      await this.qrAuth.startAuthentication();
    } catch (error: any) {
      this.setState(AuthState.AUTH_FAILED);
      this.client.emit(WhatsLynxEvents.AUTH_FAILED, {
        code: 'QR_AUTH_FAILED',
        message: error.message || 'Authentication failed',
        method: this.authMethod,
        stack: error.stack || ''
      });
      throw error;
    }
  }

  /**
   * Start authentication with pairing code
   * @param options Pairing code options (phone number)
   */
  async startPairingCodeAuth(options: PairingCodeOptions): Promise<void> {
    if (this.state === AuthState.AUTHENTICATED) {
      throw new Error('Client is already authenticated');
    }

    this.setState(AuthState.AUTHENTICATING);
    this.authMethod = AuthMethod.PAIRING_CODE;
    
    try {
      await this.pairingAuth.startAuthentication(options);
    } catch (error: any) {
      this.setState(AuthState.AUTH_FAILED);
      this.client.emit(WhatsLynxEvents.AUTH_FAILED, {
        code: 'PAIRING_AUTH_FAILED',
        message: error.message || 'Pairing code authentication failed',
        method: this.authMethod,
        stack: error.stack || ''
      });
      throw error;
    }
  }

  /**
   * Restore an existing session
   * @param sessionData Previous session data
   */
  async restoreSession(sessionData: SessionData): Promise<void> {
    if (this.state === AuthState.AUTHENTICATED) {
      throw new Error('Client is already authenticated');
    }

    this.sessionData = sessionData;
    
    try {
      // Implement session restoration logic here
      // This will vary based on WhatsApp Web protocol details
      
      const { authCredentials } = sessionData;
      
      // Validate credentials
      if (!authCredentials || !authCredentials.clientId || 
          !authCredentials.serverToken || !authCredentials.clientToken ||
          !authCredentials.encKey || !authCredentials.macKey) {
        throw new Error('Invalid session data');
      }
      
      // Send session restore command to server
      // This is a simplified placeholder for the actual implementation
      await this.client.socket.sendRestoreSessionCommand(authCredentials);
      
      // Wait for server to acknowledge the restored session
      const success = await new Promise((resolve, reject) => {
        // Set timeout for session restore
        const timeout = setTimeout(() => {
          reject(new Error('Session restore timed out'));
        }, 15000);
        
        // Listen for successful restoration
        const onSuccess = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        
        // Listen for failure
        const onFailure = (error: any) => {
          clearTimeout(timeout);
          reject(error);
        };
        
        // Add temporary listeners
        this.client.once(WhatsLynxEvents.AUTHENTICATED, onSuccess);
        this.client.once(WhatsLynxEvents.AUTH_FAILED, onFailure);
      });
      
      if (success) {
        this.setState(AuthState.AUTHENTICATED);
        this.client.emit(WhatsLynxEvents.AUTHENTICATED, {
          credentials: authCredentials,
          me: authCredentials.me
        });
      }
    } catch (error: any) {
      this.setState(AuthState.AUTH_FAILED);
      this.sessionData = null;
      this.client.emit(WhatsLynxEvents.AUTH_FAILED, {
        code: 'SESSION_RESTORE_FAILED',
        message: error.message || 'Session restoration failed',
        method: 'session',
        stack: error.stack || ''
      });
      throw error;
    }
  }

  /**
   * Get the current authentication state
   * @returns Current auth state
   */
  getState(): AuthState {
    return this.state;
  }

  /**
   * Check if the client is authenticated
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.state === AuthState.AUTHENTICATED;
  }

  /**
   * Get the current authentication method
   * @returns Current auth method or null
   */
  getMethod(): AuthMethod | null {
    return this.authMethod;
  }

  /**
   * Get the session data
   * @returns Current session data or null
   */
  getSessionData(): SessionData | null {
    return this.sessionData;
  }
  
  /**
   * Derive session keys from shared secret
   * @param sharedSecret Shared secret from ECDH key exchange
   * @returns Object containing encryption and MAC keys
   */
  deriveSessionKeys(sharedSecret: Buffer): { encKey: Buffer, macKey: Buffer } {
    // Import utility functions from encryption module
    const { hkdfDerive } = require('../utils/encryption');
    
    // Derive keys using HKDF with WhatsApp-specific parameters
    const derivedKeys = hkdfDerive(sharedSecret, 64, 'WhatsApp Encrypted Media Keys', null);
    
    return {
      encKey: derivedKeys.slice(0, 32),  // First 32 bytes for encryption
      macKey: derivedKeys.slice(32, 64)  // Next 32 bytes for authentication
    };
  }

  /**
   * Set the authentication state and emit event
   * @param state New auth state
   * @private
   */
  private setState(state: AuthState): void {
    this.state = state;
    this.emit('state-changed', state);
  }

  /**
   * Forward events from authentication methods
   * @private
   */
  private forwardEvents(): void {
    // Forward QR auth events
    this.qrAuth.on('qr', (data) => {
      this.client.emit(WhatsLynxEvents.QR_CODE_RECEIVED, data);
    });
    
    this.qrAuth.on('authenticated', (data) => {
      this.setState(AuthState.AUTHENTICATED);
      this.sessionData = {
        authCredentials: data.credentials,
        lastSeen: Date.now(),
        browser: {
          name: 'WhatsLynx',
          version: '1.0.0'
        }
      };
      this.client.updateSessionData(this.sessionData);
      this.client.emit(WhatsLynxEvents.AUTHENTICATED, data);
    });
    
    // Forward pairing auth events
    this.pairingAuth.on('pairing-code', (data) => {
      this.client.emit(WhatsLynxEvents.PAIRING_CODE_RECEIVED, data);
    });
    
    this.pairingAuth.on('authenticated', (data) => {
      this.setState(AuthState.AUTHENTICATED);
      this.sessionData = {
        authCredentials: data.credentials,
        lastSeen: Date.now(),
        browser: {
          name: 'WhatsLynx',
          version: '1.0.0'
        }
      };
      this.client.updateSessionData(this.sessionData);
      this.client.emit(WhatsLynxEvents.AUTHENTICATED, data);
    });
  }

  /**
   * Logout from WhatsApp
   */
  async logout(): Promise<void> {
    // Implement logout logic
    try {
      // Send logout command to server
      await this.client.socket.sendLogoutCommand();
      
      // Clear session data
      this.sessionData = null;
      this.setState(AuthState.NEED_AUTH);
      
      // Emit event
      this.client.emit(WhatsLynxEvents.AUTH_LOGOUT, {
        success: true,
        timestamp: Date.now()
      });
    } catch (error: any) {
      this.client.emit(WhatsLynxEvents.ERROR, {
        code: 'LOGOUT_FAILED',
        message: error.message || 'Logout failed',
        stack: error.stack || ''
      });
      throw error;
    }
  }
}

// Export authentication methods and state enums
export { AuthMethod, AuthState, QRCodeAuth, PairingCodeAuth };
