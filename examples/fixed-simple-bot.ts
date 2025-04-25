/**
 * Simple WhatsApp Bot Example (Fixed version)
 * 
 * This example shows how to create a basic bot that responds to messages
 * automatically. The bot will greet users, respond to specific commands,
 * and provide help information.
 */

import WhatsLynxClient from '../src/index';
import { Message } from '../src/types/message';
import { getErrorMessage } from '../src/utils/error-handler';

// Create a new WhatsLynx client
const client = new WhatsLynxClient({
  // Set your client options here
  deviceName: 'Simple Bot',
  browserName: 'Chrome',
  autoReconnect: true,
  maxQRAttempts: 5,
  logger: (level: string, message: string, ...args: any[]) => {
    console.log(`[${level.toUpperCase()}] ${message}`, ...args);
  }
});

// Define command handlers
const commandHandlers: Record<string, (message: Message) => Promise<void>> = {
  // Help command
  async help(message: Message) {
    await client.message.sendText(message.chatId, 
      'Available commands:\n\n' +
      '!help - Show this help message\n' +
      '!ping - Check if the bot is online\n' +
      '!info - Get information about this chat\n' +
      '!echo <text> - Echo back the provided text'
    );
  },
  
  // Ping command
  async ping(message: Message) {
    const start = Date.now();
    const response = await client.message.sendText(message.chatId, 'Pinging...');
    const end = Date.now();
    await client.message.sendText(message.chatId, `Pong! Response time: ${end - start}ms`);
  },
  
  // Info command
  async info(message: Message) {
    const text = 
      `Chat ID: ${message.chatId}\n` +
      `Message ID: ${message.id}\n` +
      `Sender: ${message.sender}${message.senderName ? ` (${message.senderName})` : ''}\n` +
      `Message type: ${message.type}\n` +
      `Time: ${new Date(message.timestamp).toLocaleString()}`;
    
    await client.message.sendText(message.chatId, text);
  },
  
  // Echo command
  async echo(message: Message) {
    const bodyParts = message.content?.text?.split(' ') || [];
    bodyParts.shift(); // Remove command part
    
    const textToEcho = bodyParts.join(' ');
    if (!textToEcho) {
      await client.message.sendText(message.chatId, 'Please provide a message to echo. Example: !echo Hello world');
      return;
    }
    
    await client.message.sendText(message.chatId, textToEcho);
  }
};

// Listen for messages
client.on('message.received', async (message: Message) => {
  // Skip messages from self
  if (message.fromMe) return;
  
  // Process the message content
  if (message.type === 'text' && message.content && message.content.text) {
    const messageText = message.content.text.trim();
    
    // Check if it's a command (starts with !)
    if (messageText.startsWith('!')) {
      const [command, ...args] = messageText.substring(1).split(' ');
      const commandName = command.toLowerCase();
      
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
    const messageTextLower = messageText.toLowerCase();
    
    if (greetings.some(greeting => messageTextLower.includes(greeting))) {
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