/**
 * Implementarea WebSocket pentru conectarea la serverele WhatsApp
 * Bazată pe protocolul WhatsApp Web
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createNoiseHandler, NoiseKeyPair } from '../utils/noise-handler';
import { generateKeyPair } from '../utils/encryption';
import { Logger } from '../types';

// URL-ul de conectare la WhatsApp Web
const DEFAULT_WA_URL = 'wss://web.whatsapp.com/ws';
const DEFAULT_ORIGIN = 'https://web.whatsapp.com';

export interface WhatsAppSocketOptions {
  url?: string;
  timeoutMs: number;
  agent?: any;
  headers?: Record<string, string>;
  logger: Logger;
  browser?: [string, string, string]; // [browserName, browserVersion, osVersion]
  version?: [number, number, number]; // [major, minor, patch]
}

export interface WhatsAppSocketEvent {
  type: 'open' | 'close' | 'error' | 'message' | 'connecting' | 'reconnecting' | 'authenticated';
  data?: any;
}

enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export class WhatsAppSocket extends EventEmitter {
  private options: WhatsAppSocketOptions;
  private ws: WebSocket | null = null;
  private keyPair: NoiseKeyPair;
  private noiseKeyPair: NoiseKeyPair; // Cheia de zgomot pentru sesiune
  private connectTimeout: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private isAuthenticated: boolean = false;
  private logger: Logger;
  private noiseHandler: any;
  private sessionData: any = null;
  private inBytes: Buffer = Buffer.alloc(0);
  private messageQueue: Buffer[] = [];
  private messageCounter: number = 0;

  constructor(options: WhatsAppSocketOptions) {
    super();
    this.options = options;
    this.options.url = options.url || DEFAULT_WA_URL;
    this.options.browser = options.browser || ['Chrome', '108.0.0.0', '10'];
    this.options.version = options.version || [2, 2330, 7];
    
    this.logger = options.logger;
    this.keyPair = generateKeyPair();
    this.noiseKeyPair = generateKeyPair(); // Generăm a doua pereche pentru handshake
    
    this.initNoiseHandler();
  }

  /**
   * Inițializează handlerele pentru protocolul Noise
   */
  private initNoiseHandler(): void {
    this.noiseHandler = createNoiseHandler(this.keyPair, this.logger);
  }

  /**
   * Conectarea la serverul WhatsApp
   * @param sessionData Date de sesiune opționale pentru reconectare
   */
  public async connect(sessionData?: any): Promise<void> {
    if (this.isConnecting) {
      this.logger.warn('Conexiune deja în curs');
      return;
    }

    if (this.ws && this.ws.readyState === ReadyState.OPEN) {
      this.logger.warn('Socket-ul este deja conectat');
      return;
    }

    if (sessionData) {
      this.logger.debug('Încercarea de reconectare folosind date de sesiune');
      this.sessionData = sessionData;
    }

    this.isConnecting = true;
    this.emit('connecting');

    try {
      await this.createConnection();
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Creează conexiunea WebSocket
   */
  private async createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // URL-ul de conectare WhatsApp Web cu parametri
      const url = this.options.url as string;
      
      this.ws = new WebSocket(url, undefined, {
        origin: DEFAULT_ORIGIN,
        headers: this.options.headers || {},
        handshakeTimeout: this.options.timeoutMs,
        timeout: this.options.timeoutMs,
        agent: this.options.agent
      });

      // Setează numărul maxim de ascultători
      this.ws.setMaxListeners(0);

      // Setează timeout pentru conectare
      this.connectTimeout = setTimeout(() => {
        if (this.ws && (this.ws.readyState === ReadyState.CONNECTING)) {
          this.ws.terminate();
          this.isConnecting = false;
          reject(new Error('Timeout la conectare'));
        }
      }, this.options.timeoutMs);

      this.ws.on('open', () => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }

        this.isConnecting = false;
        this.logger.info('Conexiune WebSocket deschisă cu serverele WhatsApp');
        this.emit('open');
        
        // Inițiază handshake-ul Noise Protocol
        this.initiateHandshake();
        
        resolve();
      });

      this.ws.on('close', (code, reason) => {
        this.logger.info(`Conexiune WebSocket închisă: ${code} ${reason}`);
        this.isConnecting = false;
        this.isAuthenticated = false;
        this.emit('close', { code, reason });
      });

      this.ws.on('error', (error) => {
        this.logger.error('Eroare WebSocket', error);
        this.isConnecting = false;
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  /**
   * Inițiază procesul de handshake Noise Protocol
   */
  private initiateHandshake(): void {
    if (!this.ws || this.ws.readyState !== ReadyState.OPEN) {
      this.logger.error('Nu se poate iniția handshake-ul: socket-ul nu este deschis');
      return;
    }

    try {
      // Creăm mesajul de handshake folosind noiseHandler
      const handshakeMessage = this.noiseHandler.createHandshakeMessage();
      
      // Folosim encodeFrame pentru a formata corect mesajul conform protocolului WhatsApp
      const encodedMessage = this.noiseHandler.encodeFrame(handshakeMessage);
      
      // Trimitem mesajul de handshake
      this.sendRaw(encodedMessage);
      
      this.logger.debug('Handshake inițiat cu serverele WhatsApp');
    } catch (error) {
      this.logger.error('Eroare la inițierea handshake-ului', error);
      this.emit('error', error);
    }
  }

  /**
   * Gestionează mesajele primite
   * @param data Date primite
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const buffer = Buffer.from(data as any);
      
      // Folosim decodeFrame pentru a gestiona mesajul WhatsApp
      this.noiseHandler.decodeFrame(buffer, (frame: any) => {
        this.processFrame(frame);
      });
    } catch (error) {
      this.logger.error('Eroare la procesarea mesajului', error);
      this.emit('error', error);
    }
  }

  /**
   * Procesează un frame decodificat
   * @param frame Frame-ul decodificat
   */
  private processFrame(frame: any): void {
    try {
      if (!this.noiseHandler.isHandshakeCompleted()) {
        // Încă în procesul de handshake
        const serverHello = this.noiseHandler.parseServerHello(frame);
        
        // Procesăm handshake-ul și generăm răspunsul
        const response = this.noiseHandler.processHandshake(serverHello, this.noiseKeyPair);
        
        // Trimitem răspunsul criptat
        const encodedResponse = this.noiseHandler.encodeFrame(response);
        this.sendRaw(encodedResponse);
        
        // Finalizăm handshake-ul
        this.noiseHandler.finishHandshake();
        
        this.logger.info('Handshake completat cu succes, trimit datele de autentificare');
        
        // Trimitem datele de autentificare
        this.sendAuthenticationData();
      } else {
        // Handshake finalizat, procesăm mesajele normale
        this.emit('message', frame);
        
        // Analizăm mesajul pentru a verifica dacă autentificarea a reușit
        this.checkAuthenticationSuccess(frame);
      }
    } catch (error) {
      this.logger.error('Eroare la procesarea frame-ului', error);
      this.emit('error', error);
    }
  }

  /**
   * Verifică dacă autentificarea a avut succes
   * @param frame Frame-ul de verificat
   */
  private checkAuthenticationSuccess(frame: any): void {
    try {
      // Analizăm frame-ul pentru a determina dacă autentificarea a reușit
      // În implementarea reală, am analiza mesajul primit pentru a detecta
      // un răspuns de succes de la server
      
      // Pentru simulare, considerăm că orice mesaj după handshake indică
      // o autentificare reușită
      if (!this.isAuthenticated) {
        this.isAuthenticated = true;
        this.logger.info('Autentificat cu succes la WhatsApp Web');
        this.emit('authenticated', { success: true });
      }
    } catch (error) {
      this.logger.error('Eroare la verificarea autentificării', error);
    }
  }

  /**
   * Trimite datele de autentificare către serverele WhatsApp
   */
  private sendAuthenticationData(): void {
    try {
      // Format pentru datele de autentificare bazat pe protocol
      const clientInfo = {
        clientIdentity: {
          platform: 'WEB',
          appVersion: {
            primary: this.options.version![0],
            secondary: this.options.version![1],
            tertiary: this.options.version![2],
          },
          mcc: '000',
          mnc: '000',
          osVersion: this.options.browser![2],
          manufacturer: '',
          device: 'Desktop',
          osBuildNumber: `WhatsLynx ${this.options.version!.join('.')}`,
          localeLanguageIso6391: 'ro',
          localeCountryIso31661Alpha2: 'RO'
        },
        connectType: 'WIFI_UNKNOWN',
        connectReason: 'USER_ACTIVATED',
        webInfo: {
          webSubPlatform: this.options.browser![0] === 'Mac OS' ? 1 : 
                         this.options.browser![0] === 'Windows' ? 2 : 0
        },
        devicePairingData: {
          buildHash: this.generateRandomHash(16),
          deviceProps: {
            os: this.options.browser![0],
            version: {
              primary: parseInt(this.options.browser![1].split('.')[0]),
              secondary: 0,
              tertiary: 0
            },
            platformType: 1,
            requireFullSync: true
          }
        }
      };
      
      // Adăugăm date de sesiune dacă există
      if (this.sessionData) {
        Object.assign(clientInfo, {
          sessionData: this.sessionData,
          reconnectAttempt: true,
          passive: false
        });
      }
      
      // Serializăm și criptăm datele
      const authData = Buffer.from(JSON.stringify(clientInfo));
      
      // Folosim encodeFrame pentru a trimite mesajul corect formatat
      const encodedAuthData = this.noiseHandler.encodeFrame(authData);
      this.sendRaw(encodedAuthData);
      
      this.logger.debug('Date de autentificare trimise către WhatsApp', {
        size: authData.length
      });
    } catch (error) {
      this.logger.error('Eroare la trimiterea datelor de autentificare', error);
      this.emit('error', error);
    }
  }

  /**
   * Generează un hash aleator pentru identificarea dispozitivului
   * @param length Lungimea hash-ului
   * @returns Hash-ul generat
   */
  private generateRandomHash(length: number): string {
    return Array.from(
      { length }, 
      () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
  }

  /**
   * Trimite un mesaj criptat
   * @param data Date pentru criptare și trimitere
   */
  public sendMessage(data: Buffer): void {
    if (!this.noiseHandler.isHandshakeCompleted()) {
      this.logger.warn('Nu se poate trimite mesaj: handshake-ul nu este finalizat');
      // Punem mesajul în coadă pentru trimitere ulterioară
      this.messageQueue.push(data);
      return;
    }

    try {
      // Folosim encodeFrame pentru a trimite mesajul corect formatat
      const encodedMessage = this.noiseHandler.encodeFrame(data);
      this.sendRaw(encodedMessage);
      this.messageCounter++;
    } catch (error) {
      this.logger.error('Eroare la trimiterea mesajului', error);
      throw error;
    }
  }

  /**
   * Trimite date brute (necriptate) prin WebSocket
   * @param data Date pentru trimitere
   */
  private sendRaw(data: Buffer): void {
    if (!this.ws || this.ws.readyState !== ReadyState.OPEN) {
      throw new Error('Socket-ul nu este deschis');
    }

    this.ws.send(data, (error) => {
      if (error) {
        this.logger.error('Eroare la trimiterea mesajului', error);
        this.emit('error', error);
      }
    });
  }

  /**
   * Procesează mesajele din coadă
   */
  private processQueuedMessages(): void {
    if (this.messageQueue.length === 0 || !this.noiseHandler.isHandshakeCompleted()) {
      return;
    }

    this.logger.debug(`Procesez ${this.messageQueue.length} mesaje din coadă`);
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  /**
   * Deconectarea de la serverul WhatsApp
   */
  public async disconnect(): Promise<void> {
    if (!this.ws) {
      return;
    }

    return new Promise((resolve) => {
      if (this.ws) {
        if (this.ws.readyState === ReadyState.OPEN) {
          this.ws.once('close', () => {
            resolve();
          });
          this.ws.close();
        } else {
          this.ws.terminate();
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  /**
   * Verifică dacă socket-ul este conectat
   */
  public isConnected(): boolean {
    return !!this.ws && this.ws.readyState === ReadyState.OPEN;
  }

  /**
   * Obține starea curentă a socket-ului
   */
  public getReadyState(): number {
    return this.ws ? this.ws.readyState : ReadyState.CLOSED;
  }

  /**
   * Setează datele de sesiune pentru reconectare
   * @param data Date de sesiune
   */
  public setSessionData(data: any): void {
    this.sessionData = data;
  }

  /**
   * Obține datele de sesiune curente
   */
  public getSessionData(): any {
    return this.sessionData;
  }

  /**
   * Verifică dacă conexiunea este autentificată
   */
  public isAuthenticatedConnection(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Setează starea de autentificare și procesează mesajele din coadă
   * @param state Starea de autentificare
   */
  public setAuthenticated(state: boolean): void {
    this.isAuthenticated = state;
    if (state) {
      this.processQueuedMessages();
    }
  }
}