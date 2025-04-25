import { WhatsLynxClient } from '../src/client-fixed2';
import * as qrcode from 'qrcode-terminal';
import { WhatsLynxEvents } from '../src/types';

/**
 * Simple WhatsApp Bot Example
 * 
 * This example demonstrates how to create a basic WhatsApp bot using WhatsLynx.
 * It shows QR code for authentication and responds to messages with predefined replies.
 */

// Initialize WhatsLynx client
const client = new WhatsLynxClient({
  browserName: 'Chrome',
  deviceName: 'Simple Bot',
  syncContacts: true,
  syncChats: true
});

// Event: QR code received
client.on(WhatsLynxEvents.QR_RECEIVED, (qr) => {
  console.log('Scan this QR code to log in:');
  qrcode.generate(qr, { small: true });
});

// Event: Authenticated
client.on(WhatsLynxEvents.AUTHENTICATED, () => {
  console.log('Authenticated successfully!');
});

// Event: Connection update
client.on(WhatsLynxEvents.CONNECTION_UPDATE, (update) => {
  console.log(`Connection status changed: ${update.currentState}`);
});

// Event: Message received
client.on(WhatsLynxEvents.MESSAGE_RECEIVED, async (message) => {
  console.log(`New message received from ${message.sender}: ${message.content.body}`);
  
  // Skip messages sent by the bot itself
  if (message.fromMe) return;
  
  // Skip messages that aren't text
  if (message.type !== 'text') return;
  
  const text = message.content.body.toLowerCase();
  
  // Reply based on message content
  if (text.includes('hello') || text.includes('hi')) {
    await client.message.sendText(message.chatId, 'Hello there! How can I help you today?');
  } else if (text.includes('help')) {
    await client.message.sendText(message.chatId, 'Here are the commands you can use:\n- hello: Greet the bot\n- help: Show this message\n- time: Get current time\n- about: About this bot');
  } else if (text.includes('time')) {
    const now = new Date();
    await client.message.sendText(message.chatId, `The current time is: ${now.toLocaleTimeString()}`);
  } else if (text.includes('about')) {
    await client.message.sendText(message.chatId, 'I am a simple bot created with WhatsLynx API. I can respond to basic commands.');
  } else {
    await client.message.sendText(message.chatId, "I'm not sure how to respond to that. Try 'help' to see what I can do.");
  }
});

// Connect to WhatsApp
client.connect()
  .then(() => {
    console.log('Connected to WhatsApp!');
  })
  .catch((error) => {
    console.error('Failed to connect:', error instanceof Error ? error.message : 'Unknown error');
  });

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Disconnecting...');
  await client.disconnect();
  process.exit(0);
});