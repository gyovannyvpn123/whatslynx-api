/**
 * WhatsLynx Advanced Media and Groups Example
 * 
 * This example demonstrates how to use media and group management
 * functionality in WhatsLynx including:
 * - Sending and receiving different types of media
 * - Creating and managing groups
 * - Adding and removing participants
 * - Changing group settings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import WhatsLynxClient from '../src/index';
import { MediaType, GroupInviteMode, GroupMessageMode } from '../src/types';

// Create readline interface for command-line input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create a question function that uses the readline interface
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Create a WhatsLynx client with custom options
const client = new WhatsLynxClient({
  logger: (level, message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
  },
  autoReconnect: true,
  maxReconnectAttempts: 5,
  deviceName: 'WhatsLynx Demo'
});

// Set up event listeners
function setupEventListeners() {
  // Authentication events
  client.on('auth.qr', (qr) => {
    console.log('\nScan this QR code with your WhatsApp app:');
    
    try {
      const qrcode = require('qrcode-terminal');
      qrcode.generate(qr.qrCode, { small: true });
    } catch (error) {
      console.log('QR Code:', qr.qrCode);
    }
    
    console.log(`QR Code expires in ${Math.floor(qr.timeout / 1000)} seconds`);
  });
  
  client.on('auth.authenticated', () => {
    console.log('\n✅ Authenticated successfully!');
    
    // Save session data for future reconnections
    const sessionData = client.getSessionData();
    if (sessionData) {
      fs.writeFileSync('./session.json', JSON.stringify(sessionData, null, 2));
      console.log('Session data saved.');
    }
  });
  
  // Connection events
  client.on('connected', () => {
    console.log('\n🔌 Connected to WhatsApp!');
  });
  
  client.on('disconnected', (reason) => {
    console.log(`\n🔌 Disconnected from WhatsApp: ${reason}`);
  });
  
  // Message events
  client.on('message.received', async (message) => {
    // Skip messages from ourselves
    if (message.fromMe) return;
    
    console.log(`\nReceived message from ${message.senderName || message.chatId}: ${message.body || '[Media message]'}`);
    
    // Handle media messages
    if (client.media.hasMedia(message)) {
      console.log(`Received ${client.media.getMediaType(message)} media`);
      
      // Download media automatically
      try {
        const media = await client.media.download(message, {
          autoSave: true,
          directory: './received_media'
        });
        
        console.log(`Media downloaded to: ./received_media/${media.filename}`);
      } catch (error) {
        console.error('Failed to download media:', error);
      }
    }
    
    // Auto-reply to specific commands
    if (message.type === 'text' && message.body) {
      if (message.body === '!mediatest') {
        await handleMediaTest(message.chatId);
      } else if (message.body === '!grouptest') {
        await handleGroupTest(message.chatId);
      }
    }
  });
}

// Load session data if available
function loadSessionData() {
  try {
    if (fs.existsSync('./session.json')) {
      const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
      console.log('📂 Found existing session data');
      return sessionData;
    }
  } catch (error) {
    console.error('Error loading session data:', error);
  }
  return null;
}

// Handle media test
async function handleMediaTest(chatId: string) {
  try {
    console.log('\n📤 Sending media test...');
    
    // Send text message first
    await client.message.sendText(chatId, '*Media Test*\nSending various media types...');
    
    // Create test directory if it doesn't exist
    const testDir = './test_media';
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    
    // Create a simple text file for document test
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'This is a test document from WhatsLynx.');
    
    // Create a simple image (1x1 transparent pixel)
    const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    fs.writeFileSync(path.join(testDir, 'test.gif'), transparentPixel);
    
    // Send image
    await client.message.sendImage(
      chatId,
      path.join(testDir, 'test.gif'),
      'Test image caption'
    );
    console.log('✅ Image sent');
    
    // Send document
    await client.message.sendDocument(
      chatId,
      path.join(testDir, 'test.txt'),
      'Test document'
    );
    console.log('✅ Document sent');
    
    // Send location
    await client.message.sendLocation(
      chatId,
      {
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'San Francisco',
        address: 'California, USA'
      }
    );
    console.log('✅ Location sent');
    
    // Send final message
    await client.message.sendText(chatId, 'Media test completed ✅');
    
  } catch (error) {
    console.error('Media test failed:', error);
    await client.message.sendText(chatId, `Media test failed: ${error.message}`);
  }
}

// Handle group test
async function handleGroupTest(chatId: string) {
  try {
    console.log('\n👥 Starting group test...');
    
    // Send initial message
    await client.message.sendText(chatId, '*Group Test*\nPerforming group operations...');
    
    // Get my own WhatsApp ID
    const myInfo = client.getSessionData().authCredentials.me;
    const myId = myInfo.id;
    
    // Get existing groups
    const groups = await client.group.getGroups();
    console.log('📋 My groups:', groups.map(g => g.name).join(', ') || 'None');
    
    // Ask for permission to create a test group
    await client.message.sendText(chatId, 'Would you like me to create a test group? (Reply with yes/no)');
    
    // Wait for user confirmation
    const createGroup = await question('\nCreate test group? (yes/no): ');
    if (createGroup.toLowerCase() !== 'yes') {
      await client.message.sendText(chatId, 'Group test cancelled.');
      return;
    }
    
    // Create a test group
    const newGroup = await client.group.create(
      'WhatsLynx Test Group',
      [chatId], // Add the user who initiated the test
      {
        description: 'This is a test group created by WhatsLynx'
      }
    );
    
    console.log('✅ Group created:', newGroup.id);
    
    // Send a message to the new group
    await client.message.sendText(
      newGroup.id,
      `Group created successfully!\n\nGroup ID: ${newGroup.id}\nName: ${newGroup.name}\nCreated by: ${myInfo.name || myId}\n\nThis is a test group for WhatsLynx demo.`
    );
    
    // Update group settings
    await client.group.updateSettings(newGroup.id, {
      name: 'WhatsLynx Demo Group',
      description: 'Updated description for testing group settings',
      inviteMode: GroupInviteMode.ADMINS_ONLY,
      messageMode: GroupMessageMode.ALL_PARTICIPANTS,
      disappearingMessages: 86400 // 24 hours
    });
    
    console.log('✅ Group settings updated');
    
    // Get invite link
    const inviteLink = await client.group.getInviteLink(newGroup.id);
    console.log('🔗 Group invite link:', inviteLink);
    
    // Send final message to the original chat
    await client.message.sendText(
      chatId,
      `Group test completed ✅\n\nCreated group: ${newGroup.name}\nInvite link: ${inviteLink}`
    );
    
    // Ask if the user wants to leave the test group
    await client.message.sendText(chatId, 'Would you like me to leave the test group? (Reply with yes/no)');
    
    const leaveGroup = await question('\nLeave test group? (yes/no): ');
    if (leaveGroup.toLowerCase() === 'yes') {
      await client.group.leave(newGroup.id);
      console.log('✅ Left the test group');
      await client.message.sendText(chatId, 'Left the test group.');
    } else {
      await client.message.sendText(chatId, 'I will remain in the test group.');
    }
    
  } catch (error) {
    console.error('Group test failed:', error);
    await client.message.sendText(chatId, `Group test failed: ${error.message}`);
  }
}

// Display main menu with options
async function showMainMenu() {
  console.log('\n====== WhatsLynx Media & Groups Demo ======');
  console.log('1. Send Test Media');
  console.log('2. Group Management');
  console.log('3. View Session Info');
  console.log('4. Exit');
  console.log('==========================================');
  
  const choice = await question('Select an option (1-4): ');
  
  switch (choice) {
    case '1':
      await showMediaMenu();
      break;
    case '2':
      await showGroupMenu();
      break;
    case '3':
      showSessionInfo();
      await showMainMenu();
      break;
    case '4':
      console.log('Exiting...');
      await client.disconnect();
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('Invalid option, please try again.');
      await showMainMenu();
      break;
  }
}

// Display media menu
async function showMediaMenu() {
  console.log('\n====== Media Menu ======');
  console.log('1. Send Image');
  console.log('2. Send Document');
  console.log('3. Send Location');
  console.log('4. Send Media Test');
  console.log('5. Back to Main Menu');
  console.log('=======================');
  
  const choice = await question('Select an option (1-5): ');
  
  // Ask for recipient only if needed
  let recipient = '';
  if (choice !== '5') {
    recipient = await question('Enter recipient (phone number or group ID): ');
    if (!recipient) {
      console.log('Recipient is required. Returning to menu.');
      await showMediaMenu();
      return;
    }
  }
  
  switch (choice) {
    case '1':
      const imagePath = await question('Enter image path (or press Enter for test image): ');
      const caption = await question('Enter caption (optional): ');
      
      let imageToSend = imagePath;
      if (!imagePath) {
        // Create test directory and image if it doesn't exist
        const testDir = './test_media';
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir);
        }
        
        // Create a test image (1x1 transparent pixel)
        const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        const testImagePath = path.join(testDir, 'test.gif');
        fs.writeFileSync(testImagePath, transparentPixel);
        
        imageToSend = testImagePath;
        console.log(`Using test image: ${testImagePath}`);
      }
      
      try {
        await client.message.sendImage(recipient, imageToSend, caption);
        console.log('✅ Image sent successfully!');
      } catch (error) {
        console.error('Failed to send image:', error);
      }
      break;
      
    case '2':
      const documentPath = await question('Enter document path (or press Enter for test document): ');
      const documentCaption = await question('Enter document caption (optional): ');
      
      let documentToSend = documentPath;
      if (!documentPath) {
        // Create test directory and document if it doesn't exist
        const testDir = './test_media';
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir);
        }
        
        // Create a test document
        const testDocPath = path.join(testDir, 'test.txt');
        fs.writeFileSync(testDocPath, 'This is a test document from WhatsLynx.');
        
        documentToSend = testDocPath;
        console.log(`Using test document: ${testDocPath}`);
      }
      
      try {
        await client.message.sendDocument(recipient, documentToSend, documentCaption);
        console.log('✅ Document sent successfully!');
      } catch (error) {
        console.error('Failed to send document:', error);
      }
      break;
      
    case '3':
      const latitude = parseFloat(await question('Enter latitude (default: 37.7749): ') || '37.7749');
      const longitude = parseFloat(await question('Enter longitude (default: -122.4194): ') || '-122.4194');
      const name = await question('Enter location name (default: San Francisco): ') || 'San Francisco';
      const address = await question('Enter address (default: California, USA): ') || 'California, USA';
      
      try {
        await client.message.sendLocation(recipient, { latitude, longitude, name, address });
        console.log('✅ Location sent successfully!');
      } catch (error) {
        console.error('Failed to send location:', error);
      }
      break;
      
    case '4':
      try {
        await handleMediaTest(recipient);
        console.log('✅ Media test completed!');
      } catch (error) {
        console.error('Media test failed:', error);
      }
      break;
      
    case '5':
      await showMainMenu();
      return;
      
    default:
      console.log('Invalid option, please try again.');
      break;
  }
  
  // Return to media menu after operation
  await showMediaMenu();
}

// Display group menu
async function showGroupMenu() {
  console.log('\n====== Group Menu ======');
  console.log('1. List My Groups');
  console.log('2. Create New Group');
  console.log('3. Get Group Info');
  console.log('4. Update Group Settings');
  console.log('5. Add Participants');
  console.log('6. Remove Participants');
  console.log('7. Get Invite Link');
  console.log('8. Join Group via Link');
  console.log('9. Leave Group');
  console.log('10. Back to Main Menu');
  console.log('=======================');
  
  const choice = await question('Select an option (1-10): ');
  
  switch (choice) {
    case '1':
      try {
        const groups = await client.group.getGroups();
        console.log('\nMy Groups:');
        if (groups.length === 0) {
          console.log('No groups found.');
        } else {
          groups.forEach((group, index) => {
            console.log(`${index + 1}. ${group.name} (${group.id})`);
          });
        }
      } catch (error) {
        console.error('Failed to list groups:', error);
      }
      break;
      
    case '2':
      const groupName = await question('Enter group name: ');
      if (!groupName) {
        console.log('Group name is required.');
        break;
      }
      
      const participantsInput = await question('Enter participants (comma-separated phone numbers): ');
      if (!participantsInput) {
        console.log('At least one participant is required.');
        break;
      }
      
      const participants = participantsInput.split(',').map(p => p.trim());
      const description = await question('Enter group description (optional): ');
      
      try {
        const newGroup = await client.group.create(groupName, participants, { description });
        console.log('✅ Group created successfully!');
        console.log(`Group ID: ${newGroup.id}`);
        console.log(`Group Name: ${newGroup.name}`);
        console.log(`Participants: ${newGroup.participants.length}`);
      } catch (error) {
        console.error('Failed to create group:', error);
      }
      break;
      
    case '3':
      const groupId = await question('Enter group ID: ');
      if (!groupId) {
        console.log('Group ID is required.');
        break;
      }
      
      try {
        const groupInfo = await client.group.getInfo(groupId);
        console.log('\nGroup Information:');
        console.log(`ID: ${groupInfo.id}`);
        console.log(`Name: ${groupInfo.name}`);
        console.log(`Description: ${groupInfo.description || 'None'}`);
        console.log(`Owner: ${groupInfo.owner}`);
        console.log(`Created: ${new Date(groupInfo.createdAt).toLocaleString()}`);
        console.log(`Participants: ${groupInfo.participants.length}`);
        console.log(`Invite Link: ${groupInfo.inviteLink || 'None'}`);
        console.log(`Message Mode: ${groupInfo.messageMode}`);
        console.log(`Invite Mode: ${groupInfo.inviteMode}`);
        console.log(`Disappearing Messages: ${groupInfo.disappearingMessages === 0 ? 'Disabled' : `${groupInfo.disappearingMessages} seconds`}`);
      } catch (error) {
        console.error('Failed to get group info:', error);
      }
      break;
      
    case '4':
      const groupIdToUpdate = await question('Enter group ID: ');
      if (!groupIdToUpdate) {
        console.log('Group ID is required.');
        break;
      }
      
      const newName = await question('Enter new name (or press Enter to skip): ');
      const newDescription = await question('Enter new description (or press Enter to skip): ');
      
      const inviteModeInput = await question('Enter invite mode (admins_only/all_participants or press Enter to skip): ');
      let inviteMode;
      if (inviteModeInput === 'admins_only') {
        inviteMode = GroupInviteMode.ADMINS_ONLY;
      } else if (inviteModeInput === 'all_participants') {
        inviteMode = GroupInviteMode.ALL_PARTICIPANTS;
      }
      
      const messageModeInput = await question('Enter message mode (admins_only/all_participants or press Enter to skip): ');
      let messageMode;
      if (messageModeInput === 'admins_only') {
        messageMode = GroupMessageMode.ADMINS_ONLY;
      } else if (messageModeInput === 'all_participants') {
        messageMode = GroupMessageMode.ALL_PARTICIPANTS;
      }
      
      const disappearingInput = await question('Enter disappearing messages duration in seconds (0 to disable, or press Enter to skip): ');
      const disappearingMessages = disappearingInput ? parseInt(disappearingInput) : undefined;
      
      const settings: any = {};
      if (newName) settings.name = newName;
      if (newDescription) settings.description = newDescription;
      if (inviteMode) settings.inviteMode = inviteMode;
      if (messageMode) settings.messageMode = messageMode;
      if (disappearingMessages !== undefined) settings.disappearingMessages = disappearingMessages;
      
      try {
        const updatedGroup = await client.group.updateSettings(groupIdToUpdate, settings);
        console.log('✅ Group settings updated successfully!');
      } catch (error) {
        console.error('Failed to update group settings:', error);
      }
      break;
      
    case '5':
      const groupIdToAddTo = await question('Enter group ID: ');
      if (!groupIdToAddTo) {
        console.log('Group ID is required.');
        break;
      }
      
      const participantsToAdd = await question('Enter participants to add (comma-separated phone numbers): ');
      if (!participantsToAdd) {
        console.log('At least one participant is required.');
        break;
      }
      
      const participantList = participantsToAdd.split(',').map(p => p.trim());
      
      try {
        await client.group.addParticipants(groupIdToAddTo, participantList);
        console.log('✅ Participants added successfully!');
      } catch (error) {
        console.error('Failed to add participants:', error);
      }
      break;
      
    case '6':
      const groupIdToRemoveFrom = await question('Enter group ID: ');
      if (!groupIdToRemoveFrom) {
        console.log('Group ID is required.');
        break;
      }
      
      const participantsToRemove = await question('Enter participants to remove (comma-separated phone numbers): ');
      if (!participantsToRemove) {
        console.log('At least one participant is required.');
        break;
      }
      
      const removeList = participantsToRemove.split(',').map(p => p.trim());
      
      try {
        await client.group.removeParticipants(groupIdToRemoveFrom, removeList);
        console.log('✅ Participants removed successfully!');
      } catch (error) {
        console.error('Failed to remove participants:', error);
      }
      break;
      
    case '7':
      const groupIdForLink = await question('Enter group ID: ');
      if (!groupIdForLink) {
        console.log('Group ID is required.');
        break;
      }
      
      try {
        const inviteLink = await client.group.getInviteLink(groupIdForLink);
        console.log('✅ Invite link:', inviteLink);
        
        const revoke = await question('Would you like to revoke and get a new link? (yes/no): ');
        if (revoke.toLowerCase() === 'yes') {
          const newLink = await client.group.revokeInviteLink(groupIdForLink);
          console.log('✅ New invite link:', newLink);
        }
      } catch (error) {
        console.error('Failed to get invite link:', error);
      }
      break;
      
    case '8':
      const inviteLink = await question('Enter invite link: ');
      if (!inviteLink) {
        console.log('Invite link is required.');
        break;
      }
      
      try {
        const joinedGroup = await client.group.joinViaLink(inviteLink);
        console.log('✅ Joined group successfully!');
        console.log(`Group ID: ${joinedGroup.id}`);
        console.log(`Group Name: ${joinedGroup.name}`);
      } catch (error) {
        console.error('Failed to join group:', error);
      }
      break;
      
    case '9':
      const groupIdToLeave = await question('Enter group ID: ');
      if (!groupIdToLeave) {
        console.log('Group ID is required.');
        break;
      }
      
      const confirm = await question('Are you sure you want to leave this group? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('Operation cancelled.');
        break;
      }
      
      try {
        await client.group.leave(groupIdToLeave);
        console.log('✅ Left group successfully!');
      } catch (error) {
        console.error('Failed to leave group:', error);
      }
      break;
      
    case '10':
      await showMainMenu();
      return;
      
    default:
      console.log('Invalid option, please try again.');
      break;
  }
  
  // Return to group menu after operation
  await showGroupMenu();
}

// Display session information
function showSessionInfo() {
  const sessionData = client.getSessionData();
  if (!sessionData) {
    console.log('No active session data.');
    return;
  }
  
  console.log('\n====== Session Information ======');
  
  if (sessionData.authCredentials && sessionData.authCredentials.me) {
    const me = sessionData.authCredentials.me;
    console.log(`Phone Number: ${me.phoneNumber}`);
    console.log(`WhatsApp ID: ${me.id}`);
    console.log(`Name: ${me.name || 'Unknown'}`);
  }
  
  if (sessionData.lastSeen) {
    console.log(`Last Seen: ${new Date(sessionData.lastSeen).toLocaleString()}`);
  }
  
  if (sessionData.browser) {
    console.log(`Client: ${sessionData.browser.name} ${sessionData.browser.version}`);
  }
  
  console.log('=================================');
}

// Main function
async function main() {
  try {
    // Set up event listeners
    setupEventListeners();
    
    console.log('Starting WhatsLynx...');
    
    // Try to restore previous session
    const sessionData = loadSessionData();
    
    // Connect to WhatsApp
    await client.connect(sessionData);
    
    if (sessionData) {
      console.log('Attempting to restore session...');
      try {
        await client.auth.restoreSession(sessionData);
        console.log('Session restored successfully!');
      } catch (error) {
        console.error('Failed to restore session:', error);
        console.log('Starting new authentication...');
        await client.auth.startAuthentication();
      }
    } else {
      console.log('Starting new authentication...');
      await client.auth.startAuthentication();
    }
    
    console.log('Waiting for authentication to complete...');
    
    // Wait for authentication before showing menu
    client.on('auth.authenticated', async () => {
      console.log('Authentication completed. Starting main menu...');
      await showMainMenu();
    });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Handle application exit
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT signal. Cleaning up...');
  
  try {
    await client.disconnect();
    console.log('Disconnected from WhatsApp.');
  } catch (error) {
    console.error('Error during disconnect:', error);
  }
  
  rl.close();
  process.exit(0);
});

// Start the application
main();