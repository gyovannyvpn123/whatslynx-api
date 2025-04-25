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
  /** Logger function */
  logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) => void;
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