/**
 * Simple WhatsApp Bot Example
 * 
 * This example shows how to create a basic bot that responds to messages
 * automatically. The bot will greet users, respond to specific commands,
 * and provide help information.
 */

import WhatsLynxClient from '../src/index';

// Create a new WhatsLynx client
const client = new WhatsLynxClient({
  // Optional client configuration
  logger: (level, message, data) => {
    // Custom logging logic
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
  },
  autoReconnect: true
});

// Define command handlers
const commandHandlers: Record<string, (message: any) => Promise<void>> = {
  // Handle !help command
  'help': async (message) => {
    const helpText = `*Available Commands:*
!help - Show this help message
!ping - Check if the bot is responding
!info - Get info about this bot
!echo [text] - Reply with the same text
!time - Get current time`;
    
    await client.message.sendText(message.chatId, helpText);
  },
  
  // Handle !ping command
  'ping': async (message) => {
    await client.message.sendText(message.chatId, 'Pong! 🏓');
  },
  
  // Handle !info command
  'info': async (message) => {
    await client.message.sendText(message.chatId, 'This is a WhatsLynx bot example. Built with WhatsLynx library, a full-featured WhatsApp Web API implementation.');
  },
  
  // Handle !echo command
  'echo': async (message) => {
    const echoText = message.body.substring(6).trim(); // Remove !echo and trim
    if (echoText) {
      await client.message.sendText(message.chatId, echoText);
    } else {
      await client.message.sendText(message.chatId, 'Please provide some text to echo. Example: !echo Hello World');
    }
  },
  
  // Handle !time command
  'time': async (message) => {
    const now = new Date();
    await client.message.sendText(message.chatId, `Current time: ${now.toLocaleString()}`);
  }
};

// Listen for incoming messages
client.on('message.received', async (message) => {
  console.log('Received message:', message);
  
  // Skip messages sent by the bot itself
  if (message.fromMe) return;

  // Process text messages
  if (message.type === 'text' && message.body) {
    
    // Check if this is a command (starts with !)
    if (message.body.startsWith('!')) {
      // Extract the command name
      const commandName = message.body.substring(1).split(' ')[0].toLowerCase();
      
      // Find and execute the handler
      if (commandName in commandHandlers) {
        try {
          await commandHandlers[commandName](message);
        } catch (error: unknown) {
          console.error(`Error handling command ${commandName}:`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          await client.message.sendText(message.chatId, `Error processing command: ${errorMessage}`);
        }
      } else {
        // Unknown command
        await client.message.sendText(message.chatId, `Unknown command: !${commandName}\nType !help to see available commands.`);
      }
      return;
    }
    
    // Respond to greetings
    const greetings = ['hi', 'hello', 'hey', 'hola'];
    const messageText = message.body.toLowerCase();
    
    if (greetings.some(greeting => messageText.includes(greeting))) {
      // Reply with greeting
      await client.message.sendText(message.chatId, 'Hello! I\'m a WhatsLynx bot. Type !help to see what I can do.');
      return;
    }
  }
});

// Handle authentication
client.on('auth.qr', (qr) => {
  // Display QR code in terminal
  console.log('Please scan this QR code with your WhatsApp phone:');
  
  // Use qrcode-terminal to display QR code in the terminal
  const qrcode = require('qrcode-terminal');
  qrcode.generate(qr.qrCode, { small: true });
  
  console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds. Attempt ${qr.attempts}/${client.getOptions().maxQRAttempts || 5}`);
});

// Handle pairing code
client.on('auth.pairing-code', (data) => {
  console.log(`Pairing code: ${data.pairingCode}`);
  console.log(`Enter this code in your WhatsApp app to authenticate.`);
  console.log(`Code expires at: ${new Date(data.pairingCodeExpiresAt).toLocaleString()}`);
});

// Handle successful authentication
client.on('auth.authenticated', () => {
  console.log('Authenticated successfully!');
});

// Handle connection
client.on('connected', () => {
  console.log('Connected to WhatsApp!');
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.log('Disconnected from WhatsApp:', reason);
});

// Start the bot
async function startBot() {
  try {
    console.log('Starting WhatsLynx bot...');
    
    // Choose authentication method
    const authMethod = process.env.AUTH_METHOD || 'qr'; // 'qr' or 'pairing'
    
    // Connect to WhatsApp server
    await client.connect();
    
    if (authMethod === 'pairing') {
      // Check if phone number is provided
      const phoneNumber = process.env.PHONE_NUMBER;
      if (!phoneNumber) {
        console.error('Phone number is required for pairing code authentication.');
        console.error('Set PHONE_NUMBER environment variable (without the "+" prefix).');
        process.exit(1);
      }
      
      // Start pairing code authentication
      console.log(`Requesting pairing code for phone number: ${phoneNumber}`);
      await client.auth.startPairingCodeAuth({ phoneNumber });
    } else {
      // Start QR code authentication
      console.log('Starting QR code authentication. Please scan the QR code with your WhatsApp app.');
      await client.auth.startAuthentication();
    }
    
    console.log('Waiting for authentication...');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start bot:', errorMessage);
    process.exit(1);
  }
}

// Run the bot
startBot();
