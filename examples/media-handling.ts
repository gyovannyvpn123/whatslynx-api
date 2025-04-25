/**
 * WhatsLynx Media Handling Example
 * 
 * This example demonstrates how to send and receive different types of media
 * including images, videos, documents, and more.
 */

import WhatsLynxClient from '../src/index';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Create readline interface for user input
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
const client = new WhatsLynxClient();

// File path for session data
const SESSION_FILE_PATH = './whatsapp-session.json';

// Directory for downloaded media
const DOWNLOADS_DIR = './downloads';

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

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

// Handle QR code for authentication
client.on('auth.qr', (qr) => {
  console.log('Please scan this QR code with your WhatsApp phone:');
  console.log(qr.qrCode);
});

// Handle successful authentication
client.on('auth.authenticated', () => {
  console.log('Authenticated successfully!');
  saveSessionData(client.getSessionData());
});

// Handle connection
client.on('connected', () => {
  console.log('Connected to WhatsApp!');
  showMenu();
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.log('Disconnected from WhatsApp:', reason);
});

// Handle media upload progress
client.on('media.upload-progress', (progress) => {
  console.log(`Upload progress: ${Math.round(progress.progress * 100)}%`);
});

// Handle media download progress
client.on('media.download-progress', (progress) => {
  console.log(`Download progress: ${Math.round(progress.progress * 100)}%`);
});

// Listen for incoming messages with media
client.on('message.received', async (message) => {
  if (message.fromMe) return;  // Skip messages sent by us
  
  const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker'];
  
  // Check if the message contains media
  if (mediaTypes.includes(message.type)) {
    console.log(`\nReceived ${message.type} from ${message.sender}:`);
    
    try {
      // Download the media
      console.log('Downloading media...');
      const mediaData = await client.message.downloadMedia(message.id);
      
      // Generate a filename
      const extension = getExtensionForMimetype(message.mimetype);
      const filename = `${message.id}.${extension}`;
      const filePath = path.join(DOWNLOADS_DIR, filename);
      
      // Save the file
      fs.writeFileSync(filePath, mediaData);
      console.log(`Media saved to: ${filePath}`);
      
      // Auto-reply to let the sender know we received the media
      await client.message.sendText(message.chatId, `Thanks for the ${message.type}! I've saved it.`);
      
      // Return to menu
      showMenu();
    } catch (error) {
      console.error('Failed to download media:', error);
    }
  }
});

// Get file extension based on mimetype
function getExtensionForMimetype(mimetype: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/plain': 'txt'
  };
  
  return mimeToExt[mimetype] || 'bin';
}

// Display the main menu
async function showMenu(): Promise<void> {
  console.log('\n=== WhatsLynx Media Demo ===');
  console.log('1. Send an image');
  console.log('2. Send a video');
  console.log('3. Send an audio file');
  console.log('4. Send a document');
  console.log('5. Send a voice note');
  console.log('6. Send a sticker');
  console.log('7. Send a location');
  console.log('8. Exit');
  
  const choice = await prompt('\nSelect an option (1-8): ');
  
  switch (choice) {
    case '1': await sendImage(); break;
    case '2': await sendVideo(); break;
    case '3': await sendAudio(); break;
    case '4': await sendDocument(); break;
    case '5': await sendVoiceNote(); break;
    case '6': await sendSticker(); break;
    case '7': await sendLocation(); break;
    case '8':
      console.log('Exiting...');
      await client.disconnect();
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('Invalid choice. Please try again.');
      showMenu();
      break;
  }
}

// Send an image
async function sendImage(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const imagePath = await prompt('Enter the path to the image file: ');
    const caption = await prompt('Enter a caption (optional): ');
    
    console.log('Sending image...');
    await client.message.sendMedia(chatId, imagePath, {
      caption: caption || undefined,
      mimetype: 'image/jpeg'
    });
    
    console.log('Image sent successfully!');
  } catch (error) {
    console.error('Failed to send image:', error);
  }
  
  showMenu();
}

// Send a video
async function sendVideo(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const videoPath = await prompt('Enter the path to the video file: ');
    const caption = await prompt('Enter a caption (optional): ');
    
    console.log('Sending video...');
    await client.message.sendMedia(chatId, videoPath, {
      caption: caption || undefined,
      mimetype: 'video/mp4'
    });
    
    console.log('Video sent successfully!');
  } catch (error) {
    console.error('Failed to send video:', error);
  }
  
  showMenu();
}

// Send an audio file
async function sendAudio(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const audioPath = await prompt('Enter the path to the audio file: ');
    
    console.log('Sending audio...');
    await client.message.sendMedia(chatId, audioPath, {
      mimetype: 'audio/mpeg'
    });
    
    console.log('Audio sent successfully!');
  } catch (error) {
    console.error('Failed to send audio:', error);
  }
  
  showMenu();
}

// Send a document
async function sendDocument(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const documentPath = await prompt('Enter the path to the document file: ');
    const fileName = await prompt('Enter a file name (optional): ');
    
    console.log('Sending document...');
    await client.message.sendMedia(chatId, documentPath, {
      fileName: fileName || path.basename(documentPath),
      mimetype: 'application/octet-stream',
      sendAsDocumentType: true
    });
    
    console.log('Document sent successfully!');
  } catch (error) {
    console.error('Failed to send document:', error);
  }
  
  showMenu();
}

// Send a voice note
async function sendVoiceNote(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const audioPath = await prompt('Enter the path to the voice note audio file: ');
    
    console.log('Sending voice note...');
    await client.message.sendMedia(chatId, audioPath, {
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true  // Push to talk (voice note)
    });
    
    console.log('Voice note sent successfully!');
  } catch (error) {
    console.error('Failed to send voice note:', error);
  }
  
  showMenu();
}

// Send a sticker
async function sendSticker(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const stickerPath = await prompt('Enter the path to the WebP sticker image: ');
    
    console.log('Sending sticker...');
    await client.message.sendMedia(chatId, stickerPath, {
      mimetype: 'image/webp'
    });
    
    console.log('Sticker sent successfully!');
  } catch (error) {
    console.error('Failed to send sticker:', error);
  }
  
  showMenu();
}

// Send a location
async function sendLocation(): Promise<void> {
  try {
    const chatId = await prompt('Enter the recipient\'s phone number or group ID: ');
    const latitude = parseFloat(await prompt('Enter latitude: '));
    const longitude = parseFloat(await prompt('Enter longitude: '));
    const name = await prompt('Enter location name (optional): ');
    const address = await prompt('Enter location address (optional): ');
    
    console.log('Sending location...');
    await client.message.sendLocation(chatId, latitude, longitude, {
      name: name || undefined,
      address: address || undefined
    });
    
    console.log('Location sent successfully!');
  } catch (error) {
    console.error('Failed to send location:', error);
  }
  
  showMenu();
}

// Start the application
async function start(): Promise<void> {
  try {
    // Load existing session if available
    const sessionData = await loadSessionData();
    
    if (sessionData) {
      console.log('Found existing session, attempting to restore...');
      try {
        await client.connect(sessionData);
      } catch (error) {
        console.log('Failed to restore session. A new QR code will be generated.');
        await client.connect();
      }
    } else {
      console.log('No saved session found. Please scan the QR code.');
      await client.connect();
    }
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Run the application
start();
