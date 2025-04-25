/**
 * Basic Connector Example
 * 
 * This example shows the fundamental pattern for connecting to WhatsApp using
 * WhatsLynx. It handles authentication and basic event listening but doesn't
 * do any message sending.
 */

import EventEmitter from 'events';
import qrcode from 'qrcode-terminal';
import { ConnectionState, WhatsLynxEvents } from '../src/types';
import { getErrorMessage } from '../src/utils/error-handler';

// Import WhatsLynxClient
// We're using the default import from the root, which should be the fixed version
import WhatsLynxClient from '../src';

// Create client instance
const client = new WhatsLynxClient({
  deviceName: 'WhatsLynx Basic Connector',
  browserName: 'Chrome',
  autoReconnect: true,
  logger: (level, message, ...args) => {
    console.log(`[${level.toUpperCase()}] ${message}`, ...args);
  }
});

// Set up authentication event handlers
client.on(WhatsLynxEvents.QR_CODE_RECEIVED, (qr: any) => {
  console.log('Please scan this QR code with your WhatsApp:');
  qrcode.generate(qr.qrCode, { small: true });
  console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds. Attempt ${qr.attempts}/${client.getOptions().maxQRAttempts || 5}`);
});

client.on(WhatsLynxEvents.PAIRING_CODE_RECEIVED, (data: any) => {
  console.log(`Pairing code: ${data.pairingCode}`);
  console.log(`Enter this code in your WhatsApp app to authenticate.`);
  console.log(`Code expires at: ${new Date(data.pairingCodeExpiresAt).toLocaleString()}`);
});

// Set up connection event handlers
client.on(WhatsLynxEvents.CONNECTED, () => {
  console.log('Connected to WhatsApp servers!');
  console.log(`Connection state: ${client.getConnectionState()}`);
  console.log(`Authenticated: ${client.auth.isAuthenticated() ? 'Yes ✅' : 'No ❌'}`);
});

client.on(WhatsLynxEvents.DISCONNECTED, (reason: any) => {
  console.log('Disconnected from WhatsApp:', reason);
});

client.on(WhatsLynxEvents.CONNECTING, () => {
  console.log('Connecting to WhatsApp...');
});

client.on(WhatsLynxEvents.RECONNECTING, (info: any) => {
  console.log(`Reconnecting to WhatsApp. Attempt ${info.attempts}/${client.getOptions().maxReconnectAttempts}...`);
});

// Handle authentication events
client.on(WhatsLynxEvents.AUTHENTICATED, () => {
  console.log('Authenticated successfully!');
  
  // You could save the session data here if needed
  const sessionData = client.getSessionData();
  console.log('Session data available:', sessionData ? 'Yes' : 'No');
});

client.on(WhatsLynxEvents.AUTH_FAILED, (error: any) => {
  console.error('Authentication failed:', error.message);
});

// Handle errors
client.on(WhatsLynxEvents.ERROR, (error: any) => {
  console.error('Error occurred:', getErrorMessage(error));
});

// Start the connection process
async function start() {
  try {
    console.log('Starting WhatsLynx Basic Connector...');
    
    // Connect to WhatsApp server
    await client.connect();
    
    // Choose authentication method - we'll use QR code for simplicity
    console.log('Starting QR code authentication. Please scan the QR code with your WhatsApp app.');
    await client.auth.startAuthentication();
    
    console.log('Waiting for authentication...');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT. Shutting down...');
      try {
        await client.disconnect('user_shutdown');
        console.log('Disconnected successfully.');
      } catch (error: unknown) {
        console.error('Error during shutdown:', getErrorMessage(error));
      }
      process.exit(0);
    });
    
  } catch (error: unknown) {
    console.error('Failed to start connector:', getErrorMessage(error));
    process.exit(1);
  }
}

// Run the example
start();