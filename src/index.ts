/**
 * WhatsLynx - A full-featured WhatsApp Web API library
 * 
 * This library provides a robust implementation for interacting with the WhatsApp Web protocol,
 * allowing developers to build bots and automation tools that can connect to WhatsApp servers.
 * 
 * Features:
 * - Support for both QR code and pairing code authentication
 * - Send and receive all types of messages (text, media, documents, etc.)
 * - Group chat functionality (create, join, leave, manage)
 * - Status updates
 * - Profile management
 * - Media handling (download, upload)
 * - Event-based architecture
 * - Automatic reconnection
 * 
 * @license MIT
 */

import { WhatsLynxClient } from './client-fixed3';
import * as Types from './types';

// Re-export important modules and types for easier access
export { WhatsLynxClient };
export { Types };

// Export commonly used utilities
export * from './utils/constants';
export * from './auth';
export * from './message';
export * from './media';
export * from './groups/index-fixed';
export * from './profile';
export * from './status';

// Create a default export for the client
export default WhatsLynxClient;
