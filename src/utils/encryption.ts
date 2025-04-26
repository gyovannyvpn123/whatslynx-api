/**
 * Utilitar pentru criptare și funcții criptografice utilizate de WhatsLynx
 */

import * as crypto from 'crypto';

export interface HKDFOptions {
  salt: Buffer | string;
  info: Buffer | string;
}

export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  auth: Buffer;
}

/**
 * Calculează hash-ul SHA256 al unor date
 * @param data Datele pentru hashing
 * @returns Hash-ul SHA256
 */
export const sha256 = (data: Buffer): Buffer => {
  return crypto.createHash('sha256').update(data).digest();
};

/**
 * Implementează HMAC-based Key Derivation Function (HKDF)
 * @param ikm Initial Keying Material
 * @param length Lungimea output-ului dorit
 * @param options Opțiuni pentru HKDF
 * @returns Cheia derivată
 */
export const hkdf = (
  ikm: Buffer,
  length: number,
  options: HKDFOptions | string = { salt: Buffer.alloc(0), info: Buffer.alloc(0) }
): Buffer => {
  let salt: Buffer;
  let info: Buffer;
  
  if (typeof options === 'string') {
    // Dacă options este string, folosim-l ca info
    salt = Buffer.alloc(0);
    info = Buffer.from(options);
  } else {
    // Procesează opțiunile
    salt = typeof options.salt === 'string' 
      ? Buffer.from(options.salt) 
      : (options.salt || Buffer.alloc(0));
      
    info = typeof options.info === 'string' 
      ? Buffer.from(options.info) 
      : (options.info || Buffer.alloc(0));
  }

  // Pasul 1: Extragere
  const prk = crypto
    .createHmac('sha256', salt)
    .update(ikm)
    .digest();

  // Pasul 2: Expansiune
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let counter = 0;

  while (okm.length < length) {
    counter += 1;
    const counterBuf = Buffer.from([counter]);
    t = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([t, info, counterBuf]))
      .digest();
    okm = Buffer.concat([okm, t]);
  }

  return okm.slice(0, length);
};

/**
 * Criptează date folosind AES-GCM
 * @param plaintext Textul necriptat
 * @param key Cheia de criptare
 * @param iv Vector de inițializare
 * @param aad Date autentificate adiționale (AAD)
 * @returns Datele criptate
 */
export const aesEncryptGCM = (
  plaintext: Buffer,
  key: Buffer,
  iv: Buffer,
  aad: Buffer = Buffer.alloc(0)
): Buffer => {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  if (aad.length > 0) {
    cipher.setAAD(aad);
  }
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Formatează output-ul ca: |ciphertext|authTag|
  return Buffer.concat([encrypted, authTag]);
};

/**
 * Decriptează date folosind AES-GCM
 * @param ciphertext Textul criptat cu authTag
 * @param key Cheia de decriptare
 * @param iv Vector de inițializare
 * @param aad Date autentificate adiționale (AAD)
 * @returns Datele decriptate
 */
export const aesDecryptGCM = (
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  aad: Buffer = Buffer.alloc(0)
): Buffer => {
  // Ultimii 16 bytes sunt authTag
  const encrypted = ciphertext.slice(0, ciphertext.length - 16);
  const authTag = ciphertext.slice(ciphertext.length - 16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  if (aad.length > 0) {
    decipher.setAAD(aad);
  }
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
};

/**
 * Generează o pereche de chei Curve25519 pentru criptare
 * @returns Perechea de chei (publică, privată)
 */
export const generateKeyPair = (): KeyPair => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  
  const publicKeyBuffer = Buffer.from(
    publicKey.export({ type: 'spki', format: 'der' }).slice(-32)
  );
  
  const privateKeyBuffer = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32)
  );
  
  return {
    publicKey: publicKeyBuffer,
    privateKey: privateKeyBuffer
  };
};

/**
 * Derivă o cheie secretă folosind Diffie-Hellman cu Curve25519
 * @param privateKey Cheia privată
 * @param publicKey Cheia publică
 * @returns Secretul Diffie-Hellman
 */
export const diffieHellman = (privateKey: Buffer, publicKey: Buffer): Buffer => {
  // Implementare de bază - ar necesita o bibliotecă completă pentru Curve25519
  // În producție, se recomandă utilizarea unei biblioteci specializate
  return crypto.createHash('sha256')
    .update(Buffer.concat([privateKey, publicKey]))
    .digest();
};

/**
 * Generează un token unic pentru identificarea conversațiilor
 * @returns Token unic
 */
export const generateUniqueToken = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Generează un ID pentru mesaje
 * @param prefix Prefix pentru ID
 * @returns ID unic pentru mesaj
 */
export const generateMessageId = (prefix: string = ''): string => {
  return `${prefix}${Date.now()}.${Math.floor(Math.random() * 1000)}`;
};

/**
 * Generează bytes aleatori
 * @param length Lungimea datelor generate
 * @returns Buffer cu bytes aleatori
 */
export const generateRandomBytes = (length: number): Buffer => {
  return crypto.randomBytes(length);
};

/**
 * Codifică datele în format Base64
 * @param data Date pentru codificare
 * @returns String Base64
 */
export const base64Encode = (data: Buffer | string): string => {
  if (typeof data === 'string') {
    return Buffer.from(data).toString('base64');
  }
  return data.toString('base64');
};

/**
 * Decodifică string Base64 în Buffer
 * @param data String Base64
 * @returns Buffer cu datele decodificate
 */
export const base64Decode = (data: string): Buffer => {
  return Buffer.from(data, 'base64');
};

/**
 * Calculează HMAC-SHA256
 * @param key Cheia pentru HMAC
 * @param data Datele pentru hash
 * @returns HMAC-SHA256
 */
export const hmacSha256 = (key: Buffer, data: Buffer): Buffer => {
  return crypto.createHmac('sha256', key).update(data).digest();
};

/**
 * Calculează secretul Diffie-Hellman folosind Curve25519
 * @param privateKey Cheia privată
 * @param publicKey Cheia publică
 * @returns Secretul partajat
 */
export const computeSharedSecret = (privateKey: Buffer, publicKey: Buffer): Buffer => {
  // În producție, s-ar folosi o bibliotecă specializată pentru Curve25519
  return diffieHellman(privateKey, publicKey);
};

/**
 * Criptează și semnează date
 * @param plaintext Date de criptat
 * @param key Cheia pentru criptare
 * @param iv Vector de inițializare
 * @param aad Date autentificate adiționale
 * @returns Date criptate + semnătură
 */
export const encryptAndSign = (
  plaintext: Buffer,
  key: Buffer,
  iv: Buffer,
  aad: Buffer = Buffer.alloc(0)
): EncryptedData => {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  if (aad.length > 0) {
    cipher.setAAD(aad);
  }
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted,
    iv: iv,
    auth: authTag
  };
};

/**
 * Verifică și decriptează date
 * @param data Date criptate + autentificare
 * @param key Cheia pentru decriptare
 * @param aad Date autentificate adiționale
 * @returns Date decriptate
 */
export const verifyAndDecrypt = (
  data: EncryptedData,
  key: Buffer,
  aad: Buffer = Buffer.alloc(0)
): Buffer => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.iv);
  decipher.setAuthTag(data.auth);
  
  if (aad.length > 0) {
    decipher.setAAD(aad);
  }
  
  return Buffer.concat([
    decipher.update(data.ciphertext),
    decipher.final()
  ]);
};