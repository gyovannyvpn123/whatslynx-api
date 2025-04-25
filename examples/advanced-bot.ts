/**
 * Advanced WhatsApp Bot Example
 * 
 * This example shows how to create a WhatsApp bot using WhatsLynx
 * that supports both QR code and pairing code authentication methods.
 * It also includes features like session persistence, reconnection,
 * and handling different types of messages.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import WhatsLynxClient from '../src/index';
import { AuthState, MessageType } from '../src/types';

// Create readline interface for command input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const SESSION_FILE_PATH = './session.json';
const CONFIG = {
  authMethod: process.env.AUTH_METHOD || 'qr', // 'qr' or 'pairing'
  phoneNumber: process.env.PHONE_NUMBER || '',  // Required for pairing code auth
  saveSession: true,
  autoReply: true
};

// Create a new WhatsLynx client with custom options
const client = new WhatsLynxClient({
  logger: (level, message, data) => {
    const timestamp = new Date().toISOString();
    if (level === 'error') {
      console.error(`[${timestamp}] ERROR: ${message}`, data || '');
    } else if (level === 'warn') {
      console.warn(`[${timestamp}] WARN: ${message}`, data || '');
    } else if (level === 'info') {
      console.info(`[${timestamp}] INFO: ${message}`, data || '');
    } else if (level === 'debug') {
      // Only log debug in development
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${timestamp}] DEBUG: ${message}`, data || '');
      }
    }
  },
  autoReconnect: true,
  maxReconnectAttempts: 10,
  connectionTimeout: 60000,
  syncContacts: true,
  syncChats: true
});

// Define command handlers for the bot
const commandHandlers: Record<string, (message: any) => Promise<void>> = {
  // !help command
  'help': async (message) => {
    const helpText = `*WhatsLynx Bot Commands:*
!help - Show this help message
!ping - Check bot response time
!info - Get bot information
!echo [text] - Reply with the same text
!status - Show connection status
!commands - List all available commands`;
    
    await client.message.sendText(message.chatId, helpText);
  },
  
  // !ping command
  'ping': async (message) => {
    const startTime = Date.now();
    const sentMessage = await client.message.sendText(message.chatId, 'Calculating ping...');
    const pingTime = Date.now() - startTime;
    
    await client.message.sendText(message.chatId, `Pong! 🏓\nResponse time: ${pingTime}ms`);
  },
  
  // !info command
  'info': async (message) => {
    const info = `*WhatsLynx Bot*\n
• Library: WhatsLynx v1.0.0
• Connected: ${client.isConnected() ? '✅' : '❌'}
• Auth State: ${client.auth.getState()}
• Auth Method: ${client.auth.getMethod() || CONFIG.authMethod}
• Uptime: ${formatUptime(process.uptime())}
• Node.js: ${process.version}`;
    
    await client.message.sendText(message.chatId, info);
  },
  
  // !echo command
  'echo': async (message) => {
    const echoText = message.body.substring(6).trim(); // Remove !echo prefix
    if (echoText) {
      await client.message.sendText(message.chatId, echoText);
    } else {
      await client.message.sendText(message.chatId, 'Please provide some text to echo.\nExample: !echo Hello World');
    }
  },
  
  // !status command
  'status': async (message) => {
    const status = `*Connection Status*\n
• Connection: ${client.isConnected() ? 'Connected ✅' : 'Disconnected ❌'}
• Authentication: ${client.auth.getState() === AuthState.AUTHENTICATED ? 'Authenticated ✅' : 'Not Authenticated ❌'}
• Socket: ${client.socket.isConnected() ? 'Connected ✅' : 'Disconnected ❌'}`;
    
    await client.message.sendText(message.chatId, status);
  },
  
  // !commands command
  'commands': async (message) => {
    const commandsList = Object.keys(commandHandlers).map(cmd => `!${cmd}`).join(', ');
    await client.message.sendText(message.chatId, `*Available Commands:*\n${commandsList}`);
  }
};

// Auto-reply messages for common greetings
const autoReplies: Record<string, string[]> = {
  'greetings': [
    'Hello! 👋 How can I help you today?',
    'Hi there! I\'m a WhatsLynx bot. Type !help to see what I can do.',
    'Greetings! Need assistance? Type !help for available commands.'
  ],
  'thanks': [
    'You\'re welcome! 😊',
    'Glad I could help!',
    'No problem at all!'
  ],
  'bye': [
    'Goodbye! Come back anytime!',
    'Bye! Have a nice day!',
    'See you later!'
  ]
};

// Keywords that trigger auto-replies
const keywords = {
  greetings: ['hi', 'hello', 'hey', 'hola', 'greetings'],
  thanks: ['thanks', 'thank you', 'thx', 'tysm'],
  bye: ['bye', 'goodbye', 'see you', 'cya']
};

// Helper function to check if a message contains certain keywords
function containsKeyword(message: string, keywordList: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywordList.some(keyword => lowerMessage.includes(keyword));
}

// Helper function to get a random response from an array
function getRandomResponse(responses: string[]): string {
  const randomIndex = Math.floor(Math.random() * responses.length);
  return responses[randomIndex];
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  let uptimeStr = '';
  if (days > 0) uptimeStr += `${days}d `;
  if (hours > 0) uptimeStr += `${hours}h `;
  if (minutes > 0) uptimeStr += `${minutes}m `;
  uptimeStr += `${remainingSeconds}s`;
  
  return uptimeStr;
}

// Load session data from file
async function loadSessionData(): Promise<any | null> {
  try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, 'utf8'));
      console.log('Session data loaded from file');
      return sessionData;
    }
  } catch (error: any) {
    console.error('Failed to load session data:', error?.message || error);
  }
  return null;
}

// Save session data to file
async function saveSessionData(sessionData: any): Promise<void> {
  try {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData, null, 2));
    console.log('Session data saved to file');
  } catch (error: any) {
    console.error('Failed to save session data:', error?.message || error);
  }
}

// Event listeners for WhatsLynx client
function setupEventListeners() {
  // Authentication events
  client.on('auth.qr', (qr) => {
    console.log('\nScan this QR code with your WhatsApp app:');
    
    // If qrcode-terminal is available, display the QR code
    try {
      const qrcode = require('qrcode-terminal');
      qrcode.generate(qr.qrCode, { small: true });
    } catch (error) {
      console.log('QR Code:', qr.qrCode);
      console.log('(Install qrcode-terminal package to display the QR code in the terminal)');
    }
    
    console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds. Attempt ${qr.attempts}/5`);
  });
  
  client.on('auth.pairing-code', (data) => {
    console.log('\n===== PAIRING CODE =====');
    console.log(`Your pairing code: ${data.pairingCode}`);
    console.log('Enter this code in your WhatsApp mobile app:');
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Go to Settings > Linked Devices');
    console.log('3. Tap on "Link a Device"');
    console.log('4. When prompted, enter the pairing code shown above');
    console.log(`Code expires at: ${new Date(data.pairingCodeExpiresAt).toLocaleString()}`);
    console.log('========================\n');
  });
  
  client.on('auth.authenticated', () => {
    console.log('\n✅ Authenticated successfully!');
    
    // Save session if enabled
    if (CONFIG.saveSession) {
      const sessionData = client.auth.getSessionData();
      if (sessionData) {
        saveSessionData(sessionData);
      }
    }
  });
  
  client.on('auth.failed', (error) => {
    console.error('\n❌ Authentication failed:', error.message);
    console.log('Please try again or use a different authentication method.');
  });
  
  // Connection events
  client.on('connected', () => {
    console.log('\n✅ Connected to WhatsApp!');
  });
  
  client.on('disconnected', (reason) => {
    console.log(`\n❌ Disconnected from WhatsApp: ${reason}`);
  });
  
  client.on('reconnecting', (attempt) => {
    console.log(`\n⏳ Attempting to reconnect (${attempt}/10)...`);
  });
  
  // Message events
  client.on('message.received', async (message) => {
    // Skip messages sent by the bot itself
    if (message.fromMe) return;
    
    // Log the received message
    console.log(`\n📩 Message from ${message.chatId}: ${message.body || '[Media/Non-text message]'}`);
    
    // Process text messages
    if (message.type === MessageType.TEXT && message.body) {
      // Handle commands
      if (message.body.startsWith('!')) {
        const commandName = message.body.substring(1).split(' ')[0].toLowerCase();
        
        if (commandName in commandHandlers) {
          try {
            await commandHandlers[commandName](message);
          } catch (error: any) {
            console.error(`Error handling command ${commandName}:`, error?.message || error);
            await client.message.sendText(message.chatId, `Error processing command: ${error?.message || 'Unknown error'}`);
          }
        } else {
          // Unknown command
          await client.message.sendText(
            message.chatId, 
            `Unknown command: !${commandName}\nType !help to see available commands.`
          );
        }
        return;
      }
      
      // Handle auto-replies if enabled
      if (CONFIG.autoReply) {
        const messageText = message.body.toLowerCase();
        
        // Check for different types of messages and respond appropriately
        if (containsKeyword(messageText, keywords.greetings)) {
          await client.message.sendText(message.chatId, getRandomResponse(autoReplies.greetings));
        } else if (containsKeyword(messageText, keywords.thanks)) {
          await client.message.sendText(message.chatId, getRandomResponse(autoReplies.thanks));
        } else if (containsKeyword(messageText, keywords.bye)) {
          await client.message.sendText(message.chatId, getRandomResponse(autoReplies.bye));
        }
      }
    }
  });
  
  // Status events
  client.on('status.updated', (status) => {
    console.log(`\n📊 Status updated: ${status.type}`);
  });
}

// Command-line interface commands
function setupCliCommands() {
  console.log('\n=== WhatsLynx CLI Commands ===');
  console.log('status - Show connection status');
  console.log('exit - Exit the application');
  console.log('help - Show available commands');
  console.log('==============================\n');
  
  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();
    
    switch (command) {
      case 'status':
        console.log('\n=== Status ===');
        console.log(`Connected: ${client.isConnected() ? 'Yes ✅' : 'No ❌'}`);
        console.log(`Authenticated: ${client.auth.getState() === AuthState.AUTHENTICATED ? 'Yes ✅' : 'No ❌'}`);
        console.log(`Auth Method: ${client.auth.getMethod() || CONFIG.authMethod}`);
        console.log(`Uptime: ${formatUptime(process.uptime())}`);
        console.log('=============\n');
        break;
        
      case 'exit':
        console.log('\nDisconnecting...');
        await client.disconnect();
        console.log('Exiting application. Goodbye!');
        rl.close();
        process.exit(0);
        break;
        
      case 'help':
        console.log('\n=== WhatsLynx CLI Commands ===');
        console.log('status - Show connection status');
        console.log('exit - Exit the application');
        console.log('help - Show available commands');
        console.log('==============================\n');
        break;
        
      default:
        if (command) {
          console.log('Unknown command. Type "help" for available commands.');
        }
        break;
    }
  });
}

// Start the bot
async function startBot() {
  console.log('Starting WhatsLynx Bot...');
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up CLI commands
  setupCliCommands();
  
  try {
    // Connect to WhatsApp
    await client.connect();
    
    // Try to restore session if available
    const sessionData = await loadSessionData();
    if (sessionData) {
      console.log('Attempting to restore previous session...');
      try {
        await client.auth.restoreSession(sessionData);
        console.log('Session restored successfully!');
        return;
      } catch (error: any) {
        console.error('Failed to restore session:', error?.message || error);
        console.log('Proceeding with new authentication...');
      }
    }
    
    // Start authentication based on configured method
    if (CONFIG.authMethod === 'pairing') {
      // Verify phone number is provided
      if (!CONFIG.phoneNumber) {
        console.error('Error: Phone number is required for pairing code authentication.');
        console.error('Set PHONE_NUMBER environment variable (without the "+" prefix) and try again.');
        process.exit(1);
      }
      
      // Start pairing code authentication
      console.log(`Requesting pairing code for phone number: ${CONFIG.phoneNumber}`);
      await client.auth.startPairingCodeAuth({ phoneNumber: CONFIG.phoneNumber });
    } else {
      // Start QR code authentication
      console.log('Starting QR code authentication. Please scan the QR code with your WhatsApp app.');
      await client.auth.startAuthentication();
    }
    
    console.log('Waiting for authentication...');
  } catch (error: any) {
    console.error('Failed to start bot:', error?.message || error);
    process.exit(1);
  }
}

// Handle application exit
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT signal. Cleaning up...');
  
  // Disconnect from WhatsApp
  await client.disconnect();
  
  // Close readline interface
  rl.close();
  
  console.log('Cleanup completed. Exiting.');
  process.exit(0);
});

// Run the bot
startBot();