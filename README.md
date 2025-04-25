# WhatsLynx

A powerful WhatsApp Web API library enabling developers to build sophisticated WhatsApp bots with advanced communication capabilities.

> **Warning**: This project is still under active development and is not yet ready for production use. The API is subject to change, and some features might not be fully implemented or tested. Use at your own risk.

## Current Status

This is a TypeScript implementation of a WhatsApp Web API client that's being developed as an alternative to the existing libraries. We're working on making this library more robust and feature-complete.

## Features

- **Multi-Device Support**: Works with the latest WhatsApp Multi-Device infrastructure
- **Multiple Authentication Methods**: Supports both QR code and pairing code authentication
- **Media Handling**: Send and receive all types of media (images, videos, documents, stickers, etc.)
- **Group Management**: Complete group creation and management functionality
- **Event-Based Architecture**: Simple and intuitive event-based API
- **TypeScript Support**: Written in TypeScript for better developer experience
- **Automatic Reconnection**: Handles connection issues gracefully
- **Session Persistence**: Save and restore sessions to avoid re-authentication

## Installation

```bash
npm install whatslynx
```

## Quick Start

```javascript
const WhatsLynxClient = require('whatslynx');

// Create a new client
const client = new WhatsLynxClient();

// Handle QR code for authentication
client.on('auth.qr', (qr) => {
  console.log('Scan the QR code with your WhatsApp app:');
  // Display QR with qrcode-terminal
  require('qrcode-terminal').generate(qr.qrCode, { small: true });
});

// Handle successful authentication
client.on('auth.authenticated', () => {
  console.log('Authenticated successfully!');
});

// Handle incoming messages
client.on('message.received', async (message) => {
  console.log(`Received message: ${message.body}`);
  
  // Reply to messages
  if (message.body === '!ping') {
    await client.message.sendText(message.chatId, 'Pong!');
  }
});

// Connect to WhatsApp
(async () => {
  await client.connect();
  await client.auth.startAuthentication();
})();
```

## Authentication Methods

### QR Code Authentication

```javascript
// Start authentication with QR code
await client.auth.startAuthentication();
```

### Pairing Code Authentication

```javascript
// Start authentication with pairing code
await client.auth.startPairingCodeAuth({
  phoneNumber: '1234567890'  // Phone number with country code, no +
});
```

## Examples

Check the `examples` directory for more detailed examples:

- `simple-bot.ts`: Basic bot with message handling
- `auth-with-qr.ts`: Authentication with QR code
- `auth-with-pairing.ts`: Authentication with pairing code
- `advanced-bot.ts`: Advanced bot with multiple features
- `media-handling.ts`: Working with different media types
- `group-management.ts`: Group creation and management
- `advanced-media-groups.ts`: Combined media and group functionality

## License

MIT