/**
 * Encryption utilities for WhatsApp protocol
 * Handles encryption and decryption of messages
 */
import * as crypto from 'crypto';
// Use require to avoid TypeScript errors
const hkdf = require('futoin-hkdf');
const curve = require('curve25519-js');

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
 * @param data Data to sign
 * @param key Key to use for HMAC
 * @returns HMAC signature
 */
export function hmacSha256(data: Buffer, key: Buffer): Buffer {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest();
}

/**
 * Generate a new Curve25519 key pair
 * @returns Object with public and private keys
 */
export function generateKeyPair(): { public: Buffer, private: Buffer } {
  const privateKey = generateRandomBytes(32);
  const publicKey = Buffer.from(curve.generateKeyPair(privateKey).public);
  
  return {
    private: privateKey,
    public: publicKey
  };
}

/**
 * Compute a shared secret using Curve25519
 * @param privateKey Your private key
 * @param publicKey Other party's public key
 * @returns Shared secret
 */
export function computeSharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer {
  const shared = curve.sharedKey(privateKey, publicKey);
  return Buffer.from(shared);
}

/**
 * Derive encryption and authentication keys using HKDF
 * @param sharedSecret Shared secret from Curve25519 key exchange
 * @param length Length of output key material
 * @param info Application-specific info
 * @param salt Optional salt
 * @returns Derived key material
 */
export function hkdfDerive(
  sharedSecret: Buffer, 
  length: number, 
  info: string, 
  salt: Buffer | null = null
): Buffer {
  const saltToUse = salt || Buffer.alloc(32, 0);
  
  // Use HKDF to derive the key material
  const keyMaterial = hkdf(sharedSecret, length, {
    salt: saltToUse,
    info: info,
    hash: 'sha256'
  });
  
  return Buffer.from(keyMaterial);
}

/**
 * AES-256-CBC encryption
 * @param data Data to encrypt
 * @param key Encryption key
 * @param iv Initialization vector
 * @returns Encrypted data
 */
export function aesEncrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return encrypted;
}

/**
 * AES-256-CBC decryption
 * @param data Data to decrypt
 * @param key Decryption key
 * @param iv Initialization vector
 * @returns Decrypted data
 */
export function aesDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted;
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
 * @param base64 Base64 encoded string
 * @returns Decoded buffer
 */
export function base64Decode(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Encrypt and sign a message
 * @param data Data to encrypt
 * @param encKey Encryption key
 * @param macKey MAC key
 * @returns Encrypted and signed message
 */
export function encryptAndSign(data: Buffer, encKey: Buffer, macKey: Buffer): Buffer {
  // Generate random IV
  const iv = generateRandomBytes(16);
  
  // Encrypt the data
  const encrypted = aesEncrypt(data, encKey, iv);
  
  // Combine IV and encrypted data
  const combined = Buffer.concat([iv, encrypted]);
  
  // Generate HMAC signature
  const signature = hmacSha256(combined, macKey);
  
  // Return IV + encrypted + signature
  return Buffer.concat([combined, signature]);
}

/**
 * Verify and decrypt a message
 * @param data Encrypted and signed message
 * @param encKey Encryption key
 * @param macKey MAC key
 * @returns Decrypted data or null if verification fails
 */
export function verifyAndDecrypt(data: Buffer, encKey: Buffer, macKey: Buffer): Buffer {
  // Extract parts
  const iv = data.slice(0, 16);
  const encrypted = data.slice(16, data.length - 32);
  const signature = data.slice(data.length - 32);
  
  // Verify HMAC
  const combined = data.slice(0, data.length - 32);
  const calculatedSignature = hmacSha256(combined, macKey);
  
  if (!calculatedSignature.equals(signature)) {
    throw new Error('HMAC verification failed');
  }
  
  // Decrypt the data
  return aesDecrypt(encrypted, encKey, iv);
}

/**
 * SHA-256 hash
 * @param data Data to hash
 * @returns SHA-256 hash
 */
export function sha256(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Generate a session ID
 * @returns Random session ID
 */
export function generateSessionId(): string {
  return base64Encode(generateRandomBytes(16));
}

/**
 * Derive session keys from master key
 * @param masterKey Master key
 * @returns Object with session keys
 */
export function deriveSessionKeys(
  masterKey: Buffer
): { encKey: Buffer, macKey: Buffer, iv: Buffer } {
  // Use HKDF to derive session keys
  const keyMaterial = hkdfDerive(masterKey, 64, 'WhatsApp Session Keys');
  
  return {
    encKey: keyMaterial.slice(0, 32),
    macKey: keyMaterial.slice(32, 64),
    iv: generateRandomBytes(16)
  };
}

/**
 * Generate a secure authentication token
 * @returns Random token
 */
export function generateAuthToken(): string {
  return base64Encode(generateRandomBytes(32));
}

/**
 * Generate secure message ID
 * @returns Message ID for use in the protocol
 */
export function generateSecureMessageId(): string {
  // Format: XXXXXXXXXX.XXXXX (current time in seconds).(random 5 digits)
  const currentTime = Math.floor(Date.now() / 1000);
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${currentTime}.${random}`;
}