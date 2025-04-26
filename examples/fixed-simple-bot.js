/**
 * Simple WhatsApp Bot Example (Fixed version)
 * 
 * This example shows how to create a basic bot that responds to messages
 * automatically. The bot will greet users, respond to specific commands,
 * and provide help information.
 */

const { EventEmitter } = require('events');
const qrcode = require('qrcode-terminal');

// Create a simple WhatsApp client
class SimpleWhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.authenticated = false;
    
    // Create a simple message manager with sendText method
    this.messageManager = {
      sendText: async (chatId, text) => {
        console.log(`[Sending to ${chatId}]: ${text}`);
        // Simulate message sending delay
        await new Promise(resolve => setTimeout(resolve, 500));
        // Create a sent message object
        const message = {
          id: `msg_${Date.now()}`,
          chatId,
          type: 'text',
          sender: 'bot',
          timestamp: Date.now(),
          fromMe: true,
          content: { text }
        };
        // Emit message sent event
        this.emit('message.sent', message);
        return message;
      }
    };
  }
  
  // Getter for message manager
  get message() {
    return this.messageManager;
  }
  
  async connect() {
    console.log('Connecting to WhatsApp...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.connected = true;
    this.emit('connected');
    console.log('Connected to WhatsApp servers');
    
    // Generate QR code for authentication
    this.generateQRCode();
  }
  
  generateQRCode() {
    // Create QR code data
    const qrData = {
      qrCode: 'whatsapp-connector-demo-qr-code-placeholder',
      expiryTime: Date.now() + 60000,
      attempts: 1
    };
    
    // Emit QR code event
    this.emit('auth.qr', qrData);
    
    // Display QR code in terminal
    qrcode.generate(qrData.qrCode, { small: true });
    console.log('Scan this QR code with your WhatsApp to authenticate');
    
    // Simulate authentication after 5 seconds
    setTimeout(() => {
      this.authenticated = true;
      
      // Create session data
      const sessionData = {
        authCredentials: {
          serverToken: 'demo-server-token',
          clientToken: 'demo-client-token',
          encKey: Buffer.from('demo-encryption-key'),
          macKey: Buffer.from('demo-mac-key')
        },
        deviceDetails: {
          deviceId: 'demo-device-id',
          deviceName: 'WhatsLynx Demo',
          platform: 'Node.js',
          browser: 'WhatsLynx',
          browserVersion: '1.0.0'
        }
      };
      
      // Emit authenticated event
      this.emit('auth.authenticated', sessionData);
      console.log('Authentication successful!');
      
      // Start simulating incoming messages
      this.simulateIncomingMessages();
    }, 5000);
  }
  
  simulateIncomingMessages() {
    // Simulate a hello message after 3 seconds
    setTimeout(() => {
      const message = {
        id: `incoming_${Date.now()}`,
        chatId: '1234567890@c.us',
        type: 'text',
        sender: '1234567890@c.us',
        senderName: 'Demo User',
        timestamp: Date.now(),
        fromMe: false,
        content: { text: 'Hello bot!' }
      };
      
      this.emit('message.received', message);
      console.log(`[Received from ${message.senderName}]: ${message.content.text}`);
    }, 3000);
    
    // Simulate a help command after 8 seconds
    setTimeout(() => {
      const message = {
        id: `incoming_${Date.now()}`,
        chatId: '1234567890@c.us',
        type: 'text',
        sender: '1234567890@c.us',
        senderName: 'Demo User',
        timestamp: Date.now(),
        fromMe: false,
        content: { text: '!help' }
      };
      
      this.emit('message.received', message);
      console.log(`[Received from ${message.senderName}]: ${message.content.text}`);
    }, 8000);
    
    // Simulate a ping command after 12 seconds
    setTimeout(() => {
      const message = {
        id: `incoming_${Date.now()}`,
        chatId: '1234567890@c.us',
        type: 'text',
        sender: '1234567890@c.us',
        senderName: 'Demo User',
        timestamp: Date.now(),
        fromMe: false,
        content: { text: '!ping' }
      };
      
      this.emit('message.received', message);
      console.log(`[Received from ${message.senderName}]: ${message.content.text}`);
    }, 12000);
    
    // Simulate an echo command after 16 seconds
    setTimeout(() => {
      const message = {
        id: `incoming_${Date.now()}`,
        chatId: '1234567890@c.us',
        type: 'text',
        sender: '1234567890@c.us',
        senderName: 'Demo User',
        timestamp: Date.now(),
        fromMe: false,
        content: { text: '!echo Hello from WhatsLynx!' }
      };
      
      this.emit('message.received', message);
      console.log(`[Received from ${message.senderName}]: ${message.content.text}`);
    }, 16000);
  }
  
  isConnected() {
    return this.connected;
  }
  
  isAuthenticated() {
    return this.authenticated;
  }
}

