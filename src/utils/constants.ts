import { ClientOptions, WhatsAppPlatform } from '../types';

/**
 * Default WhatsApp Web URL
 */
export const DEFAULT_WEB_URL = 'https://web.whatsapp.com/';

/**
 * Default WebSocket URL
 */
export const DEFAULT_WEBSOCKET_URL = 'wss://web.whatsapp.com/ws';

/**
 * Default User Agent
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

/**
 * Default browser information
 */
export const DEFAULT_BROWSER: [string, string, string] = ['Chrome', '108.0.0.0', '10'];

/**
 * Default WhatsApp version
 */
export const DEFAULT_WA_VERSION: [number, number, number] = [2, 2330, 7];

/**
 * Default client options
 */
export const DEFAULT_CLIENT_OPTIONS: ClientOptions = {
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectInterval: 5000,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 60000,
  reconnectInitialDelay: 1000,
  reconnectBackoffFactor: 1.5,
  connectionTimeout: 60000,
  saveInterval: 300000, // 5 minutes
  deviceName: 'WhatsLynx Client',
  browserName: 'Chrome',
  browserVersion: '108.0.0.0',
  userAgent: DEFAULT_USER_AGENT,
  maxQrRequests: 5,
  maxQRAttempts: 3,
  qrTimeout: 60000,
  keepAliveInterval: 20000,
  keepAliveEnabled: true,
  maxMessageQueueSize: 100,
  customHeaders: {},
  syncContacts: true,
  syncChats: true,
  handlePresence: true,
  
  // Added new options
  logLevel: 'info',
  serverUrl: DEFAULT_WEBSOCKET_URL,
  browser: DEFAULT_BROWSER,
  version: DEFAULT_WA_VERSION,
  usePairingCode: false,
  
  // Default logger implementation
  logger: {
    info: (message, data) => console.info(`[WhatsLynx] ${message}`, data || ''),
    warn: (message, data) => console.warn(`[WhatsLynx] ${message}`, data || ''),
    error: (message, data) => console.error(`[WhatsLynx] ${message}`, data || ''),
    debug: (message, data) => console.debug(`[WhatsLynx] ${message}`, data || '')
  }
};

/**
 * WhatsApp message content types
 */
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  CONTACT_CARD: 'contact_card',
  CONTACT_CARD_MULTI: 'contact_card_multi',
  LOCATION: 'location',
  LIVE_LOCATION: 'live_location',
  TEMPLATE: 'template',
  GROUP_INVITE: 'group_invite',
  LIST: 'list',
  BUTTONS: 'buttons',
  PRODUCT: 'product',
  ORDER: 'order',
  UNKNOWN: 'unknown'
};

/**
 * WhatsApp message status types
 */
export const MESSAGE_STATUS = {
  ERROR: 'ERROR',
  PENDING: 'PENDING',
  SERVER_ACK: 'SERVER_ACK',
  DELIVERY_ACK: 'DELIVERY_ACK',
  READ: 'READ',
  PLAYED: 'PLAYED'
};

/**
 * Chat types
 */
export const CHAT_TYPES = {
  SOLO: 'solo',
  GROUP: 'group',
  BROADCAST_LIST: 'broadcast_list',
  COMMUNITY: 'community',
  COMMUNITY_GROUP: 'community_group',
  UNKNOWN: 'unknown'
};

/**
 * Group participant roles
 */
export const GROUP_PARTICIPANT_ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MEMBER: 'member'
};

/**
 * Presence types
 */
export const PRESENCE_TYPES = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  COMPOSING: 'composing',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

/**
 * Media types
 */
export const MEDIA_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  VOICE: 'voice'
};

/**
 * Common MIME types for WhatsApp
 */
export const MIME_TYPES = {
  IMAGE: {
    JPEG: 'image/jpeg',
    PNG: 'image/png',
    GIF: 'image/gif',
    WEBP: 'image/webp'
  },
  VIDEO: {
    MP4: 'video/mp4',
    GPP3: 'video/3gpp',
    MKV: 'video/x-matroska'
  },
  AUDIO: {
    MP3: 'audio/mpeg',
    OGG: 'audio/ogg',
    M4A: 'audio/mp4'
  },
  DOCUMENT: {
    PDF: 'application/pdf',
    DOC: 'application/msword',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    XLS: 'application/vnd.ms-excel',
    XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    PPT: 'application/vnd.ms-powerpoint',
    PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    TXT: 'text/plain'
  }
};

/**
 * WhatsApp protocol constants
 */
export const PROTOCOL = {
  VERSION: [0, 4, 2305], // Current protocol version
  WEB_SUBPROTOCOL: 'chat',
  KEEP_ALIVE_INTERVAL_MS: 20000, // 20 seconds
  RECONNECT_INTERVAL_MS: 3000, // 3 seconds
  MAX_QR_ATTEMPTS: 5,
  QR_CODE_TTL_MS: 60000, // 1 minute
  PAIRING_CODE_TTL_MS: 300000, // 5 minutes
};

/**
 * Error codes
 */
export const ERROR_CODES = {
  CONNECTION_CLOSED: 'connection_closed',
  CONNECTION_LOST: 'connection_lost',
  CONNECTION_REFUSED: 'connection_refused',
  AUTHENTICATION_FAILURE: 'authentication_failure',
  EXPIRED_QR: 'expired_qr',
  EXPIRED_PAIRING_CODE: 'expired_pairing_code',
  INVALID_PHONE_NUMBER: 'invalid_phone_number',
  INVALID_MESSAGE: 'invalid_message',
  MESSAGE_TOO_LARGE: 'message_too_large',
  RATE_LIMITED: 'rate_limited',
  UNABLE_TO_DECRYPT: 'unable_to_decrypt',
  UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Reconnection backoff settings
 */
export const RECONNECT_SETTINGS = {
  BASE_DELAY_MS: 1000, // 1 second
  MAX_DELAY_MS: 60000, // 1 minute
  FACTOR: 1.5, // Exponential factor
  MAX_ATTEMPTS: 10
};
