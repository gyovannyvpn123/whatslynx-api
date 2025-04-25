/**
 * Authentication methods supported by WhatsLynx
 */
export enum AuthMethod {
  QR_CODE = 'QR_CODE',
  PAIRING_CODE = 'PAIRING_CODE'
}

/**
 * Authentication state for the client
 */
export enum AuthState {
  NEED_AUTH = 'NEED_AUTH',
  AUTHENTICATING = 'AUTHENTICATING',
  AUTHENTICATED = 'AUTHENTICATED',
  AUTH_FAILED = 'AUTH_FAILED'
}

/**
 * QR code authentication data
 */
export interface QRCodeAuthData {
  qrCode: string;
  qrCodeBase64: string;
  timeout: number;
  attempts: number;
  pairingCode?: string;
}

/**
 * Options for pairing code authentication
 */
export interface PairingCodeOptions {
  /**
   * Phone number to use for pairing (with country code, no +)
   * e.g., "14155552671" for +1 415 555 2671
   */
  phoneNumber: string;
  
  /**
   * Timeout for pairing code request (in ms)
   */
  timeout?: number;
}

/**
 * Pairing code authentication data
 */
export interface PairingCodeAuthData {
  pairingCode: string;
  pairingCodeExpiresAt: number;
  phoneNumber: string;
  method: 'sms' | 'voice' | 'multi-device' | 'unknown';
  deviceName?: string;
}

/**
 * Authentication credentials once authenticated
 */
export interface AuthCredentials {
  clientId: string;
  serverToken: string;
  clientToken: string;
  encKey: string;
  macKey: string;
  me: {
    id: string;
    name?: string;
    phoneNumber: string;
  };
  expiration?: number;
}

/**
 * Session data used for restoring sessions
 */
export interface SessionData {
  authCredentials: AuthCredentials;
  lastSeen?: number;
  browser?: {
    name: string;
    version: string;
  };
}

/**
 * Authentication error details
 */
export interface AuthError {
  code: string;
  message: string;
  method: AuthMethod;
  stack?: string;
}
