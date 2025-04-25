/**
 * WhatsLynx Group Management Example
 * 
 * This example demonstrates how to create and manage WhatsApp groups,
 * including adding/removing participants, changing group settings, etc.
 */

import WhatsLynxClient from '../src/index';
import * as fs from 'fs';
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

// Store current group ID for convenience
let currentGroupId: string | null = null;

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

// Format phone number to WhatsApp ID
function formatToWhatsAppId(phoneNumber: string): string {
  // Remove any non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  return `${cleanNumber}@c.us`;
}

// Format group ID
function formatGroupId(groupId: string): string {
  if (groupId.includes('@g.us')) {
    return groupId;
  }
  return `${groupId}@g.us`;
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
  showMainMenu();
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.log('Disconnected from WhatsApp:', reason);
});

// Listen for group events
client.on('group.created', (data) => {
  console.log(`\nGroup created: ${data.name} (${data.groupId})`);
});

client.on('group.participant-added', (data) => {
  console.log(`\nParticipant added: ${data.participantId} to group ${data.groupId}`);
});

client.on('group.participant-removed', (data) => {
  console.log(`\nParticipant removed: ${data.participantId} from group ${data.groupId}`);
});

client.on('group.participant-promoted', (data) => {
  console.log(`\nParticipant promoted to admin: ${data.participantId} in group ${data.groupId}`);
});

client.on('group.participant-demoted', (data) => {
  console.log(`\nParticipant demoted from admin: ${data.participantId} in group ${data.groupId}`);
});

client.on('group.subject-changed', (data) => {
  console.log(`\nGroup subject changed to: ${data.subject} in group ${data.groupId}`);
});

client.on('group.description-changed', (data) => {
  console.log(`\nGroup description changed in group ${data.groupId}`);
});

client.on('group.settings-changed', (data) => {
  console.log(`\nGroup settings changed in group ${data.groupId}`);
});

// Display the main menu
async function showMainMenu(): Promise<void> {
  console.log('\n=== WhatsLynx Group Management Demo ===');
  console.log('1. Create a new group');
  console.log('2. List all groups');
  console.log('3. Select a group to manage');
  console.log('4. Join a group via invite link');
  console.log('5. Exit');
  
  const choice = await prompt('\nSelect an option (1-5): ');
  
  switch (choice) {
    case '1': await createGroup(); break;
    case '2': await listGroups(); break;
    case '3': await selectGroup(); break;
    case '4': await joinGroup(); break;
    case '5':
      console.log('Exiting...');
      await client.disconnect();
      rl.close();
      process.exit(0);
      break;
    default:
      console.log('Invalid choice. Please try again.');
      showMainMenu();
      break;
  }
}

// Display the group management menu
async function showGroupMenu(): Promise<void> {
  if (!currentGroupId) {
    console.log('No group selected. Returning to main menu...');
    showMainMenu();
    return;
  }
  
  // Get group info
  try {
    const groupInfo = await client.group.getInfo(currentGroupId);
    console.log(`\n=== Managing Group: ${groupInfo.name} ===`);
    
    console.log('1. Add participants');
    console.log('2. Remove participants');
    console.log('3. Promote participants to admin');
    console.log('4. Demote admins to regular participants');
    console.log('5. Change group name');
    console.log('6. Change group description');
    console.log('7. Get group invite link');
    console.log('8. Revoke group invite link');
    console.log('9. Change group settings');
    console.log('10. Leave group');
    console.log('11. Return to main menu');
    
    const choice = await prompt('\nSelect an option (1-11): ');
    
    switch (choice) {
      case '1': await addParticipants(); break;
      case '2': await removeParticipants(); break;
      case '3': await promoteParticipants(); break;
      case '4': await demoteParticipants(); break;
      case '5': await changeGroupName(); break;
      case '6': await changeGroupDescription(); break;
      case '7': await getInviteLink(); break;
      case '8': await revokeInviteLink(); break;
      case '9': await changeGroupSettings(); break;
      case '10': await leaveGroup(); break;
      case '11':
        currentGroupId = null;
        showMainMenu();
        break;
      default:
        console.log('Invalid choice. Please try again.');
        showGroupMenu();
        break;
    }
  } catch (error) {
    console.error('Error getting group info:', error);
    currentGroupId = null;
    showMainMenu();
  }
}

// Create a new group
async function createGroup(): Promise<void> {
  try {
    const groupName = await prompt('Enter a name for the new group: ');
    let participantsInput = await prompt('Enter phone numbers of participants (comma separated): ');
    
    // Convert phone numbers to WhatsApp IDs
    const participants = participantsInput.split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => formatToWhatsAppId(p));
    
    if (participants.length === 0) {
      console.log('At least one participant is required.');
      showMainMenu();
      return;
    }
    
    console.log('Creating group...');
    const groupInfo = await client.group.create(groupName, participants);
    
    console.log(`Group created successfully: ${groupInfo.name} (${groupInfo.id})`);
    currentGroupId = groupInfo.id;
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to create group:', error);
    showMainMenu();
  }
}

