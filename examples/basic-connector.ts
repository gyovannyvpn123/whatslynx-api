/**
 * Basic Connector Example
 * 
 * This example shows the fundamental pattern for connecting to WhatsApp using
 * WhatsLynx. It handles authentication and basic event listening but doesn't
 * do any message sending.
 */

import { WhatsLynxClient } from '../src/client-fixed4';
import * as fs from 'fs';
import * as path from 'path';
import * as qrcode from 'qrcode-terminal';

// Define session file path
const SESSION_FILE_PATH = path.join(__dirname, 'session.json');

// Define function to save session data
async function saveSession(sessionData: any) {
  fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2));
  console.log('Session data saved to:', SESSION_FILE_PATH);
}

// Define function to load session data
async function loadSession() {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
    console.log('Session data loaded from:', SESSION_FILE_PATH);
    return sessionData;
  }
  console.log('No previous session found.');
  return null;
}

// Main function to start the connector
async function start() {
  // Create client instance with custom settings
  const client = new WhatsLynxClient({
    deviceName: 'WhatsLynx Basic Demo',
    autoReconnect: true,
    printQRInTerminal: true,
    // Custom logger for more detailed output
    logger: (level, message, data) => {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
      } else {
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
      }
    }
  });

  // Set up event listeners
  client.on('auth.qr', (qrData) => {
    console.log(`Please scan this QR code (attempt ${qrData.attempt}/${qrData.maxAttempts}):`);
    // Generate QR code for terminal display
    qrcode.generate(qrData.qrCode, { small: true });
  });

  client.on('auth.authenticated', async (data) => {
    console.log('Authenticated successfully! User:', data.pushname || 'Unknown');
    await saveSession(data);
  });

  client.on('connection.state', (update) => {
    console.log(`Connection state changed: ${update.old} -> ${update.new}`);
  });

  client.on('connection.error', (error) => {
    console.error('Connection error:', error);
  });

  client.on('auth.logout', () => {
    console.log('Logged out from WhatsApp');
    fs.existsSync(SESSION_FILE_PATH) && fs.unlinkSync(SESSION_FILE_PATH);
  });

  client.on('message.received', (msg) => {
    console.log('New message received:', msg.body || '(Media/non-text message)');
  });

  // Connect to WhatsApp
  try {
    console.log('Loading session...');
    const sessionData = await loadSession();
    
    console.log('Connecting to WhatsApp...');
    await client.connect(sessionData);
    
    if (!sessionData) {
      console.log('No session data found, starting authentication...');
      await client.auth.startAuthentication();
    }
    
    // Keep the process running
    console.log('Connected! Press Ctrl+C to exit.');
    
    // Set up simple CLI
    process.stdin.on('data', async (data) => {
      const command = data.toString().trim();
      
      if (command === 'exit' || command === 'quit') {
        console.log('Disconnecting...');
        await client.disconnect();
        process.exit(0);
      } else if (command === 'status') {
        console.log(`Connection status: ${client.getConnectionState()}`);
        console.log(`Authenticated: ${client.auth.isAuthenticated()}`);
      } else if (command === 'logout') {
        console.log('Logging out...');
        await client.logout();
      } else if (command) {
        console.log('Available commands: status, logout, exit/quit');
      }
    });
    
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Start the connector
start();