import EventEmitter from 'events';
import { PairingCodeOptions, PairingCodeAuthData } from '../types';
import { isValidPhoneNumber } from '../utils/validators-fixed';
import { PROTOCOL } from '../utils/constants';
import { generateMessageID } from '../utils/binary-fixed';

/**
 * Pairing code based authentication implementation
 * This uses the new WhatsApp multi-device pairing code feature
 */
export class PairingCodeAuth extends EventEmitter {
  private client: any; // WhatsLynxClient
  private timeout: NodeJS.Timeout | null = null;
  private pairingCodeData: PairingCodeAuthData | null = null;
  private attempts: number = 0;
  private maxAttempts: number = 3;

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
    if (!isValidPhoneNumber(options.phoneNumber)) {
      throw new Error('Phone number should contain only digits, including country code, without +');
    }

    this.clearTimeout();
    this.attempts = 0;
    
    try {
      // Make sure we're connected
      if (!this.client.socket.isConnected()) {
        await this.client.socket.connect();
      }
      
      // Set up socket listeners
      this.setupSocketListeners();
      
      // Request pairing code from server
      await this.requestPairingCode(options.phoneNumber);
      
      // Set timeout for the pairing code request
      const timeoutDuration = options.timeout || PROTOCOL.PAIRING_CODE_TTL_MS;
      this.timeout = setTimeout(() => {
        this.emit('pairing-code-timeout');
        
        // Try again if we haven't reached max attempts
        if (this.attempts < this.maxAttempts) {
          this.attempts++;
          this.requestPairingCode(options.phoneNumber).catch(error => {
            this.emit('error', error);
          });
        } else {
          this.emit('pairing-code-max-attempts');
        }
      }, timeoutDuration);
      
    } catch (error: any) {
      this.clearTimeout();
      throw error;
    }
  }

  /**
   * Request a pairing code from the server
   * @param phoneNumber Phone number to pair with (with country code, no +)
   * @private
   */
  private async requestPairingCode(phoneNumber: string): Promise<void> {
    try {
      // Format the phone number as expected by WhatsApp servers
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber.substring(1) 
        : phoneNumber;
      
      // Send pairing code request to the server
      await this.client.socket.sendPairingCodeRequest(formattedPhone);
    } catch (error: any) {
      this.emit('error', new Error(`Failed to request pairing code: ${error.message || 'Unknown error'}`));
      throw error;
    }
  }

  /**
   * Set up socket listeners for pairing code and auth events
   * @private
   */
  private setupSocketListeners(): void {
    // Remove any existing listeners to avoid duplicates
    this.client.socket.removeAllListeners('pairing-code');
    this.client.socket.removeAllListeners('authenticated');
    this.client.socket.removeAllListeners('auth-failure');
    
    // Listen for pairing code from server
    this.client.socket.on('pairing-code', (data: any) => {
      this.clearTimeout();
      
      // Process pairing code data
      this.pairingCodeData = {
        pairingCode: data.pairingCode,
        pairingCodeExpiresAt: data.pairingCodeExpiresAt,
        phoneNumber: data.phoneNumber,
        method: 'multi-device',
        deviceName: this.client.getOptions().deviceName || 'WhatsLynx Client'
      };
      
      // Emit pairing code event
      this.emit('pairing-code', this.pairingCodeData);
      
      // Set a new timeout for the code expiration
      const expiresIn = Math.max(1000, data.pairingCodeExpiresAt - Date.now());
      this.timeout = setTimeout(() => {
        this.emit('pairing-code-expired');
      }, expiresIn);
    });
    
    // Listen for authentication success
    this.client.socket.on('authenticated', (data: any) => {
      this.clearTimeout();
      
      // Process authentication data
      const authData = {
        credentials: {
          clientId: data.clientId || this.client.socket.generateClientId(),
          serverToken: data.serverToken,
          clientToken: data.clientToken,
          encKey: data.encKey,
          macKey: data.macKey,
          me: {
            id: data.wid || data.id,
            name: data.pushname || undefined,
            phoneNumber: data.phone || (data.wid || data.id || '').split('@')[0]
          }
        },
        me: {
          id: data.wid || data.id,
          name: data.pushname || undefined,
          phoneNumber: data.phone || (data.wid || data.id || '').split('@')[0]
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