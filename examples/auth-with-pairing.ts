/**
 * WhatsLynx Authentication with Pairing Code Example
 * 
 * This example demonstrates how to authenticate with WhatsApp using a pairing code.
 * This method allows users to connect without scanning a QR code, which is useful
 * for devices without a camera or for automating the process.
 */

import WhatsLynxClient from '../src/index';
import * as fs from 'fs';
import * as readline from 'readline';

// Create readline interface for getting user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt user for input
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Create a new WhatsLynx client
const client = new WhatsLynxClient({
  logger: (level, message, data) => {
    // Only log errors and warnings to keep output clean
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

// Handle pairing code received
client.on('auth.pairing-code', (data) => {
  console.log(`\nPairing code: ${data.pairingCode}`);
  console.log(`This code expires in: ${Math.ceil((data.pairingCodeExpiresAt - Date.now()) / 1000)} seconds`);
  console.log('Please enter this code in your WhatsApp mobile app:');
  console.log('1. Open WhatsApp on your phone');
  console.log('2. Go to Settings > Linked Devices');
  console.log('3. Tap on "Link a Device"');
  console.log('4. When prompted, enter the pairing code shown above');
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
  
  // Close readline interface after successful connection
  rl.close();
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.log('Disconnected from WhatsApp:', reason);
});

// Start the authentication process
async function startAuth() {
  try {
    console.log('Starting WhatsLynx with pairing code authentication...');
    
    // Load existing session if available
    const sessionData = await loadSessionData();
    
    if (sessionData) {
      console.log('Found existing session, attempting to restore...');
      
      try {
        await client.connect(sessionData);
        console.log('Session restored successfully!');
        return;
      } catch (error) {
        console.log('Failed to restore session. Starting new authentication.', error);
      }
    }
    
    // Connect first (required before starting auth process)
    await client.connect();
    
    // Prompt for phone number
    const phoneNumber = await prompt('\nEnter your phone number with country code (e.g., 14155552671 for +1 415 555 2671): ');
    
    // Start pairing code authentication
    await client.auth.startPairingCodeAuth({
      phoneNumber: phoneNumber.trim().replace(/\D/g, '') // Remove non-digit characters
    });
    
    console.log('\nPairing code requested. Please wait...');
    
  } catch (error) {
    console.error('Authentication failed:', error);
    rl.close();
  }
}

// Run the authentication process
startAuth();
