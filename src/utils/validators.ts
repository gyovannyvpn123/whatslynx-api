/**
 * Validation utilities for WhatsApp messages and inputs
 */

/**
 * Check if a string is a valid WhatsApp ID
 * @param id ID to validate
 * @returns True if valid
 */
export function isValidWhatsAppId(id: string): boolean {
  // WhatsApp IDs should be in the format 1234567890@c.us (for users)
  // or 1234567890-1234567890@g.us (for groups)
  const userRegex = /^[0-9]{7,}@c\.us$/;
  const groupRegex = /^[0-9]{7,}-[0-9]+@g\.us$/;
  const broadcastRegex = /^[0-9]{7,}@broadcast$/;
  const statusRegex = /^status@broadcast$/;
  
  return userRegex.test(id) || 
         groupRegex.test(id) || 
         broadcastRegex.test(id) || 
         statusRegex.test(id);
}

/**
 * Validate a phone number format
 * @param phoneNumber Phone number to validate
 * @returns True if valid
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  // Remove any non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  
  // Phone numbers should be at least 7 digits and max 15 digits according to ITU-T E.164
  return cleanNumber.length >= 7 && cleanNumber.length <= 15;
}

/**
 * Format a phone number to WhatsApp ID format
 * @param phoneNumber Phone number to format
 * @returns WhatsApp ID
 */
export function formatToWhatsAppId(phoneNumber: string): string {
  // Remove any non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  
  if (!isValidPhoneNumber(cleanNumber)) {
    throw new Error('Invalid phone number format');
  }
  
  return `${cleanNumber}@c.us`;
}

/**
 * Check if WhatsApp ID is for a user
 * @param id WhatsApp ID to check
 * @returns True if user ID
 */
export function isUserJid(id: string): boolean {
  return /^[0-9]{7,}@c\.us$/.test(id);
}

/**
 * Check if WhatsApp ID is for a group
 * @param id WhatsApp ID to check
 * @returns True if group ID
 */
export function isGroupJid(id: string): boolean {
  return /^[0-9]{7,}-[0-9]+@g\.us$/.test(id);
}

/**
 * Check if WhatsApp ID is for a broadcast list
 * @param id WhatsApp ID to check
 * @returns True if broadcast ID
 */
export function isBroadcastJid(id: string): boolean {
  return /^[0-9]{7,}@broadcast$/.test(id);
}

/**
 * Check if WhatsApp ID is for status updates
 * @param id WhatsApp ID to check
 * @returns True if status ID
 */
export function isStatusJid(id: string): boolean {
  return id === 'status@broadcast';
}

/**
 * Extract phone number from WhatsApp ID
 * @param id WhatsApp ID
 * @returns Phone number
 */
export function extractPhoneNumber(id: string): string | null {
  if (!isUserJid(id)) {
    return null;
  }
  
  return id.split('@')[0];
}

/**
 * Validate a message content
 * @param content Message content to validate
 * @returns True if valid
 */
export function isValidMessageContent(content: string): boolean {
  // Content shouldn't be empty and shouldn't exceed WhatsApp's limits
  // WhatsApp text message limit is approximately 65536 characters
  return content.length > 0 && content.length <= 65536;
}

/**
 * Validate media file size
 * @param sizeInBytes File size in bytes
 * @param type Media type
 * @returns True if valid
 */
export function isValidFileSize(sizeInBytes: number, type: string): boolean {
  // WhatsApp media size limits (as of mid-2023)
  const limits: Record<string, number> = {
    image: 16 * 1024 * 1024, // 16 MB
    video: 16 * 1024 * 1024, // 16 MB
    audio: 16 * 1024 * 1024, // 16 MB
    document: 100 * 1024 * 1024, // 100 MB
    sticker: 500 * 1024 // 500 KB
  };
  
  const maxSize = limits[type] || limits.document;
  
  return sizeInBytes > 0 && sizeInBytes <= maxSize;
}

/**
 * Validate media mime type
 * @param mimeType MIME type
 * @param type Media type
 * @returns True if valid
 */
export function isValidMimeType(mimeType: string, type: string): boolean {
  const validMimeTypes: Record<string, string[]> = {
    image: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ],
    video: [
      'video/mp4',
      'video/3gpp',
      'video/quicktime',
      'video/x-matroska'
    ],
    audio: [
      'audio/aac',
      'audio/mp4',
      'audio/amr',
      'audio/mpeg',
      'audio/ogg',
      'audio/opus'
    ],
    document: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-7z-compressed',
      'application/x-rar-compressed'
    ],
    sticker: [
      'image/webp'
    ]
  };
  
  return type in validMimeTypes && validMimeTypes[type].includes(mimeType) || false;
}

/**
 * Sanitize message content (remove potentially harmful characters)
 * @param content Message content
 * @returns Sanitized content
 */
export function sanitizeMessageContent(content: string): string {
  // Remove zero-width characters and other potentially harmful characters
  return content
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width characters
    .trim();
}

/**
 * Validate group name
 * @param name Group name
 * @returns True if valid
 */
export function isValidGroupName(name: string): boolean {
  // Group names should be 1-25 characters
  return name.length > 0 && name.length <= 25;
}

/**
 * Validate group description
 * @param description Group description
 * @returns True if valid
 */
export function isValidGroupDescription(description: string): boolean {
  // Group descriptions should be 0-512 characters
  return description.length <= 512;
}

/**
 * Sanitize group name (remove potentially harmful characters)
 * @param name Group name
 * @returns Sanitized name
 */
export function sanitizeGroupName(name: string): string {
  // Remove zero-width characters and other potentially harmful characters
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width characters
    .trim();
}

/**
 * Validate URL format
 * @param url URL to validate
 * @returns True if valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
