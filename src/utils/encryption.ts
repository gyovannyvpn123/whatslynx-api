/**
 * Encryption utilities for WhatsApp protocol
 * Handles encryption and decryption of messages
 */
import * as crypto from 'crypto';
// Use require to avoid TypeScript errors
const futoinHkdf = require('futoin-hkdf');
const curve = require('curve25519-js');

// Export the hkdf function to be used by other modules
export function hkdf(ikm: Buffer, length: number, info: string, salt?: Buffer): Buffer {
  return futoinHkdf(ikm, length, { info, salt });
}

// Not actually importing atob as we'll use Buffer methods instead
// import * as atob from 'atob';

/**
 * Generate random bytes for encryption
 * @param length Number of bytes to generate
 * @returns Buffer with random bytes
 */
export function generateRandomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * HMAC-SHA256 implementation
 * @param key Key to use for HMAC
 * @param data Data to sign
 * @returns HMAC signature
 */
export function hmacSha256(key: Buffer, data: Buffer): Buffer {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest();
}

/**
 * SHA-256 hash implementation
 * @param data Data to hash
 * @returns SHA-256 hash
 */
export function sha256(data: Buffer): Buffer {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest();
}

/**
 * AES-256-CBC encryption
 * @param key Encryption key
 * @param data Data to encrypt
 * @param iv Initialization vector
 * @returns Encrypted data
 */
