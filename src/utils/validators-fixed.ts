/**
 * Validators for WhatsApp data
 * Provides validation functions for message content, media, and IDs
 */
import { MessageType, MediaType } from '../types';
import { MIME_TYPES } from './constants';

/**
 * Generate a random message ID
 * @returns Random message ID string
 */
export function generateMessageID(): string {
  return 'true_' + Math.floor(Math.random() * 1000000000) + '_' + 
         Math.random().toString(16).substr(2) + 
         Date.now().toString(16).substr(-8);
}

// Valid WhatsApp ID regex patterns
const PATTERNS = {
  // Standard WhatsApp ID: [country code][phone number]@s.whatsapp.net
  PHONE_ID: /^[1-9]\d{0,14}@s\.whatsapp\.net$/,
  
  // Group ID: [id]@g.us
  GROUP_ID: /^[0-9]{18,19}@g\.us$/,
  
  // Broadcast list ID: [id]@broadcast
  BROADCAST_ID: /^[0-9]{18,19}@broadcast$/,
  
  // Status ID: status@broadcast
  STATUS_ID: /^status@broadcast$/,
  
  // Message ID: true_[sender_id]_[id]
  MESSAGE_ID: /^true_[0-9]{10,16}@[a-z0-9\.-]+_[A-F0-9]{16,32}$/,
  
  // Generic ID: any of the above
  WHATSAPP_ID: /^([1-9]\d{0,14}@s\.whatsapp\.net|[0-9]{18,19}@g\.us|[0-9]{18,19}@broadcast|status@broadcast)$/
};

/**
 * Validate if an ID is a valid WhatsApp ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidWhatsAppId(id: string): boolean {
  return PATTERNS.WHATSAPP_ID.test(id);
}

/**
 * Validate if an ID is a valid phone ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidPhoneId(id: string): boolean {
  return PATTERNS.PHONE_ID.test(id);
}

/**
 * Validate if an ID is a valid group ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidGroupId(id: string): boolean {
  return PATTERNS.GROUP_ID.test(id);
}

/**
 * Validate if an ID is a valid broadcast ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidBroadcastId(id: string): boolean {
  return PATTERNS.BROADCAST_ID.test(id);
}

/**
 * Validate if an ID is a valid status ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidStatusId(id: string): boolean {
  return PATTERNS.STATUS_ID.test(id);
}

/**
 * Validate if an ID is a valid message ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidMessageId(id: string): boolean {
  return PATTERNS.MESSAGE_ID.test(id);
}

/**
 * Sanitize message content to prevent injection attacks
 * @param content Message content to sanitize
 * @returns Sanitized content
 */
export function sanitizeMessageContent(content: string): string {
  // Basic sanitization to prevent command injection
  return content
    .replace(/[<>]/g, '') // Remove potential HTML/XML tags
    .replace(/\u200e/g, ''); // Remove left-to-right mark
}

/**
 * Check if media file size is within limits
 * @param size File size in bytes
 * @param type Media type
 * @returns True if within limits
 */
export function isValidMediaSize(size: number, type: MediaType): boolean {
  // Media size limits in bytes
  const limits: Record<MediaType, number> = {
    [MediaType.IMAGE]: 16 * 1024 * 1024, // 16MB
    [MediaType.VIDEO]: 100 * 1024 * 1024, // 100MB
    [MediaType.AUDIO]: 100 * 1024 * 1024, // 100MB
    [MediaType.DOCUMENT]: 100 * 1024 * 1024, // 100MB
    [MediaType.STICKER]: 1 * 1024 * 1024 // 1MB
  };
  
  // Get limit for the specified type or default to document limit
  const maxSize = type in limits ? limits[type] : limits[MediaType.DOCUMENT];
  
  return size <= maxSize;
}

/**
 * Check if media MIME type is supported
 * @param mimeType MIME type to check
 * @param type Media type
 * @returns True if supported
 */
export function isValidMimeType(mimeType: string, type: MediaType): boolean {
  // Valid MIME types for each media type
  const validMimeTypes: Record<MediaType, string[]> = {
    [MediaType.IMAGE]: [
      MIME_TYPES.IMAGE.JPEG,
      MIME_TYPES.IMAGE.PNG,
      MIME_TYPES.IMAGE.GIF,
      MIME_TYPES.IMAGE.WEBP
    ],
    [MediaType.VIDEO]: [
      MIME_TYPES.VIDEO.MP4,
      MIME_TYPES.VIDEO.GPP3,
      MIME_TYPES.VIDEO.MKV
    ],
    [MediaType.AUDIO]: [
      MIME_TYPES.AUDIO.MP3,
      MIME_TYPES.AUDIO.OGG,
      MIME_TYPES.AUDIO.M4A
    ],
    [MediaType.DOCUMENT]: [
      MIME_TYPES.DOCUMENT.PDF,
      MIME_TYPES.DOCUMENT.DOC,
      MIME_TYPES.DOCUMENT.DOCX,
      MIME_TYPES.DOCUMENT.XLS,
      MIME_TYPES.DOCUMENT.XLSX,
      MIME_TYPES.DOCUMENT.PPT,
      MIME_TYPES.DOCUMENT.PPTX,
      MIME_TYPES.DOCUMENT.TXT
    ],
    [MediaType.STICKER]: [
      MIME_TYPES.IMAGE.WEBP
    ]
  };
  
  // Check if the MIME type is in the list of valid types
  return type in validMimeTypes && validMimeTypes[type].includes(mimeType);
}

/**
 * Validate phone number format
 * @param phoneNumber Phone number to validate
 * @returns True if valid
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  // Phone numbers should only contain digits and be of reasonable length
  return /^[1-9]\d{5,14}$/.test(phoneNumber);
}

/**
 * Format phone number to a standard format
 * @param phoneNumber Phone number to format
 * @returns Formatted phone number or null if invalid
 */
export function formatPhoneNumber(phoneNumber: string): string | null {
  // Remove any non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Check if valid
  if (!isValidPhoneNumber(digitsOnly)) {
    return null;
  }
  
  // Return standard format
  return digitsOnly;
}

/**
 * Convert phone number to WhatsApp ID
 * @param phoneNumber Phone number to convert
 * @returns WhatsApp ID or null if invalid
 */
export function phoneToWhatsAppId(phoneNumber: string): string | null {
  const formatted = formatPhoneNumber(phoneNumber);
  
  if (!formatted) {
    return null;
  }
  
  return `${formatted}@s.whatsapp.net`;
}

/**
 * Extract phone number from WhatsApp ID
 * @param whatsappId WhatsApp ID to extract from
 * @returns Phone number or null if invalid
 */
export function extractPhoneFromId(whatsappId: string): string | null {
  if (!isValidPhoneId(whatsappId)) {
    return null;
  }
  
  // Extract phone number part
  const match = whatsappId.match(/^([1-9]\d{0,14})@/);
  return match ? match[1] : null;
}

/**
 * Verify a message is valid
 * @param message Message to verify
 * @returns True if valid
 */
export function isValidMessage(message: any): boolean {
  // Check required fields
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  // Check ID and chatId
  if (!message.id || typeof message.id !== 'string') {
    return false;
  }
  
  if (!message.chatId || typeof message.chatId !== 'string' || !isValidWhatsAppId(message.chatId)) {
    return false;
  }
  
  // Check message type
  if (!('type' in message) || !Object.values(MessageType).includes(message.type)) {
    return false;
  }
  
  // Check content based on message type
  if (message.type === MessageType.TEXT) {
    return typeof message.content?.text === 'string';
  }
  
  // Add validation for other message types as needed
  
  return true;
}