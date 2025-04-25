/**
 * WhatsLynx Connection Demo
 * 
 * This example demonstrates how to connect to WhatsApp Web,
 * authenticate with either QR code or pairing code,
 * and maintain the connection.
 */

import WhatsLynxClient from '../src/index';
import * as readline from 'readline';
import * as fs from 'fs';

// Configuration
const SESSION_FILE_PATH = './session.json';
const USE_PAIRING_CODE = process.env.USE_PAIRING_CODE === 'true';
const PHONE_NUMBER = process.env.PHONE_NUMBER || '';

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create a WhatsLynx client with custom options
const client = new WhatsLynxClient({
  logger: (level, message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
  },
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectBaseDelay: 3000,
  maxQRAttempts: 3,
  deviceName: 'WhatsLynx Demo',
  syncContacts: true,
  syncChats: true
});

// Set up event listeners
function setupEventListeners() {
  // QR code events
  client.on('auth.qr', (qr) => {
    console.log('\n📱 Scan this QR code with your WhatsApp app:');
    
    try {
      // Use qrcode-terminal to display the QR code in terminal
      const qrcode = require('qrcode-terminal');
      qrcode.generate(qr.qrCode, { small: true });
    } catch (error) {
      console.log('QR Code:', qr.qrCode);
    }
    
    console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds`);
    console.log(`Attempt ${qr.attempts} of ${client.getOptions().maxQRAttempts || 3}`);
  });
  
  // Pairing code events
  client.on('auth.pairing-code', (data) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 Your WhatsApp pairing code: ${data.pairingCode}`);
    console.log('Enter this code in your WhatsApp mobile app:');
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Go to Settings > Linked Devices');
    console.log('3. Tap on "Link a Device"');
    console.log('4. When prompted, enter the pairing code shown above');
    console.log(`Code expires: ${new Date(data.pairingCodeExpiresAt).toLocaleString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
  
  // Authentication events
  client.on('auth.authenticated', () => {
    console.log('\n✅ Successfully authenticated with WhatsApp!');
    const sessionData = client.getSessionData();
    
    // Save session data for future reconnections
    if (sessionData) {
      fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2));
      console.log('💾 Session data saved to:', SESSION_FILE_PATH);
    }
  });
  
  client.on('auth.failed', (error) => {
    console.error('\n❌ Authentication failed:', error.message);
  });
  
  // Connection events
  client.on('connected', () => {
    console.log('\n🔌 Connected to WhatsApp servers!');
  });
  
  client.on('disconnected', (reason) => {
    console.log(`\n🔌 Disconnected from WhatsApp: ${reason}`);
  });
  
  client.on('reconnecting', (data) => {
    console.log(`\n🔄 Attempting to reconnect (${data.attempt}/${data.maxAttempts})...`);
  });
  
  client.on('connection.error', (error) => {
    console.error('\n❌ Connection error:', error.message);
  });
  
  // Message events
  client.on('message.received', (message) => {
    // Don't log messages from ourselves
    if (message.fromMe) return;
    
    const sender = message.senderName || message.chatId;
    const content = message.body || '[Media/Non-text message]';
    
    console.log(`\n📩 New message from ${sender}: ${content}`);
    
    // Auto-reply to show the bot is working
    if (message.type === 'text' && content && !message.fromMe) {
      client.message.sendText(message.chatId, 'I received your message! This is an auto-reply from WhatsLynx demo.')
        .catch(error => console.error('Failed to send auto-reply:', error));
    }
  });
}

// Load session data if available
function loadSessionData() {
  try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
      console.log('📂 Found existing session data');
      return sessionData;
    }
  } catch (error) {
    console.error('Error loading session data:', error);
  }
  return null;
}

// Set up CLI commands
function setupCLI() {
  console.log('\n=============== WhatsLynx Demo ===============');
  console.log('Available commands:');
  console.log('  status    - Show connection status');
  console.log('  exit      - Disconnect and exit');
  console.log('  help      - Show this help message');
  console.log('=============================================\n');
  
  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();
    
    switch (command) {
      case 'status':
        console.log('\n------ Status ------');
        console.log(`Connected: ${client.isConnected() ? 'Yes ✅' : 'No ❌'}`);
        console.log(`Authenticated: ${client.auth.isAuthenticated() ? 'Yes ✅' : 'No ❌'}`);
        console.log(`Connection state: ${client.getConnectionState()}`);
        console.log(`Auth state: ${client.auth.getState()}`);
        console.log('-------------------\n');
        break;
        
      case 'exit':
        console.log('\nDisconnecting from WhatsApp...');
        await client.disconnect();
        console.log('Exiting application');
        rl.close();
        process.exit(0);
        break;
        
      case 'help':
        console.log('\nAvailable commands:');
        console.log('  status    - Show connection status');
        console.log('  exit      - Disconnect and exit');
        console.log('  help      - Show this help message\n');
        break;
        
      default:
        if (command) {
          console.log('Unknown command. Type "help" for available commands.');
        }
        break;
    }
  });
}

// Start the demo
async function start() {
  try {
    // Set up event listeners and CLI
    setupEventListeners();
    setupCLI();
    
    console.log('Starting WhatsLynx connection demo...');
    
    // Try to restore previous session
    const sessionData = loadSessionData();
    
    // Connect to WhatsApp
    await client.connect(sessionData);
    
    // If we have session data, try to authenticate with it
    if (sessionData) {
      console.log('Attempting to authenticate with saved session...');
      try {
        await client.auth.restoreSession(sessionData);
        return; // Success!
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Failed to restore session:', errorMessage);
        console.log('Proceeding with new authentication...');
      }
    }
    
    // Choose authentication method
    if (USE_PAIRING_CODE) {
      if (!PHONE_NUMBER) {
        console.error('Error: Phone number is required for pairing code authentication.');
        console.error('Set the PHONE_NUMBER environment variable (without + prefix) and try again.');
        process.exit(1);
      }
      
      console.log(`Requesting pairing code for phone number: ${PHONE_NUMBER}`);
      await client.auth.startPairingCodeAuth({ phoneNumber: PHONE_NUMBER });
    } else {
      console.log('Starting QR code authentication. Please scan the QR code with your WhatsApp app.');
      await client.auth.startAuthentication();
    }
    
  } catch (error) {
    console.error('Failed to start demo:', error);
    process.exit(1);
  }
}

// Handle application exit
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Shutting down...');
  await client.disconnect();
  rl.close();
  process.exit(0);
});

// Start the demo
start();