// List all groups
async function listGroups(): Promise<void> {
  try {
    console.log('Fetching groups...');
    const groups = await client.group.getAllGroups();
    
    if (groups.length === 0) {
      console.log('You are not a member of any groups.');
    } else {
      console.log('\nYour Groups:');
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name} (${group.id})`);
      });
    }
    
    showMainMenu();
    
  } catch (error) {
    console.error('Failed to list groups:', error);
    showMainMenu();
  }
}

// Select a group to manage
async function selectGroup(): Promise<void> {
  try {
    const groups = await client.group.getAllGroups();
    
    if (groups.length === 0) {
      console.log('You are not a member of any groups.');
      showMainMenu();
      return;
    }
    
    console.log('\nYour Groups:');
    groups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.name} (${group.id})`);
    });
    
    const selection = parseInt(await prompt('\nEnter the number of the group to manage: '));
    
    if (isNaN(selection) || selection < 1 || selection > groups.length) {
      console.log('Invalid selection.');
      showMainMenu();
      return;
    }
    
    currentGroupId = groups[selection - 1].id;
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to select group:', error);
    showMainMenu();
  }
}

// Join a group via invite link
async function joinGroup(): Promise<void> {
  try {
    const inviteLink = await prompt('Enter the group invite link or code: ');
    
    console.log('Joining group...');
    const groupInfo = await client.group.join(inviteLink);
    
    console.log(`Joined group successfully: ${groupInfo.name} (${groupInfo.id})`);
    currentGroupId = groupInfo.id;
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to join group:', error);
    showMainMenu();
  }
}

// Add participants to the current group
async function addParticipants(): Promise<void> {
  try {
    let participantsInput = await prompt('Enter phone numbers of participants to add (comma separated): ');
    
    // Convert phone numbers to WhatsApp IDs
    const participants = participantsInput.split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => formatToWhatsAppId(p));
    
    if (participants.length === 0) {
      console.log('At least one participant is required.');
      showGroupMenu();
      return;
    }
    
    console.log('Adding participants...');
    const results = await client.group.addParticipants(currentGroupId!, participants);
    
    // Report on each participant
    for (const [id, result] of Object.entries(results)) {
      if (result === true) {
        console.log(`Added ${id} successfully.`);
      } else {
        console.log(`Failed to add ${id}: ${result}`);
      }
    }
    
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to add participants:', error);
    showGroupMenu();
  }
}

// Remove participants from the current group
async function removeParticipants(): Promise<void> {
  try {
    // Get current participants
    const participants = await client.group.getParticipants(currentGroupId!);
    
    console.log('\nCurrent Participants:');
    participants.forEach((participant, index) => {
      console.log(`${index + 1}. ${participant.id} ${participant.isAdmin ? '(Admin)' : ''}`);
    });
    
    let selectionsInput = await prompt('\nEnter the numbers of participants to remove (comma separated): ');
    
    // Parse selections
    const selections = selectionsInput.split(',')
      .map(s => parseInt(s.trim()))
      .filter(s => !isNaN(s) && s >= 1 && s <= participants.length);
    
    if (selections.length === 0) {
      console.log('No valid selections.');
      showGroupMenu();
      return;
    }
    
    // Get participant IDs from selections
    const participantsToRemove = selections.map(s => participants[s - 1].id);
    
    console.log('Removing participants...');
    const results = await client.group.removeParticipants(currentGroupId!, participantsToRemove);
    
    // Report on each participant
    for (const [id, result] of Object.entries(results)) {
      if (result === true) {
        console.log(`Removed ${id} successfully.`);
      } else {
        console.log(`Failed to remove ${id}: ${result}`);
      }
    }
    
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to remove participants:', error);
    showGroupMenu();
  }
}

// Promote participants to admin in the current group
async function promoteParticipants(): Promise<void> {
  try {
    // Get current participants
    const participants = await client.group.getParticipants(currentGroupId!);
    
    // Filter out admins
    const regularParticipants = participants.filter(p => !p.isAdmin);
    
    if (regularParticipants.length === 0) {
      console.log('No regular participants to promote.');
      showGroupMenu();
      return;
    }
    
    console.log('\nRegular Participants:');
    regularParticipants.forEach((participant, index) => {
      console.log(`${index + 1}. ${participant.id}`);
    });
    
    let selectionsInput = await prompt('\nEnter the numbers of participants to promote (comma separated): ');
    
    // Parse selections
    const selections = selectionsInput.split(',')
      .map(s => parseInt(s.trim()))
      .filter(s => !isNaN(s) && s >= 1 && s <= regularParticipants.length);
    
    if (selections.length === 0) {
      console.log('No valid selections.');
      showGroupMenu();
      return;
    }
    
    // Get participant IDs from selections
    const participantsToPromote = selections.map(s => regularParticipants[s - 1].id);
    
    console.log('Promoting participants...');
    const results = await client.group.promoteParticipants(currentGroupId!, participantsToPromote);
    
    // Report on each participant
    for (const [id, result] of Object.entries(results)) {
      if (result === true) {
        console.log(`Promoted ${id} successfully.`);
      } else {
        console.log(`Failed to promote ${id}: ${result}`);
      }
    }
    
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to promote participants:', error);
    showGroupMenu();
  }
}

