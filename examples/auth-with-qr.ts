/**
 * WhatsLynx Authentication with QR Code Example
 * 
 * This example demonstrates how to authenticate with WhatsApp using a QR code.
 * It includes session persistence, so you don't need to scan the QR code every time.
 */

import WhatsLynxClient from '../src/index';
import * as fs from 'fs';
import * as qrcode from 'qrcode-terminal';

// Create a new WhatsLynx client
const client = new WhatsLynxClient({
  logger: (level, message, data) => {
    if (level === 'error' || level === 'warn') {
      console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }
});

// File path for session data
const SESSION_FILE_PATH = './whatsapp-session.json';

// Attempt to load existing session
async function loadSessionData(): Promise<any | null> {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
    return sessionData;
  }
  return null;
}

// Save session data to file
async function saveSessionData(sessionData: any): Promise<void> {
  fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2));
}

// Handle QR code received
client.on('auth.qr', (qr) => {
  // Clear console
  console.clear();
  console.log('Please scan this QR code with your WhatsApp phone:');
  
  // Generate QR code in terminal
  // Generate the QR code directly - the callback is not needed
  qrcode.generate(qr.qrCode, {small: true});
  
  console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds. Attempt ${qr.attempts} of 5.`);
});

// Handle authentication success
client.on('auth.authenticated', () => {
  console.log('\nAuthenticated successfully!');
  
  // Save session data to reuse later
  saveSessionData(client.getSessionData())
    .then(() => console.log('Session data saved successfully.'))
    .catch(err => console.error('Failed to save session data:', err));
});

// Handle session data updates
client.on('auth.session-updated', (sessionData) => {
  saveSessionData(sessionData)
    .then(() => console.log('Session data updated and saved.'))
    .catch(err => console.error('Failed to save updated session data:', err));
});

// Handle connection
client.on('connected', () => {
  console.log('Connected to WhatsApp!');
  
  // Print user information
  const myInfo = client.getSessionData()?.authCredentials?.me;
  if (myInfo) {
    console.log(`Logged in as: ${myInfo.name || 'Unknown'} (${myInfo.phoneNumber})`);
  }
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.log('Disconnected from WhatsApp:', reason);
});

// Handle session restore attempt
client.on('auth.session-restore-attempt', () => {
  console.log('Attempting to restore session...');
});

// Handle session restore failure
client.on('auth.session-restore-failed', (error) => {
  console.log('Failed to restore session, will request new QR code:', error);
});

// Handle authentication failure
client.on('auth.failed', (error) => {
  console.error('Authentication failed:', error);
});

// Start the authentication process
async function startAuth() {
  try {
    console.log('Starting WhatsLynx with QR code authentication...');
    
    // Load existing session if available
    const sessionData = await loadSessionData();
    
    if (sessionData) {
      console.log('Found existing session, attempting to restore...');
      try {
        await client.connect(sessionData);
      } catch (error) {
        console.log('Failed to restore session. A new QR code will be generated.');
        await client.connect(); // Connect without session data to get fresh QR code
      }
    } else {
      console.log('No saved session found. Please scan the QR code.');
      await client.connect(); // This will trigger QR code generation
    }
  } catch (error) {
    console.error('Failed to start WhatsLynx:', error);
  }
}

// Run the authentication process
startAuth();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await client.disconnect('User requested shutdown');
  process.exit(0);
});
