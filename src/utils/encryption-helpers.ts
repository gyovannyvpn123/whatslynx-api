/**
 * Helper functions for encryption and decryption
 * with different parameter orders to support legacy code
 */

import { Buffer } from 'buffer';
import { encryptAndSign as originalEncrypt, verifyAndDecrypt as originalDecrypt, EncryptedData } from './encryption';

/**
 * Legacy version of encryptAndSign that outputs a Buffer
 * @param key1 First key (can be encrypt key)
 * @param key2 Second key (can be mac key)
 * @param data Data to encrypt
 */
export function encryptAndSignToBuffer(key1: Buffer, key2: Buffer, data: Buffer): Buffer {
  // Generate IV from key2
  const iv = key2.slice(0, 12); // Use first 12 bytes as IV
  
  const result = originalEncrypt(data, key1, iv);
  
  // Convert EncryptedData to a single Buffer
  return Buffer.concat([
    result.iv,
    result.ciphertext,
    result.auth
  ]);
}

/**
 * Legacy version of verifyAndDecrypt that takes a Buffer as input
 * @param key1 First key (can be encrypt key)
 * @param key2 Second key (can be mac key)
 * @param encryptedData Encrypted data as a single Buffer
 */
export function verifyAndDecryptFromBuffer(key1: Buffer, key2: Buffer, encryptedData: Buffer): Buffer {
  // Extract components
  const iv = encryptedData.slice(0, 12);
  const auth = encryptedData.slice(encryptedData.length - 16);
  const ciphertext = encryptedData.slice(12, encryptedData.length - 16);
  
  const encryptedDataObj: EncryptedData = {
    iv,
    auth,
    ciphertext
  };
  
  return originalDecrypt(encryptedDataObj, key1);
}