export function aesEncrypt(key: Buffer, data: Buffer, iv: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-256-CBC decryption
 * @param key Decryption key
 * @param data Data to decrypt
 * @param iv Initialization vector
 * @returns Decrypted data
 */
export function aesDecrypt(key: Buffer, data: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * HKDF key derivation function using futoin-hkdf
 * @param ikm Initial key material
 * @param length Length of output key material
 * @param info Context and application specific information
 * @param salt Salt value
 * @returns Derived key
 */
export function hkdfDerive(ikm: Buffer, length: number, info: string | Buffer, salt?: Buffer): Buffer {
  // Convert info to Buffer if it's a string
  const infoBuffer = typeof info === 'string' ? Buffer.from(info) : info;
  
  // If no salt is provided, use a buffer of zeros
  const saltBuffer = salt || Buffer.alloc(32, 0);
  
  // Use our imported function for proper HKDF implementation
  return hkdf(ikm, length, infoBuffer.toString(), saltBuffer);
}

/**
 * Derive WhatsApp specific keys from the master key
 * @param masterKey Master key
 * @returns Object containing all derived keys
 */
export function deriveWhatsAppKeys(masterKey: Buffer): { 
  encKey: Buffer, 
  macKey: Buffer,
  aesKey: Buffer,
  aesIv: Buffer
} {
  // Use WhatsApp-specific key derivation parameters
  const expandedKey = hkdfDerive(masterKey, 112, 'WhatsApp Derived Keys', Buffer.from([0]));
  
  return {
    encKey: expandedKey.slice(0, 32),
    macKey: expandedKey.slice(32, 64),
    aesKey: expandedKey.slice(64, 96),
    aesIv: expandedKey.slice(96, 112)
  };
}

/**
 * Generate a Curve25519 key pair for WhatsApp
 * @returns Object containing public and private keys
 */
export function generateKeyPair(): { privateKey: Buffer, publicKey: Buffer } {
  // Generate a random private key
  const privateKey = generateRandomBytes(32);
  
  // Generate the public key from the private key
  const publicKey = Buffer.from(curve.computePublicKey(privateKey));
  
  return { privateKey, publicKey };
}

/**
 * Perform Curve25519 shared secret computation
 * @param privateKey Your private key
 * @param publicKey Their public key
 * @returns Shared secret key
 */
export function computeSharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer {
  return Buffer.from(curve.computeSharedKey(privateKey, publicKey));
}

/**
 * Encrypt a message with AES-CBC and sign with HMAC-SHA256
 * @param encKey Encryption key
 * @param macKey MAC key
 * @param data Data to encrypt and sign
 * @returns Encrypted and signed data
 */
export function encryptAndSign(encKey: Buffer, macKey: Buffer, data: Buffer): Buffer {
  // Generate a random IV
  const iv = generateRandomBytes(16);
  
  // Encrypt the data
  const encrypted = aesEncrypt(encKey, data, iv);
  
  // Combine IV and encrypted data
  const combined = Buffer.concat([iv, encrypted]);
  
  // Sign the encrypted data
  const signature = hmacSha256(macKey, combined);
  
  // Return the final message: [signature][iv][encrypted_data]
  return Buffer.concat([signature, combined]);
}

/**
 * Verify and decrypt a message
 * @param encKey Decryption key
 * @param macKey MAC key
 * @param data Encrypted and signed data
 * @returns Decrypted data or null if verification fails
 */
export function verifyAndDecrypt(encKey: Buffer, macKey: Buffer, data: Buffer): Buffer | null {
  try {
    // Split the data into signature and encrypted parts
    const signature = data.slice(0, 32);
    const encryptedWithIv = data.slice(32);
    
    // Verify the signature
    const calculatedSignature = hmacSha256(macKey, encryptedWithIv);
    
    // Check if signatures match
    if (!signature.equals(calculatedSignature)) {
      return null;
    }
    
    // Extract IV and encrypted data
    const iv = encryptedWithIv.slice(0, 16);
    const encrypted = encryptedWithIv.slice(16);
    
    // Decrypt the data
    return aesDecrypt(encKey, encrypted, iv);
  } catch (error) {
    return null;
  }
}

/**
 * Validate the signature of a WhatsApp message
 * @param macKey MAC key
 * @param message Message to validate
 * @param signature Signature to check
 * @returns True if signature is valid
 */
export function validateSignature(macKey: Buffer, message: Buffer, signature: Buffer): boolean {
  const calculatedSignature = hmacSha256(macKey, message);
  return calculatedSignature.equals(signature);
}

/**
 * Base64 encode a buffer
 * @param buffer Buffer to encode
 * @returns Base64 encoded string
 */
export function base64Encode(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Base64 decode a string
 * @param str Base64 encoded string
 * @returns Decoded buffer
 */
export function base64Decode(str: string): Buffer {
  return Buffer.from(str, 'base64');
}

/**
 * Base64 URL-safe encode a buffer
 * @param buffer Buffer to encode
 * @returns Base64 URL-safe encoded string
 */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64 URL-safe decode a string
 * @param str Base64 URL-safe encoded string
 * @returns Decoded buffer
 */
export function base64UrlDecode(str: string): Buffer {
  // Add padding if needed
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64');
}

/**
 * Generate authentication credentials for WhatsApp
 * @returns Authentication credentials object
 */
export function generateAuthCredentials(): { 
  clientId: string, 
  serverToken: string, 
  clientToken: string, 
  encKey: Buffer, 
  macKey: Buffer
} {
  // Generate a unique client ID
  const clientId = base64Encode(generateRandomBytes(16));
  
  // Generate server token
  const serverToken = base64Encode(generateRandomBytes(16));
  
  // Generate client token
  const clientToken = base64Encode(generateRandomBytes(16));
  
  // Generate keys for end-to-end encryption
  const masterSecret = generateRandomBytes(32);
  const { encKey, macKey } = deriveWhatsAppKeys(masterSecret);
  
  return {
    clientId,
    serverToken,
    clientToken,
    encKey,
    macKey
  };
}

/**
 * Encrypt media file for WhatsApp (image, video, document, etc.)
 * @param data Media data
 * @param mediaType Type of media
 * @param mediaKey Optional media key (will generate random if not provided)
 * @returns Encrypted media object
 */
export function encryptMedia(
  data: Buffer, 
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  mediaKey?: Buffer
): { 
  encryptedData: Buffer, 
  mediaKey: Buffer, 
  iv: Buffer, 
  fileSha256: Buffer, 
  fileEncSha256: Buffer 
} {
  // Generate media key if not provided
  const key = mediaKey || generateRandomBytes(32);
  
  // Determine the appropriate HKDF info based on media type
  const mediaInfo = `WhatsApp ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} Keys`;
  
  // Derive keys for media
  const derivedKeys = hkdfDerive(key, 112, mediaInfo);
  const aesKey = derivedKeys.slice(0, 32);
  const iv = derivedKeys.slice(64, 80);
  
  // Calculate file hash
  const fileSha256 = sha256(data);
  
  // Encrypt the file
  const encryptedData = aesEncrypt(aesKey, data, iv);
  
  // Calculate hash of encrypted data
  const fileEncSha256 = sha256(encryptedData);
  
  return { 
    encryptedData, 
    mediaKey: key, 
    iv, 
    fileSha256, 
    fileEncSha256 
  };
}

/**
 * Decrypt media file from WhatsApp
 * @param encryptedData Encrypted media data
 * @param mediaKey Media key
 * @param mediaType Type of media
 * @returns Decrypted media data
 */
export function decryptMedia(
  encryptedData: Buffer, 
  mediaKey: Buffer, 
  mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker'
): Buffer {
  // Determine the appropriate HKDF info based on media type
  const mediaInfo = `WhatsApp ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} Keys`;
  
  // Derive keys for media
  const derivedKeys = hkdfDerive(mediaKey, 112, mediaInfo);
  const aesKey = derivedKeys.slice(0, 32);
  const iv = derivedKeys.slice(64, 80);
  
  // Decrypt the file
  return aesDecrypt(aesKey, encryptedData, iv);
}
