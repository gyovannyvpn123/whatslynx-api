/**
 * Manager pentru gestionarea autentificării la WhatsApp Web
 */

import { EventEmitter } from 'events';
import qrcode from 'qrcode-terminal';
import { WhatsAppSocket } from '../connection/whatsapp-socket';
import { Logger } from '../types';
import { generateUniqueToken } from '../utils/encryption';

export interface AuthManagerOptions {
  socket: WhatsAppSocket;
  logger: Logger;
  printQRInTerminal?: boolean;
  autoScanQR?: boolean;
  maxQRAttempts?: number;
  qrTimeout?: number;
}

export interface QRCodeEvent {
  qrCode: string;
  attempt: number;
  maxAttempts: number;
}

export interface PairingCodeEvent {
  pairingCode: string;
  deviceIdentifier: string;
  timeLeft: number;
}

export class AuthManager extends EventEmitter {
  private options: AuthManagerOptions;
  private logger: Logger;
  private socket: WhatsAppSocket;
  private qrCodeAttempts: number = 0;
  private qrRefreshTimer: NodeJS.Timeout | null = null;
  private isAuthenticating: boolean = false;
  private authenticated: boolean = false;
  private isMultiDevice: boolean = true; // WhatsApp mult-device este acum standard
  private sessionData: any = null;

  constructor(options: AuthManagerOptions) {
    super();
    this.options = options;
    this.logger = options.logger;
    this.socket = options.socket;
    
    this.setupSocketListeners();
  }

  /**
   * Configurează ascultătorii pentru evenimente de socket
   */
  private setupSocketListeners(): void {
    this.socket.on('message', (data: Buffer) => {
      this.handleSocketMessage(data);
    });

    this.socket.on('handshake', () => {
      this.logger.debug('Handshake completat, pregătit pentru autentificare');
    });

    this.socket.on('close', () => {
      this.stopQRRefresh();
      this.isAuthenticating = false;
      this.authenticated = false;
    });
  }

