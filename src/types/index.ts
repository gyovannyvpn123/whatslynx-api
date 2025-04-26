/**
 * Common types for WhatsLynx
 */

export * from './auth';
export * from './message';
export * from './events';

// Enums for group management
export enum GroupInviteMode {
  ADMINS_ONLY = 'admins_only',
  ALL_PARTICIPANTS = 'all_participants'
}

export enum GroupMessageMode {
  ADMINS_ONLY = 'admins_only',
  ALL_PARTICIPANTS = 'all_participants'
}

// Logger interface
export interface Logger {
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
  debug(message: string, data?: any): void;
  trace?(message: string, data?: any): void;
  child?(options: { [key: string]: any }): Logger;
}

// Client options interface
export interface ClientOptions {
  /** Auto reconnect when disconnected */
  autoReconnect: boolean;
  /** Max number of reconnection attempts */
  maxReconnectAttempts: number;
  /** Reconnect interval in ms */
  reconnectInterval: number;
  /** Base delay for reconnection (exponential backoff) */
  reconnectBaseDelay: number;
  /** Maximum delay for reconnection */
  reconnectMaxDelay: number;
  /** Initial delay for reconnection */
  reconnectInitialDelay?: number;
  /** Backoff factor for reconnection delay */
  reconnectBackoffFactor?: number;
  /** Connection timeout in ms */
  connectionTimeout: number;
  /** Session auto-save interval in ms */
  saveInterval: number;
  /** Device display name */
  deviceName: string;
  /** Custom browser name */
  browserName: string;
  /** Custom browser version */
  browserVersion: string;
  /** Custom user agent */
  userAgent: string;
  /** Max QR code requests */
  maxQrRequests: number;
  /** Max QR attempts before giving up */
  maxQRAttempts: number;
  /** QR timeout in ms */
  qrTimeout: number;
  /** Keep alive interval in ms */
  keepAliveInterval: number;
  /** Whether to enable keep alive */
  keepAliveEnabled?: boolean;
  /** Whether to automatically sync contacts */
  syncContacts: boolean;
  /** Whether to automatically sync chats */
  syncChats?: boolean;
  /** Whether to handle presence updates */
  handlePresence?: boolean;
  /** Maximum message queue size */
  maxMessageQueueSize?: number;
  /** Custom HTTP headers */
  customHeaders?: Record<string, string>;
  /** Whether to print QR code in terminal */
  printQRInTerminal?: boolean;
  /** Logger interface */
  logger?: Logger;
  /** Log level */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** WhatsApp server URL */
  serverUrl?: string;
  /** Browser info tuple [browserName, browserVersion, osVersion] */
  browser?: [string, string, string];
  /** WhatsApp version tuple [major, minor, patch] */
  version?: [number, number, number];
  /** Whether to use pairing code authentication instead of QR */
  usePairingCode?: boolean;
  /** Phone number for pairing code auth (format: countryCode+number, e.g. 40712345678) */
  pairingPhoneNumber?: string;
}

// Connection states
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  RECONNECTING = 'reconnecting',
  LOGGED_OUT = 'logged_out'
}

// WhatsApp platform types
export enum WhatsAppPlatform {
  WEB = 'WEB',
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  DESKTOP = 'DESKTOP',
  UNKNOWN = 'UNKNOWN'
}

// Connection types
export enum ConnectionType {
  WIFI = 'WIFI',
  CELLULAR = 'CELLULAR',
  UNKNOWN = 'UNKNOWN'
}

// Client device info
export interface DeviceInfo {
  /** Platform name (WEB, ANDROID, etc.) */
  platform: WhatsAppPlatform;
  /** Application version */
  appVersion: string | { primary: number, secondary: number, tertiary: number };
  /** Mobile country code */
  mcc?: string;
  /** Mobile network code */
  mnc?: string;
  /** OS version */
  osVersion: string;
  /** Device manufacturer */
  manufacturer?: string;
  /** Device model name */
  device: string;
  /** OS build number */
  osBuildNumber?: string;
  /** Language code (ISO 639-1) */
  localeLanguageIso6391?: string;
  /** Country code (ISO 3166-1 alpha-2) */
  localeCountryIso31661Alpha2?: string;
}