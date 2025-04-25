import EventEmitter from 'events';
import { PairingCodeOptions, PairingCodeAuthData } from '../types';

/**
 * Pairing code based authentication implementation
 */
export class PairingCodeAuth extends EventEmitter {
  private client: any; // WhatsLynxClient
  private timeout: NodeJS.Timeout | null = null;
  private pairingCodeData: PairingCodeAuthData | null = null;

  /**
   * Create a new Pairing Code authenticator
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    super();
    this.client = client;
  }

  /**
   * Start pairing code authentication process
   * @param options Options including the phone number
   */
  async startAuthentication(options: PairingCodeOptions): Promise<void> {
    if (!options.phoneNumber) {
      throw new Error('Phone number is required for pairing code authentication');
    }

    // Validate phone number format (should be numbers only, with country code, no +)
    if (!/^\d+$/.test(options.phoneNumber)) {
      throw new Error('Phone number should contain only digits, including country code, without +');
    }

    this.clearTimeout();
    
    try {
      // Initial connection setup
      await this.sendInitialHandshake();
      
      // Set up socket listeners
      this.setupSocketListeners();
      
      // Request pairing code from server
      await this.requestPairingCode(options.phoneNumber);
      
      // Set timeout for the pairing code request
      const timeoutDuration = options.timeout || 60000 * 5; // Default 5 minutes
      this.timeout = setTimeout(() => {
        this.emit('pairing-code-timeout');
        throw new Error('Pairing code request timed out');
      }, timeoutDuration);
      
    } catch (error) {
      this.clearTimeout();
      throw error;
    }
  }

  /**
   * Send initial handshake to the WhatsApp server
   * @private
   */
  private async sendInitialHandshake(): Promise<void> {
    // Implementation depends on the actual WhatsApp Web protocol
    // This is a simplified version
    
    // 1. Generate client features and capabilities
    const clientFeatures = {
      os: 'WhatsLynx',
      version: '1.0.0',
      platform: 'web',
      releaseChannel: 'stable',
      supportsMultiDevice: true,
      supportsStatusesv3: true,
      supportsPairingCode: true
    };
    
    // 2. Send initial handshake message to server
    await this.client.socket.sendJSON({
      messageTag: 'init',
      clientId: this.client.socket.generateClientId(),
      clientFeatures,
      connectType: 'WIFI',
      connectReason: 'USER_ACTIVATED',
      timeStamp: Date.now()
    });
  }

  /**
   * Request a pairing code from the server
   * @param phoneNumber Phone number to pair with (with country code, no +)
   * @private
   */
  private async requestPairingCode(phoneNumber: string): Promise<void> {
    // Format the phone number as expected by WhatsApp servers
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber.substring(1) 
      : phoneNumber;
    
    // Send pairing code request to the server
    await this.client.socket.sendJSON({
      messageTag: 'pairing_req',
      method: 'send_pairing_code',
      phoneNumber: formattedPhone
    });
  }

  /**
   * Set up socket listeners for pairing code and auth events
   * @private
   */
  private setupSocketListeners(): void {
    // Remove any existing listeners
    this.client.socket.removeAllListeners('pairing-code');
    this.client.socket.removeAllListeners('authenticated');
    
    // Listen for pairing code from server
    this.client.socket.on('pairing-code', (data: any) => {
      this.clearTimeout();
      
      // Process pairing code data
      this.pairingCodeData = {
        pairingCode: data.pairingCode,
        pairingCodeExpiresAt: Date.now() + data.expiresIn * 1000,
        phoneNumber: data.phoneNumber,
        method: data.method || 'unknown',
        deviceName: data.deviceName
      };
      
      // Emit pairing code event
      this.emit('pairing-code', this.pairingCodeData);
      
      // Set a new timeout for the code expiration
      this.timeout = setTimeout(() => {
        this.emit('pairing-code-expired');
      }, data.expiresIn * 1000);
    });
    
    // Listen for authentication success
    this.client.socket.on('authenticated', (data: any) => {
      this.clearTimeout();
      
      // Process authentication data
      const authData = {
        credentials: {
          clientId: data.clientId,
          serverToken: data.serverToken,
          clientToken: data.clientToken,
          encKey: data.encKey,
          macKey: data.macKey,
          me: {
            id: data.wid,
            name: data.pushname || undefined,
            phoneNumber: data.phone || data.wid.split('@')[0]
          }
        },
        me: {
          id: data.wid,
          name: data.pushname || undefined,
          phoneNumber: data.phone || data.wid.split('@')[0]
        }
      };
      
      // Emit authenticated event
      this.emit('authenticated', authData);
    });
    
    // Listen for authentication failure
    this.client.socket.on('auth-failure', (error: any) => {
      this.clearTimeout();
      this.emit('auth-failure', error);
    });
  }

  /**
   * Clear the pairing code timeout
   * @private
   */
  private clearTimeout(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
