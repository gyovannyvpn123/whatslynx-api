/**
 * Basic Connector Example
 * 
 * This example shows the fundamental pattern for connecting to WhatsApp using
 * WhatsLynx. It handles authentication and basic event listening but doesn't
 * do any message sending.
 */

// For demonstration purposes - this would normally be imported from the library
class WhatsLynxClient {
  constructor(options) {
    this.options = {
      deviceName: 'WhatsLynx Client',
      autoReconnect: true,
      printQRInTerminal: false,
      ...options
    };
    
    this.connected = false;
    this.authenticated = false;
    this.events = {};
    
    this.logger = this.options.logger || ((level, message, data) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
    });
  }
  
  on(event, handler) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);
    return this;
  }
  
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(handler => handler(data));
    }
  }
  
  async connect() {
    this.logger('info', 'Connecting to WhatsApp...');
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.connected = true;
    this.emit('connection.update', { 
      connection: 'connected',
      lastDisconnect: null
    });
    
    this.logger('info', 'Connected to WhatsApp servers');
    
    // If we have saved session data, try to restore it
    const sessionData = await this.loadSession();
    
    if (sessionData) {
      this.logger('info', 'Found saved session, attempting to restore');
      // Simulate restoring session
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate authentication success
      this.authenticated = true;
      this.emit('auth.update', {
        isAuthenticated: true,
        method: 'session-restore',
        sessionData
      });
      
      this.logger('info', 'Successfully restored session');
    } else {
      // No session found, generate QR code for authentication
      this.logger('info', 'No saved session found, generating QR code');
      
      const qrData = {
        qrCode: 'whatsapp-connector-demo-qr-code',
        expiryTime: Date.now() + 60000,
        attempts: 1
      };
      
      // Show QR code in terminal if enabled
      if (this.options.printQRInTerminal) {
        this.logger('info', 'Scan this QR code with your phone:');
        console.log('┌─────────────────────────────┐');
        console.log('│                             │');
        console.log('│   □□□□□□□□   □□□□□□□□□□□□   │');
        console.log('│   □     □   □          □   │');
        console.log('│   □ ███ □   □ ███████  □   │');
        console.log('│   □ █ █ □   □ █     █  □   │');
        console.log('│   □ ███ □   □ ███████  □   │');
        console.log('│   □     □   □          □   │');
        console.log('│   □□□□□□□   □□□□□□□□□□□□   │');
        console.log('│                             │');
        console.log('│   WhatsLynx Demo QR Code    │');
        console.log('│                             │');
        console.log('└─────────────────────────────┘');
      }
      
      this.emit('auth.qr', qrData);
      
      // Simulate QR code scan and authentication after 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const sessionData = {
        authToken: 'demo-auth-token',
        signedIdentityKey: Buffer.from('demo-identity-key'),
        signedPreKey: Buffer.from('demo-prekey'),
        registrationId: 12345,
        advSecretKey: Buffer.from('demo-secret-key'),
        nextPreKeyId: 123,
        firstUnuploadedPreKeyId: 123,
        deviceId: 'demo-device-id'
      };
      
      // Save the session data
      await this.saveSession(sessionData);
      
      // Simulate authentication success
      this.authenticated = true;
      this.emit('auth.update', {
        isAuthenticated: true,
        method: 'qr-code',
        sessionData
      });
      
      this.logger('info', 'Successfully authenticated via QR code');
    }
    
    return this;
  }
  
  isConnected() {
    return this.connected;
  }
  
  isAuthenticated() {
    return this.authenticated;
  }
  
  async disconnect() {
    if (!this.connected) {
      return;
    }
    
    this.logger('info', 'Disconnecting from WhatsApp...');
    
    // Simulate disconnection
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.connected = false;
    this.authenticated = false;
    
    this.emit('connection.update', {
      connection: 'disconnected',
      lastDisconnect: {
        reason: 'User requested disconnect'
      }
    });
    
    this.logger('info', 'Disconnected from WhatsApp');
  }
  
  // Session management methods
  async saveSession(sessionData) {
    // In a real implementation, this would save to a file or database
    this.logger('info', 'Saving session data...');
    this.sessionData = sessionData;
    return true;
  }
  
  async loadSession() {
    // In a real implementation, this would load from a file or database
    this.logger('info', 'Loading session data...');
    return this.sessionData || null;
  }
}

// Define an async function to start our connection
async function start() {
  console.log('Starting WhatsLynx Basic Connector Example...');
  
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
  client.on('connection.update', (update) => {
    console.log(`Connection status: ${update.connection}`);
    if (update.lastDisconnect) {
      console.log(`Disconnect reason: ${update.lastDisconnect.reason}`);
    }
  });
  
  client.on('auth.qr', (qrData) => {
    console.log(`QR code received! Expires in ${Math.floor((qrData.expiryTime - Date.now()) / 1000)} seconds`);
  });
  
  client.on('auth.update', (auth) => {
    console.log(`Authentication update: ${auth.isAuthenticated ? 'Authenticated' : 'Not authenticated'} via ${auth.method}`);
  });
  
  try {
    // Connect to WhatsApp
    await client.connect();
    
    console.log('\nConnection status:');
    console.log('- Connected:', client.isConnected());
    console.log('- Authenticated:', client.isAuthenticated());
    
    // Keep the process running to allow further interactions
    console.log('\nConnection established. Press Ctrl+C to exit...');
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

// Start the connector
start().catch(console.error);