// Demote admins to regular participants in the current group
async function demoteParticipants(): Promise<void> {
  try {
    // Get current participants
    const participants = await client.group.getParticipants(currentGroupId!);
    
    // Filter for admins only
    const adminParticipants = participants.filter(p => p.isAdmin);
    
    if (adminParticipants.length === 0) {
      console.log('No admin participants to demote.');
      showGroupMenu();
      return;
    }
    
    console.log('\nAdmin Participants:');
    adminParticipants.forEach((participant, index) => {
      console.log(`${index + 1}. ${participant.id}`);
    });
    
    let selectionsInput = await prompt('\nEnter the numbers of admins to demote (comma separated): ');
    
    // Parse selections
    const selections = selectionsInput.split(',')
      .map(s => parseInt(s.trim()))
      .filter(s => !isNaN(s) && s >= 1 && s <= adminParticipants.length);
    
    if (selections.length === 0) {
      console.log('No valid selections.');
      showGroupMenu();
      return;
    }
    
    // Get participant IDs from selections
    const participantsToDemote = selections.map(s => adminParticipants[s - 1].id);
    
    console.log('Demoting admins...');
    const results = await client.group.demoteParticipants(currentGroupId!, participantsToDemote);
    
    // Report on each participant
    for (const [id, result] of Object.entries(results)) {
      if (result === true) {
        console.log(`Demoted ${id} successfully.`);
      } else {
        console.log(`Failed to demote ${id}: ${result}`);
      }
    }
    
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to demote participants:', error);
    showGroupMenu();
  }
}

// Change the name of the current group
async function changeGroupName(): Promise<void> {
  try {
    const newName = await prompt('Enter the new group name: ');
    
    if (!newName) {
      console.log('Group name cannot be empty.');
      showGroupMenu();
      return;
    }
    
    console.log('Changing group name...');
    await client.group.changeSubject(currentGroupId!, newName);
    
    console.log(`Group name changed to "${newName}" successfully.`);
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to change group name:', error);
    showGroupMenu();
  }
}

// Change the description of the current group
async function changeGroupDescription(): Promise<void> {
  try {
    const newDescription = await prompt('Enter the new group description: ');
    
    console.log('Changing group description...');
    await client.group.changeDescription(currentGroupId!, newDescription);
    
    console.log('Group description changed successfully.');
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to change group description:', error);
    showGroupMenu();
  }
}

// Get the invite link for the current group
async function getInviteLink(): Promise<void> {
  try {
    console.log('Getting invite link...');
    const inviteLink = await client.group.getInviteLink(currentGroupId!);
    
    console.log(`Group invite link: ${inviteLink}`);
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to get invite link:', error);
    showGroupMenu();
  }
}

// Revoke and regenerate the invite link for the current group
async function revokeInviteLink(): Promise<void> {
  try {
    console.log('Revoking and regenerating invite link...');
    const newInviteLink = await client.group.revokeInviteLink(currentGroupId!);
    
    console.log(`New group invite link: ${newInviteLink}`);
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to revoke invite link:', error);
    showGroupMenu();
  }
}

// Change the settings for the current group
async function changeGroupSettings(): Promise<void> {
  try {
    console.log('\nGroup Settings:');
    console.log('1. Only admins can send messages');
    console.log('2. All members can send messages');
    console.log('3. Only admins can edit group info');
    console.log('4. All members can edit group info');
    
    const choice = await prompt('\nSelect a setting to change (1-4): ');
    
    switch (choice) {
      case '1':
        await client.group.setSettings(currentGroupId!, { onlyAdminsMessage: true });
        console.log('Now only admins can send messages.');
        break;
      case '2':
        await client.group.setSettings(currentGroupId!, { onlyAdminsMessage: false });
        console.log('Now all members can send messages.');
        break;
      case '3':
        await client.group.setSettings(currentGroupId!, { onlyAdminsEdit: true });
        console.log('Now only admins can edit group info.');
        break;
      case '4':
        await client.group.setSettings(currentGroupId!, { onlyAdminsEdit: false });
        console.log('Now all members can edit group info.');
        break;
      default:
        console.log('Invalid choice.');
        break;
    }
    
    showGroupMenu();
    
  } catch (error) {
    console.error('Failed to change group settings:', error);
    showGroupMenu();
  }
}

// Leave the current group
async function leaveGroup(): Promise<void> {
  try {
    const confirmation = await prompt('Are you sure you want to leave this group? (yes/no): ');
    
    if (confirmation.toLowerCase() !== 'yes') {
      console.log('Leave group cancelled.');
      showGroupMenu();
      return;
    }
    
    console.log('Leaving group...');
    await client.group.leave(currentGroupId!);
    
    console.log('Left the group successfully.');
    currentGroupId = null;
    showMainMenu();
    
  } catch (error) {
    console.error('Failed to leave group:', error);
    showGroupMenu();
  }
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