// Create a client instance
const client = new SimpleWhatsAppClient();

// Define command handlers
const commandHandlers = {
  // Help command
  async help(message) {
    await client.message.sendText(message.chatId, 
      'Available commands:\n\n' +
      '!help - Show this help message\n' +
      '!ping - Check if the bot is online\n' +
      '!info - Get information about this chat\n' +
      '!echo <text> - Echo back the provided text'
    );
  },
  
  // Ping command
  async ping(message) {
    const start = Date.now();
    await client.message.sendText(message.chatId, 'Pinging...');
    const end = Date.now();
    await client.message.sendText(message.chatId, `Pong! Response time: ${end - start}ms`);
  },
  
  // Info command
  async info(message) {
    const text = 
      `Chat ID: ${message.chatId}\n` +
      `Message ID: ${message.id}\n` +
      `Sender: ${message.sender}${message.senderName ? ` (${message.senderName})` : ''}\n` +
      `Message type: ${message.type}\n` +
      `Time: ${new Date(message.timestamp).toLocaleString()}`;
    
    await client.message.sendText(message.chatId, text);
  },
  
  // Echo command
  async echo(message) {
    const text = message.content?.text;
    if (!text) return;
    
    const parts = text.split(' ');
    parts.shift(); // Remove command part
    
    const textToEcho = parts.join(' ');
    if (!textToEcho) {
      await client.message.sendText(message.chatId, 'Please provide a message to echo. Example: !echo Hello world');
      return;
    }
    
    await client.message.sendText(message.chatId, textToEcho);
  }
};

// Handle incoming messages
client.on('message.received', async (message) => {
  try {
    // Skip messages from self
    if (message.fromMe) return;
    
    // Process text messages
    if (message.type === 'text' && message.content && message.content.text) {
      const text = message.content.text.trim();
      
      // Check if it's a command (starts with !)
      if (text.startsWith('!')) {
        const commandName = text.substring(1).split(' ')[0].toLowerCase();
        
        // Find and execute the handler
        if (commandName in commandHandlers) {
          await commandHandlers[commandName](message);
        } else {
          // Unknown command
          await client.message.sendText(message.chatId, `Unknown command: !${commandName}\nType !help to see available commands.`);
        }
        return;
      }
      
      // Respond to greetings
      const greetings = ['hi', 'hello', 'hey', 'hola'];
      const textLower = text.toLowerCase();
      
      if (greetings.some(greeting => textLower.includes(greeting))) {
        // Reply with greeting
        await client.message.sendText(message.chatId, 'Hello! I\'m a WhatsLynx bot. Type !help to see what I can do.');
        return;
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Handle events
client.on('connected', () => {
  console.log('Connected to WhatsApp Web');
});

client.on('auth.qr', (qrData) => {
  console.log(`QR Code generated (expires in ${Math.floor((qrData.expiryTime - Date.now()) / 1000)}s)`);
});

client.on('auth.authenticated', (sessionData) => {
  console.log('Authentication successful, session established');
});

client.on('message.sent', (message) => {
  console.log(`Message sent to ${message.chatId}`);
});

// Start the bot
async function startBot() {
  try {
    console.log('Starting WhatsApp bot...');
    
    // Connect to WhatsApp Web
    await client.connect();
    
    console.log('Bot started successfully. Waiting for authentication...');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Run the bot
startBot();