  /**
   * Gestionează mesajele primite de la socket
   * @param data Date primite
   */
  private handleSocketMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'qr') {
        this.handleQRCode(message.data);
      } else if (message.type === 'auth_success') {
        this.handleAuthSuccess(message.data);
      } else if (message.type === 'auth_failure') {
        this.handleAuthFailure(message.error);
      } else if (message.type === 'pairing_code') {
        this.handlePairingCode(message.data);
      }
    } catch (error) {
      this.logger.error('Eroare la procesarea mesajului de autentificare', error);
    }
  }

  /**
   * Gestionează primirea unui cod QR
   * @param data Date despre codul QR
   */
  private handleQRCode(data: { qrCode: string }): void {
    this.qrCodeAttempts++;
    
    const maxAttempts = this.options.maxQRAttempts || 5;
    
    if (this.qrCodeAttempts > maxAttempts) {
      this.stopQRRefresh();
      this.emit('qr.failed', { reason: 'Maximum QR attempts reached' });
      return;
    }
    
    const qrEvent: QRCodeEvent = {
      qrCode: data.qrCode,
      attempt: this.qrCodeAttempts,
      maxAttempts
    };
    
    this.emit('qr', qrEvent);
    
    if (this.options.printQRInTerminal) {
      console.log(`QR Code (Attempt ${this.qrCodeAttempts}/${maxAttempts}):`);
      qrcode.generate(data.qrCode, { small: true });
    }
    
    // Setează timer pentru reînnoirea codului QR
    const qrTimeout = this.options.qrTimeout || 60000; // 60 secunde default
    this.resetQRRefreshTimer(qrTimeout);
  }

  /**
   * Gestionează primirea unui cod de asociere
   * @param data Date despre codul de asociere
   */
  private handlePairingCode(data: { pairingCode: string, deviceIdentifier: string, timeLeft: number }): void {
    const pairingEvent: PairingCodeEvent = {
      pairingCode: data.pairingCode,
      deviceIdentifier: data.deviceIdentifier,
      timeLeft: data.timeLeft
    };
    
    this.emit('pairing.code', pairingEvent);
    
    if (this.options.printQRInTerminal) {
      console.log(`Cod de asociere: ${data.pairingCode}`);
      console.log(`ID dispozitiv: ${data.deviceIdentifier}`);
      console.log(`Timp rămas: ${Math.floor(data.timeLeft / 1000)} secunde`);
    }
  }

  /**
   * Gestionează succesul autentificării
   * @param data Date de sesiune
   */
  private handleAuthSuccess(data: any): void {
    this.stopQRRefresh();
    this.isAuthenticating = false;
    this.authenticated = true;
    this.sessionData = data;
    
    this.socket.setAuthenticated(true);
    this.socket.setSessionData(data);
    
    this.emit('authenticated', data);
    
    this.logger.info('Autentificare reușită');
  }

  /**
   * Gestionează eșecul autentificării
   * @param error Eroare de autentificare
   */
  private handleAuthFailure(error: any): void {
    this.stopQRRefresh();
    this.isAuthenticating = false;
    this.authenticated = false;
    
    this.emit('auth.failure', error);
    
    this.logger.error('Autentificare eșuată', error);
  }

  /**
   * Oprește reînnoirea codului QR
   */
  private stopQRRefresh(): void {
    if (this.qrRefreshTimer) {
      clearTimeout(this.qrRefreshTimer);
      this.qrRefreshTimer = null;
    }
  }

  /**
   * Resetează timer-ul pentru reînnoirea codului QR
   * @param timeout Timeout în ms
   */
  private resetQRRefreshTimer(timeout: number): void {
    this.stopQRRefresh();
    
    this.qrRefreshTimer = setTimeout(() => {
      if (this.isAuthenticating && !this.authenticated) {
        this.requestQRCode();
      }
    }, timeout);
  }

  /**
   * Solicită un nou cod QR
   */
  private requestQRCode(): void {
    if (!this.socket.isConnected()) {
      this.logger.warn('Nu se poate solicita codul QR: socket-ul nu este conectat');
      return;
    }
    
    try {
      const request = {
        type: 'request_qr',
        id: generateUniqueToken()
      };
      
      this.socket.sendEncrypted(Buffer.from(JSON.stringify(request)));
      this.logger.debug('Solicitare cod QR trimisă');
    } catch (error) {
      this.logger.error('Eroare la solicitarea codului QR', error);
      this.emit('error', error);
    }
  }

  /**
   * Solicită un cod de asociere
   * @param phoneNumber Număr de telefon pentru asociere
   */
  public requestPairingCode(phoneNumber: string): void {
    if (!this.socket.isConnected()) {
      throw new Error('Nu se poate solicita codul de asociere: socket-ul nu este conectat');
    }
    
    try {
      // Formatează numărul de telefon
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber.slice(1) 
        : phoneNumber;
      
      const request = {
        type: 'request_pairing_code',
        id: generateUniqueToken(),
        data: {
          phoneNumber: formattedPhone
        }
      };
      
      this.socket.sendEncrypted(Buffer.from(JSON.stringify(request)));
      this.logger.debug('Solicitare cod de asociere trimisă');
    } catch (error) {
      this.logger.error('Eroare la solicitarea codului de asociere', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Inițiază procesul de autentificare
   * @param sessionData Date de sesiune opționale pentru reconectare
   */
  public async startAuthentication(sessionData?: any): Promise<void> {
    if (this.isAuthenticating) {
      this.logger.warn('Autentificare deja în curs');
      return;
    }
    
    this.isAuthenticating = true;
    this.authenticated = false;
    this.qrCodeAttempts = 0;
    
    if (sessionData) {
      this.logger.debug('Încercarea de reconectare folosind date de sesiune');
      this.sessionData = sessionData;
      
      try {
        const request = {
          type: 'restore_session',
          id: generateUniqueToken(),
          data: sessionData
        };
        
        this.socket.sendEncrypted(Buffer.from(JSON.stringify(request)));
      } catch (error) {
        this.logger.error('Eroare la restaurarea sesiunii', error);
        this.emit('error', error);
        this.isAuthenticating = false;
        throw error;
      }
    } else {
      // Solicită cod QR dacă nu avem date de sesiune
      this.requestQRCode();
    }
  }

  /**
   * Deconectare (logout)
   */
  public async logout(): Promise<void> {
    if (!this.socket.isConnected() || !this.authenticated) {
      this.logger.warn('Nu se poate face logout: nu este autentificat');
      return;
    }
    
    try {
      const request = {
        type: 'logout',
        id: generateUniqueToken()
      };
      
      this.socket.sendEncrypted(Buffer.from(JSON.stringify(request)));
      this.logger.debug('Cerere de logout trimisă');
      
      // Resetează starea
      this.authenticated = false;
      this.sessionData = null;
      this.socket.setAuthenticated(false);
      this.socket.setSessionData(null);
      
      this.emit('logout');
    } catch (error) {
      this.logger.error('Eroare la logout', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Verifică dacă clientul este autentificat
   */
  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Obține datele de sesiune curente
   */
  public getSessionData(): any {
    return this.sessionData;
  }

  /**
   * Setează datele de sesiune
   * @param data Date de sesiune
   */
  public setSessionData(data: any): void {
    this.sessionData = data;
    if (data) {
      this.authenticated = true;
      this.socket.setAuthenticated(true);
      this.socket.setSessionData(data);
    } else {
      this.authenticated = false;
      this.socket.setAuthenticated(false);
      this.socket.setSessionData(null);
    }
  }
}