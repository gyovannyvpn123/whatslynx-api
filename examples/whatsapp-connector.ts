/**
 * Exemplu de conectare și autentificare la WhatsApp folosind WhatsLynx API
 * 
 * Acest exemplu demonstrează cum să utilizați noul client WhatsLynx pentru a vă conecta
 * la serverele WhatsApp Web, autentificați-vă cu un cod QR și mențineți conexiunea.
 */

import { WhatsLynxClient } from '../src/client-fixed4';
import * as fs from 'fs';
import * as path from 'path';

// Configurarea clientului
const client = new WhatsLynxClient({
  // Opțiuni personalizate
  deviceName: 'WhatsLynx Demo',
  browserName: 'Chrome',
  autoReconnect: true,
  maxReconnectAttempts: 5,
  printQRInTerminal: true,
  // Logger personalizat
  logger: (level, message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
  }
});

// Funcție pentru încărcarea datelor de sesiune
async function loadSessionData(): Promise<any | null> {
  const sessionPath = path.join(__dirname, 'session.json');
  
  if (fs.existsSync(sessionPath)) {
    try {
      const data = fs.readFileSync(sessionPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading session data:', error);
    }
  }
  
  return null;
}

// Funcție pentru salvarea datelor de sesiune
async function saveSessionData(data: any): Promise<void> {
  const sessionPath = path.join(__dirname, 'session.json');
  
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
    console.log('Session data saved successfully');
  } catch (error) {
    console.error('Error saving session data:', error);
  }
}

// Configurarea ascultătorilor de evenimente
function setupEventListeners() {
  // Eveniment când se primește un cod QR pentru scanare
  client.on('auth.qr', (qr) => {
    console.log(`QR Code recebut (${qr.attempt}/${qr.maxAttempts}). Scanați-l cu aplicația WhatsApp.`);
    // QR-ul va fi afișat automat în terminal datorită opțiunii printQRInTerminal
  });

  // Eveniment când autentificarea a reușit
  client.on('auth.authenticated', async (sessionData) => {
    console.log('Autentificat cu succes la WhatsApp!');
    
    // Salvați datele de sesiune pentru reconectare ulterioară
    await saveSessionData(sessionData);
    
    // Vedeți informațiile profilului conectat
    console.log('Informații cont:');
    console.log(`- Nume: ${sessionData.pushname || 'Nedisponibil'}`);
    console.log(`- Număr telefon: ${sessionData.me?.user || 'Nedisponibil'}`);
    console.log(`- ID platforma: ${sessionData.platform || 'Nedisponibil'}`);
  });

  // Eveniment pentru modificarea stării conexiunii
  client.on('connection.state', (states) => {
    console.log(`Stare conexiune schimbată: ${states.old} -> ${states.new}`);
  });

  // Eveniment când conexiunea s-a deschis
  client.on('connection.open', () => {
    console.log('Conexiune deschisă la serverul WhatsApp Web');
  });

  // Eveniment când conexiunea s-a închis
  client.on('connection.closed', (reason) => {
    console.log(`Conexiune închisă: ${reason}`);
  });

  // Eveniment pentru erori de conexiune
  client.on('connection.error', (error) => {
    console.error('Eroare de conexiune:', error);
  });

  // Eveniment pentru mesaje primite
  client.on('message.received', (message) => {
    console.log('Mesaj primit:', message);
  });
}

// Funcție pentru afișarea comenzilor disponibile
function showHelp() {
  console.log('\nComenzi disponibile:');
  console.log('help     - Afișează acest mesaj de ajutor');
  console.log('status   - Afișează starea conexiunii');
  console.log('logout   - Deconectare de la WhatsApp');
  console.log('exit     - Ieșire din aplicație');
  console.log(''); 
}

// Funcție pentru gestionarea comenzilor din consolă
function setupCLI() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.setPrompt('WhatsLynx> ');
  rl.prompt();

  rl.on('line', async (line: string) => {
    const command = line.trim().toLowerCase();
    
    switch (command) {
      case 'help':
        showHelp();
        break;
      
      case 'status':
        const state = client.getConnectionState();
        const isConnected = client.isConnected();
        const isAuthenticated = client.auth.isAuthenticated();
        
        console.log('\nStare conexiune:');
        console.log(`- Stare: ${state}`);
        console.log(`- Conectat: ${isConnected ? 'Da' : 'Nu'}`);
        console.log(`- Autentificat: ${isAuthenticated ? 'Da' : 'Nu'}`);
        
        if (!isConnected) {
          const reason = client.getLastDisconnectReason();
          console.log(`- Motivul deconectării: ${reason || 'Necunoscut'}`);
        }
        break;
      
      case 'logout':
        if (client.isConnected() && client.auth.isAuthenticated()) {
          try {
            await client.logout();
            console.log('Delogat cu succes de la WhatsApp');
          } catch (error) {
            console.error('Eroare la delogare:', error);
          }
        } else {
          console.log('Nu sunteți conectat sau autentificat');
        }
        break;
      
      case 'exit':
        console.log('Se închide conexiunea...');
        await client.disconnect('user_exit');
        process.exit(0);
        break;
      
      default:
        if (command) {
          console.log(`Comandă necunoscută: ${command}`);
          console.log('Folosiți "help" pentru a vedea comenzile disponibile');
        }
        break;
    }
    
    rl.prompt();
  });

  rl.on('close', async () => {
    console.log('Se închide conexiunea...');
    await client.disconnect('user_exit');
    process.exit(0);
  });
}

// Funcție pentru pornirea clientului
async function start() {
  console.log('Pornire WhatsLynx API...');
  
  // Configurează ascultătorii de evenimente
  setupEventListeners();
  
  try {
    // Încarcă datele de sesiune existente, dacă există
    const sessionData = await loadSessionData();
    
    // Conectare la WhatsApp Web
    await client.connect(sessionData);
    
    console.log('Conectat la serverul WhatsApp Web');
    
    // Inițiază autentificarea dacă nu avem date de sesiune
    if (!sessionData) {
      console.log('Generare cod QR pentru autentificare...');
      await client.auth.startAuthentication();
    }
    
    // Configurează interfața de linie de comandă
    setupCLI();
    showHelp();
    
  } catch (error) {
    console.error('Eroare la pornirea clientului:', error);
  }
}

// Pornire aplicație
start().catch(console.error);