/**
 * WhatsLynx Learning Bot
 * 
 * Acest exemplu demonstrează un bot de învățare interactiv care poate ghida utilizatorii
 * prin traseul de învățare gamificat WhatsLynx. Botul oferă tutoriale, exerciții și 
 * urmărește progresul utilizatorilor.
 */

import { WhatsLynxClient } from '../src';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';

// Tipuri pentru sistemul de gamificare
interface UserProgress {
  userId: string;
  level: number;
  completedMissions: string[];
  badges: string[];
  experience: number;
  lastActivity: Date;
}

interface LearningModule {
  id: string;
  title: string;
  description: string;
  level: number;
  experience: number;
  exercises: Exercise[];
}

interface Exercise {
  id: string;
  title: string;
  description: string;
  difficulty: number; // 1-5
  hints: string[];
  solutionTemplate?: string;
}

// Clasa principală pentru botul de învățare
class WhatsLynxLearningBot {
  private client: WhatsLynxClient;
  private dataPath: string;
  private users: Map<string, UserProgress>;
  private modules: LearningModule[];
  private helpCommands: Map<string, string>;
  private isConnected: boolean = false;

  constructor() {
    // Inițializează clientul WhatsLynx
    this.client = new WhatsLynxClient({
      deviceName: 'WhatsLynx Learning Bot',
      browserName: 'Chrome',
      autoReconnect: true
    });

    // Configurează path-ul pentru date
    this.dataPath = path.join(__dirname, '../data');
    this.ensureDataDirectory();

    // Încarcă datele utilizatorilor
    this.users = this.loadUserProgress();

    // Încarcă modulele de învățare
    this.modules = this.loadLearningModules();

    // Configurează comenzile de ajutor
    this.helpCommands = new Map([
      ['help', 'Afișează acest mesaj de ajutor'],
      ['start', 'Începe călătoria de învățare sau continuă de unde ai rămas'],
      ['level', 'Afișează nivelul tău actual și progresul'],
      ['badges', 'Afișează insignele pe care le-ai obținut'],
      ['module <id>', 'Afișează detalii despre un modul specific'],
      ['exercise <id>', 'Începe un exercițiu specific'],
      ['hint', 'Obține un indiciu pentru exercițiul curent'],
      ['solution', 'Afișează șablonul de soluție pentru exercițiul curent'],
      ['submit', 'Marchează exercițiul curent ca finalizat'],
      ['next', 'Treci la următorul exercițiu recomandat'],
      ['reset', 'Resetează-ți progresul (nu poate fi anulat)']
    ]);

    // Configurează gestionarii de evenimente
    this.setupEventListeners();
  }

  // Inițializează directorul de date dacă nu există
  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  // Încarcă progresul utilizatorilor din fișier
  private loadUserProgress(): Map<string, UserProgress> {
    const usersPath = path.join(this.dataPath, 'users.json');
    if (fs.existsSync(usersPath)) {
      const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
      return new Map(Object.entries(usersData));
    }
    return new Map();
  }

  // Salvează progresul utilizatorilor în fișier
  private saveUserProgress(): void {
    const usersPath = path.join(this.dataPath, 'users.json');
    const usersData = Object.fromEntries(this.users);
    fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
  }

  // Încarcă modulele de învățare din fișier sau utilizează setul implicit
  private loadLearningModules(): LearningModule[] {
    const modulesPath = path.join(this.dataPath, 'modules.json');
    if (fs.existsSync(modulesPath)) {
      return JSON.parse(fs.readFileSync(modulesPath, 'utf-8'));
    }
    // Returnează un set minim de module predefinite ca exemplu
    return [
      {
        id: 'basics',
        title: 'Bazele WhatsLynx',
        description: 'Învață cum să te conectezi la WhatsApp și să trimiți mesaje simple',
        level: 1,
        experience: 100,
        exercises: [
          {
            id: 'connect',
            title: 'Prima Conexiune',
            description: 'Creează un script simplu care se conectează la WhatsApp API',
            difficulty: 1,
            hints: [
              'Utilizează metoda connect() a clientului',
              'Nu uita să gestionezi evenimentul auth.qr'
            ]
          },
          {
            id: 'send-message',
            title: 'Trimite Primul Mesaj',
            description: 'Trimite un mesaj text către un număr specificat',
            difficulty: 2,
            hints: [
              'Utilizează metoda client.message.sendText()',
              'Formatul numărului trebuie să fie: [country code][phone number]@c.us'
            ]
          }
        ]
      },
      {
        id: 'messaging',
        title: 'Gestionarea Mesajelor',
        description: 'Învață cum să trimiți și să primești diferite tipuri de mesaje',
        level: 2,
        experience: 200,
        exercises: [
          {
            id: 'echo-bot',
            title: 'Echo Bot',
            description: 'Creează un bot care repetă mesajele primite',
            difficulty: 2,
            hints: [
              'Ascultă evenimentul message.received',
              'Utilizează message.chatId pentru a răspunde în același chat'
            ],
            solutionTemplate: `client.on('message.received', async (message) => {
  if (!message.fromMe) {
    await client.message.sendText(message.chatId, \`Echo: \${message.content}\`);
  }
});`
          }
        ]
      }
    ];
  }

  // Configurează ascultătorii de evenimente pentru client
  private setupEventListeners(): void {
    // Gestionează afișarea codului QR
    this.client.on('auth.qr', (qr) => {
      console.log('Scanează acest cod QR cu WhatsApp:');
      qrcode.generate(qr.qrCode, { small: true });
    });

    // Gestionează autentificarea reușită
    this.client.on('auth.authenticated', () => {
      console.log('Autentificat cu succes!');
    });

    // Gestionează conectarea reușită
    this.client.on('connection.open', () => {
      console.log('Conectat la WhatsApp!');
      this.isConnected = true;
    });

    // Gestionează deconectarea
    this.client.on('connection.closed', (reason) => {
      console.log(`Deconectat de la WhatsApp: ${reason}`);
      this.isConnected = false;
    });

    // Gestionează mesajele primite
    this.client.on('message.received', (message) => {
      if (!message.fromMe) {
        this.handleIncomingMessage(message);
      }
    });
  }

  // Gestionează mesajele primite și determină acțiunea corespunzătoare
  private async handleIncomingMessage(message: any): Promise<void> {
    const userId = message.sender;
    const chatId = message.chatId;
    const content = message.content;

    // Actualizează sau creează progresul utilizatorului
    this.updateUserActivity(userId);

    // Verifică dacă mesajul este o comandă
    if (typeof content === 'string' && content.startsWith('!')) {
      const commandParts = content.slice(1).trim().split(' ');
      const command = commandParts[0].toLowerCase();
      const args = commandParts.slice(1);

      switch (command) {
        case 'help':
          await this.sendHelpMessage(chatId);
          break;
        case 'start':
          await this.startLearningJourney(chatId, userId);
          break;
        case 'level':
          await this.sendLevelInfo(chatId, userId);
          break;
        case 'badges':
          await this.sendBadgesInfo(chatId, userId);
          break;
        case 'module':
          if (args.length > 0) {
            await this.sendModuleInfo(chatId, args[0]);
          } else {
            await this.client.message.sendText(chatId, 'Te rugăm să specifici ID-ul modulului. Exemplu: !module basics');
          }
          break;
        case 'exercise':
          if (args.length > 0) {
            await this.startExercise(chatId, userId, args[0]);
          } else {
            await this.client.message.sendText(chatId, 'Te rugăm să specifici ID-ul exercițiului. Exemplu: !exercise connect');
          }
          break;
        case 'hint':
          await this.sendExerciseHint(chatId, userId);
          break;
        case 'solution':
          await this.sendSolutionTemplate(chatId, userId);
          break;
        case 'submit':
          await this.completeCurrentExercise(chatId, userId);
          break;
        case 'next':
          await this.moveToNextExercise(chatId, userId);
          break;
        case 'reset':
          await this.resetUserProgress(chatId, userId);
          break;
        default:
          await this.client.message.sendText(chatId, `Comandă necunoscută: ${command}. Folosește !help pentru a vedea comenzile disponibile.`);
      }
    } else {
      // Poți adăuga logică suplimentară aici pentru mesaje non-comandă
    }
  }

  // Actualizează sau creează progresul utilizatorului
  private updateUserActivity(userId: string): void {
    if (!this.users.has(userId)) {
      // Creează un nou profil pentru utilizator
      this.users.set(userId, {
        userId,
        level: 1,
        completedMissions: [],
        badges: [],
        experience: 0,
        lastActivity: new Date()
      });
    } else {
      // Actualizează timestamp-ul ultimei activități
      const userProgress = this.users.get(userId)!;
      userProgress.lastActivity = new Date();
      this.users.set(userId, userProgress);
    }

    // Salvează progresul
    this.saveUserProgress();
  }

  // Trimite mesajul de ajutor cu lista de comenzi
  private async sendHelpMessage(chatId: string): Promise<void> {
    let helpText = '*WhatsLynx Learning Bot - Comenzi Disponibile*\n\n';
    
    for (const [command, description] of this.helpCommands) {
      helpText += `!${command} - ${description}\n`;
    }
    
    helpText += '\nFolosește aceste comenzi pentru a interacționa cu botul și a-ți urmări progresul în călătoria de învățare.';
    
    await this.client.message.sendText(chatId, helpText);
  }

  // Inițiază sau continuă călătoria de învățare
  private async startLearningJourney(chatId: string, userId: string): Promise<void> {
    const userProgress = this.users.get(userId)!;
    const isNewUser = userProgress.completedMissions.length === 0;
    
    if (isNewUser) {
      // Mesaj de bun venit pentru utilizatorii noi
      await this.client.message.sendText(chatId, 
        '*Bine ai venit la WhatsLynx Learning Bot!* 🚀\n\n' +
        'Sunt aici pentru a te ghida prin călătoria de învățare a WhatsLynx API. ' +
        'Vei învăța cum să creezi boți, să gestionezi mesaje, media și grupuri, ' +
        'și să integrezi WhatsApp cu alte servicii.\n\n' +
        'Hai să începem cu bazele! Primul tău modul este *Bazele WhatsLynx*.\n\n' +
        'Folosește !module basics pentru a vedea detalii despre acest modul sau !exercise connect pentru a începe primul exercițiu.'
      );
      
      // Acordă prima insignă de "Explorator"
      if (!userProgress.badges.includes('explorer')) {
        userProgress.badges.push('explorer');
        await this.client.message.sendText(chatId, '🎉 *Felicitări!* Ai primit insigna *Explorator* pentru că ai început călătoria de învățare!');
        this.users.set(userId, userProgress);
        this.saveUserProgress();
      }
    } else {
      // Mesaj de continuare pentru utilizatorii existenți
      const nextModuleId = this.getNextRecommendedModule(userProgress);
      const nextModule = this.modules.find(m => m.id === nextModuleId);
      
      await this.client.message.sendText(chatId,
        `*Bine ai revenit la călătoria ta de învățare WhatsLynx!* 🚀\n\n` +
        `Nivelul tău actual: *${userProgress.level}*\n` +
        `Experiență: *${userProgress.experience} XP*\n` +
        `Misiuni completate: *${userProgress.completedMissions.length}*\n` +
        `Insigne obținute: *${userProgress.badges.length}*\n\n` +
        (nextModule ? 
          `Următorul tău modul recomandat este: *${nextModule.title}*\n` +
          `Folosește !module ${nextModuleId} pentru a vedea detalii sau !next pentru a continua de unde ai rămas.` :
          `Se pare că ai finalizat toate modulele disponibile! Felicitări, Maestru WhatsLynx!`)
      );
    }
  }

  // Trimite informații despre nivelul curent și progresul utilizatorului
  private async sendLevelInfo(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      await this.client.message.sendText(chatId, 'Nu am găsit niciun progres pentru tine. Folosește !start pentru a începe călătoria de învățare.');
      return;
    }

    const progress = this.users.get(userId)!;
    const nextLevelXP = this.calculateXPForNextLevel(progress.level);
    const xpNeeded = nextLevelXP - progress.experience;
    
    // Calculează procentul către următorul nivel
    const progressPercent = Math.min(Math.floor((progress.experience / nextLevelXP) * 100), 100);
    
    // Creează o bară de progres vizuală
    const progressBarLength = 20;
    const filledLength = Math.floor((progressPercent / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
    
    await this.client.message.sendText(chatId,
      `*Progresul tău de învățare WhatsLynx*\n\n` +
      `📊 *Nivel:* ${progress.level}\n` +
      `⭐ *Experiență:* ${progress.experience}/${nextLevelXP} XP\n` +
      `📈 *Progres către nivelul ${progress.level + 1}:* ${progressPercent}%\n` +
      `${progressBar}\n\n` +
      `🏆 *Misiuni completate:* ${progress.completedMissions.length}\n` +
      `🥇 *Insigne obținute:* ${progress.badges.length}\n\n` +
      `Mai ai nevoie de ${xpNeeded} XP pentru a avansa la nivelul ${progress.level + 1}.\n` +
      `Continuă să completezi exerciții pentru a câștiga XP și a avansa!`
    );
  }

  // Trimite informații despre insignele obținute
  private async sendBadgesInfo(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      await this.client.message.sendText(chatId, 'Nu am găsit niciun progres pentru tine. Folosește !start pentru a începe călătoria de învățare.');
      return;
    }

    const progress = this.users.get(userId)!;
    
    if (progress.badges.length === 0) {
      await this.client.message.sendText(chatId,
        '*Colecția ta de insigne*\n\n' +
        'Nu ai obținut încă nicio insignă. Completează exerciții și misiuni pentru a debloca insigne!\n\n' +
        'Prima insignă "Explorator" se deblochează când începi călătoria de învățare cu comanda !start.'
      );
      return;
    }
    
    // Maparea insignelor la descrieri și emoji-uri
    const badgeDescriptions: Record<string, { name: string, emoji: string, description: string }> = {
      'explorer': { 
        name: 'Explorator', 
        emoji: '🧭', 
        description: 'Ai început călătoria de învățare WhatsLynx' 
      },
      'first_connection': { 
        name: 'Prima Conexiune', 
        emoji: '📱', 
        description: 'Te-ai conectat cu succes la WhatsApp API' 
      },
      'message_master': { 
        name: 'Mesager Priceput', 
        emoji: '✉️', 
        description: 'Ai stăpânit trimiterea și primirea de mesaje' 
      },
      'media_maestro': { 
        name: 'Media Maestro', 
        emoji: '🎬', 
        description: 'Ai demonstrat abilități în gestionarea conținutului media' 
      },
      'group_master': { 
        name: 'Maestru al Grupurilor', 
        emoji: '👑', 
        description: 'Ai stăpânit administrarea grupurilor WhatsApp' 
      },
      'integrator': { 
        name: 'Integrator Suprem', 
        emoji: '🔌', 
        description: 'Ai conectat WhatsApp cu alte servicii externe' 
      },
      'whatslynx_master': { 
        name: 'WhatsLynx Master', 
        emoji: '🎓', 
        description: 'Ai demonstrat stăpânirea completă a WhatsLynx API' 
      }
    };
    
    let badgesText = '*Colecția ta de insigne*\n\n';
    
    for (const badgeId of progress.badges) {
      const badge = badgeDescriptions[badgeId] || { 
        name: badgeId, 
        emoji: '🔶', 
        description: 'O insignă specială' 
      };
      
      badgesText += `${badge.emoji} *${badge.name}*\n${badge.description}\n\n`;
    }
    
    badgesText += 'Continuă să completezi exerciții pentru a debloca mai multe insigne!';
    
    await this.client.message.sendText(chatId, badgesText);
  }

  // Trimite informații despre un modul specific
  private async sendModuleInfo(chatId: string, moduleId: string): Promise<void> {
    const module = this.modules.find(m => m.id === moduleId);
    
    if (!module) {
      await this.client.message.sendText(chatId, `Nu am găsit niciun modul cu ID-ul "${moduleId}". Folosește !help pentru a vedea comenzile disponibile.`);
      return;
    }
    
    let moduleText = `*${module.title}* (Nivel ${module.level})\n\n`;
    moduleText += `${module.description}\n\n`;
    moduleText += `*Experiență oferită:* ${module.experience} XP\n\n`;
    moduleText += '*Exerciții în acest modul:*\n';
    
    for (const exercise of module.exercises) {
      const difficultyStars = '⭐'.repeat(exercise.difficulty);
      moduleText += `\n- *${exercise.title}* (${difficultyStars})\n  ID: ${exercise.id}\n  ${exercise.description}\n`;
    }
    
    moduleText += '\nPentru a începe un exercițiu, folosește comanda !exercise urmat de ID-ul exercițiului.';
    
    await this.client.message.sendText(chatId, moduleText);
  }

  // Începe un exercițiu specific
  private async startExercise(chatId: string, userId: string, exerciseId: string): Promise<void> {
    // Găsește exercițiul în toate modulele
    let targetExercise: Exercise | undefined;
    let parentModule: LearningModule | undefined;
    
    for (const module of this.modules) {
      const exercise = module.exercises.find(e => e.id === exerciseId);
      if (exercise) {
        targetExercise = exercise;
        parentModule = module;
        break;
      }
    }
    
    if (!targetExercise || !parentModule) {
      await this.client.message.sendText(chatId, `Nu am găsit niciun exercițiu cu ID-ul "${exerciseId}". Folosește !module [id] pentru a vedea exercițiile disponibile în fiecare modul.`);
      return;
    }
    
    // Actualizează exercițiul curent al utilizatorului
    const userProgress = this.users.get(userId)!;
    userProgress.currentExercise = {
      moduleId: parentModule.id,
      exerciseId: targetExercise.id
    };
    this.users.set(userId, userProgress);
    this.saveUserProgress();
    
    // Construiește și trimite descrierea exercițiului
    const difficultyStars = '⭐'.repeat(targetExercise.difficulty);
    let exerciseText = `*Exercițiu: ${targetExercise.title}* (${difficultyStars})\n\n`;
    exerciseText += `${targetExercise.description}\n\n`;
    exerciseText += `*Modul:* ${parentModule.title}\n`;
    exerciseText += `*Dificultate:* ${targetExercise.difficulty}/5\n\n`;
    
    exerciseText += 'Comenzi disponibile:\n';
    exerciseText += '- !hint - Obține un indiciu pentru acest exercițiu\n';
    exerciseText += '- !solution - Vezi un șablon de soluție (dacă este disponibil)\n';
    exerciseText += '- !submit - Marchează exercițiul ca fiind completat\n';
    
    await this.client.message.sendText(chatId, exerciseText);
  }

  // Trimite un indiciu pentru exercițiul curent
  private async sendExerciseHint(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId) || !this.users.get(userId)!.currentExercise) {
      await this.client.message.sendText(chatId, 'Nu ai niciun exercițiu activ. Folosește !exercise [id] pentru a începe un exercițiu.');
      return;
    }
    
    const userProgress = this.users.get(userId)!;
    const { moduleId, exerciseId } = userProgress.currentExercise;
    
    // Găsește exercițiul
    const module = this.modules.find(m => m.id === moduleId);
    if (!module) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Modulul nu a fost găsit.');
      return;
    }
    
    const exercise = module.exercises.find(e => e.id === exerciseId);
    if (!exercise) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Exercițiul nu a fost găsit.');
      return;
    }
    
    // Selectează un indiciu aleator sau urmează secvența
    const hintIndex = userProgress.hintsUsed?.[exerciseId] || 0;
    
    if (hintIndex >= exercise.hints.length) {
      await this.client.message.sendText(chatId, 'Ai folosit deja toate indiciile disponibile pentru acest exercițiu.');
      return;
    }
    
    const hint = exercise.hints[hintIndex];
    
    // Actualizează numărul de indicii utilizate
    if (!userProgress.hintsUsed) userProgress.hintsUsed = {};
    userProgress.hintsUsed[exerciseId] = hintIndex + 1;
    this.users.set(userId, userProgress);
    this.saveUserProgress();
    
    await this.client.message.sendText(chatId, `*Indiciu (${hintIndex + 1}/${exercise.hints.length}):*\n\n${hint}`);
  }

  // Trimite șablonul de soluție pentru exercițiul curent
  private async sendSolutionTemplate(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId) || !this.users.get(userId)!.currentExercise) {
      await this.client.message.sendText(chatId, 'Nu ai niciun exercițiu activ. Folosește !exercise [id] pentru a începe un exercițiu.');
      return;
    }
    
    const userProgress = this.users.get(userId)!;
    const { moduleId, exerciseId } = userProgress.currentExercise;
    
    // Găsește exercițiul
    const module = this.modules.find(m => m.id === moduleId);
    if (!module) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Modulul nu a fost găsit.');
      return;
    }
    
    const exercise = module.exercises.find(e => e.id === exerciseId);
    if (!exercise) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Exercițiul nu a fost găsit.');
      return;
    }
    
    if (!exercise.solutionTemplate) {
      await this.client.message.sendText(chatId, 'Nu există un șablon de soluție disponibil pentru acest exercițiu.');
      return;
    }
    
    await this.client.message.sendText(chatId, 
      `*Șablon de Soluție pentru ${exercise.title}*\n\n` +
      `\`\`\`typescript\n${exercise.solutionTemplate}\n\`\`\`\n\n` +
      `Aceasta este doar o sugestie. Poți adapta și extinde codul după cum este necesar.\n` +
      `Folosește !submit după ce ai implementat soluția.`
    );
  }

  // Marchează exercițiul curent ca fiind completat
  private async completeCurrentExercise(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId) || !this.users.get(userId)!.currentExercise) {
      await this.client.message.sendText(chatId, 'Nu ai niciun exercițiu activ. Folosește !exercise [id] pentru a începe un exercițiu.');
      return;
    }
    
    const userProgress = this.users.get(userId)!;
    const { moduleId, exerciseId } = userProgress.currentExercise;
    
    // Găsește exercițiul și modulul
    const module = this.modules.find(m => m.id === moduleId);
    if (!module) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Modulul nu a fost găsit.');
      return;
    }
    
    const exercise = module.exercises.find(e => e.id === exerciseId);
    if (!exercise) {
      await this.client.message.sendText(chatId, 'A apărut o eroare. Exercițiul nu a fost găsit.');
      return;
    }
    
    // Verifică dacă exercițiul a fost deja completat
    const missionId = `${moduleId}:${exerciseId}`;
    if (userProgress.completedMissions.includes(missionId)) {
      await this.client.message.sendText(chatId, 'Ai completat deja acest exercițiu!');
      return;
    }
    
    // Adaugă exercițiul la lista de misiuni completate
    userProgress.completedMissions.push(missionId);
    
    // Calculează experiența de bază pentru acest exercițiu
    const baseXP = 50 * exercise.difficulty;
    
    // Aplică bonus/penalizare în funcție de indiciile utilizate
    const hintsUsed = userProgress.hintsUsed?.[exerciseId] || 0;
    const hintPenalty = hintsUsed * 10; // -10 XP pentru fiecare indiciu utilizat
    
    const earnedXP = Math.max(baseXP - hintPenalty, 10); // Minimum 10 XP
    userProgress.experience += earnedXP;
    
    // Verifică dacă utilizatorul avansează la următorul nivel
    const oldLevel = userProgress.level;
    while (userProgress.experience >= this.calculateXPForNextLevel(userProgress.level)) {
      userProgress.level++;
      
      // Acordă insigne bazate pe nivel
      if (userProgress.level === 2 && !userProgress.badges.includes('message_master')) {
        userProgress.badges.push('message_master');
      } else if (userProgress.level === 3 && !userProgress.badges.includes('media_maestro')) {
        userProgress.badges.push('media_maestro');
      } else if (userProgress.level === 4 && !userProgress.badges.includes('group_master')) {
        userProgress.badges.push('group_master');
      } else if (userProgress.level === 5 && !userProgress.badges.includes('integrator')) {
        userProgress.badges.push('integrator');
      } else if (userProgress.level === 6 && !userProgress.badges.includes('whatslynx_master')) {
        userProgress.badges.push('whatslynx_master');
      }
    }
    
    // Resetează exercițiul curent
    userProgress.currentExercise = undefined;
    
    // Salvează progresul actualizat
    this.users.set(userId, userProgress);
    this.saveUserProgress();
    
    // Construiește și trimite mesajul de completare
    let completionMessage = `🎉 *Felicitări!* Ai completat exercițiul "${exercise.title}"!\n\n`;
    completionMessage += `*Experiență câștigată:* +${earnedXP} XP\n`;
    
    if (oldLevel < userProgress.level) {
      completionMessage += `\n🌟 *NIVEL NOU!* Ai avansat la nivelul ${userProgress.level}!\n`;
      
      // Verifică dacă a fost deblocată o nouă insignă
      const newBadges = userProgress.badges.filter(b => 
        ['message_master', 'media_maestro', 'group_master', 'integrator', 'whatslynx_master'].includes(b) && 
        !userProgress.badges.includes(b)
      );
      
      if (newBadges.length > 0) {
        const badgeNames = newBadges.map(b => {
          switch (b) {
            case 'message_master': return 'Mesager Priceput';
            case 'media_maestro': return 'Media Maestro';
            case 'group_master': return 'Maestru al Grupurilor';
            case 'integrator': return 'Integrator Suprem';
            case 'whatslynx_master': return 'WhatsLynx Master';
            default: return b;
          }
        });
        
        completionMessage += `\n🏆 *INSIGNĂ NOUĂ!* Ai obținut insigna "${badgeNames.join(', ')}"!\n`;
      }
    }
    
    completionMessage += `\nFolosește !next pentru a trece la următorul exercițiu recomandat sau !module [id] pentru a explora alte module.`;
    
    await this.client.message.sendText(chatId, completionMessage);
  }

  // Trece la următorul exercițiu recomandat
  private async moveToNextExercise(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      await this.client.message.sendText(chatId, 'Nu am găsit niciun progres pentru tine. Folosește !start pentru a începe călătoria de învățare.');
      return;
    }
    
    const userProgress = this.users.get(userId)!;
    
    // Determină următorul exercițiu recomandat pe baza nivelului și progresului
    const nextExercise = this.getNextRecommendedExercise(userProgress);
    
    if (!nextExercise) {
      await this.client.message.sendText(chatId, 
        '*Felicitări!* 🎉\n\n' +
        'Se pare că ai completat toate exercițiile disponibile în traseul de învățare!\n\n' +
        'Continuă să explorezi WhatsLynx API și să-ți dezvolți propriile aplicații avansate. ' +
        'Vei fi anunțat când vor fi disponibile noi module și exerciții.'
      );
      return;
    }
    
    // Pornește următorul exercițiu
    await this.startExercise(chatId, userId, nextExercise.id);
  }

  // Resetează progresul utilizatorului
  private async resetUserProgress(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId)) {
      await this.client.message.sendText(chatId, 'Nu am găsit niciun progres pentru tine. Folosește !start pentru a începe călătoria de învățare.');
      return;
    }
    
    // Solicită confirmare
    await this.client.message.sendText(chatId, 
      '⚠️ *AVERTISMENT* ⚠️\n\n' +
      'Ești pe cale să îți resetezi complet progresul. Această acțiune:\n' +
      '- Va șterge toate misiunile completate\n' +
      '- Va reseta nivelul și experiența la 0\n' +
      '- Va elimina toate insignele obținute\n\n' +
      'Această acțiune *nu poate fi anulată*.\n\n' +
      'Pentru a confirma, răspunde cu "!reset confirm" în următoarele 30 de secunde.'
    );
    
    // Adaugă un flag temporar pentru resetare
    const userProgress = this.users.get(userId)!;
    userProgress.resetConfirmationPending = true;
    userProgress.resetRequestTime = Date.now();
    this.users.set(userId, userProgress);
    
    // Timeout pentru a șterge flag-ul de resetare după 30 de secunde
    setTimeout(() => {
      if (this.users.has(userId)) {
        const currentProgress = this.users.get(userId)!;
        if (currentProgress.resetConfirmationPending) {
          delete currentProgress.resetConfirmationPending;
          delete currentProgress.resetRequestTime;
          this.users.set(userId, currentProgress);
          this.saveUserProgress();
        }
      }
    }, 30000);
  }

  // Confirmă resetarea progresului utilizatorului
  private async confirmResetUserProgress(chatId: string, userId: string): Promise<void> {
    if (!this.users.has(userId) || !this.users.get(userId)!.resetConfirmationPending) {
      await this.client.message.sendText(chatId, 'Nu există nicio cerere de resetare activă. Folosește !reset pentru a iniția procesul de resetare.');
      return;
    }
    
    const userProgress = this.users.get(userId)!;
    
    // Verifică dacă cererea de resetare nu a expirat (30 de secunde)
    const now = Date.now();
    if (!userProgress.resetRequestTime || now - userProgress.resetRequestTime > 30000) {
      await this.client.message.sendText(chatId, 'Cererea de resetare a expirat. Folosește !reset pentru a iniția din nou procesul de resetare.');
      delete userProgress.resetConfirmationPending;
      delete userProgress.resetRequestTime;
      this.users.set(userId, userProgress);
      return;
    }
    
    // Resetează progresul utilizatorului
    this.users.set(userId, {
      userId,
      level: 1,
      completedMissions: [],
      badges: [],
      experience: 0,
      lastActivity: new Date()
    });
    
    this.saveUserProgress();
    
    await this.client.message.sendText(chatId, 
      '*Progres resetat cu succes*\n\n' +
      'Tot progresul tău a fost șters și poți începe din nou călătoria de învățare de la zero.\n\n' +
      'Folosește !start pentru a începe din nou călătoria de învățare WhatsLynx.'
    );
  }

  // Găsește următorul exercițiu recomandat pentru utilizator
  private getNextRecommendedExercise(userProgress: UserProgress): Exercise | undefined {
    // Sortează modulele după nivel
    const sortedModules = [...this.modules].sort((a, b) => a.level - b.level);
    
    for (const module of sortedModules) {
      // Verifică dacă nivelul modulului este potrivit pentru utilizator
      if (module.level <= userProgress.level) {
        for (const exercise of module.exercises) {
          const missionId = `${module.id}:${exercise.id}`;
          if (!userProgress.completedMissions.includes(missionId)) {
            return exercise;
          }
        }
      }
    }
    
    // Dacă utilizatorul a completat toate exercițiile pentru nivelul său, recomandă
    // un exercițiu din nivelul următor dacă există
    if (sortedModules.some(m => m.level === userProgress.level + 1)) {
      const nextLevelModule = sortedModules.find(m => m.level === userProgress.level + 1);
      if (nextLevelModule && nextLevelModule.exercises.length > 0) {
        return nextLevelModule.exercises[0];
      }
    }
    
    return undefined;
  }
  
  // Găsește următorul modul recomandat pentru utilizator
  private getNextRecommendedModule(userProgress: UserProgress): string {
    // Sortează modulele după nivel
    const sortedModules = [...this.modules].sort((a, b) => a.level - b.level);
    
    // Verifică dacă există module incomplete la nivelul curent al utilizatorului
    for (const module of sortedModules) {
      if (module.level === userProgress.level) {
        // Verifică dacă există exerciții incomplete în acest modul
        for (const exercise of module.exercises) {
          const missionId = `${module.id}:${exercise.id}`;
          if (!userProgress.completedMissions.includes(missionId)) {
            return module.id;
          }
        }
      }
    }
    
    // Dacă toate modulele de la nivelul curent sunt complete, recomandă
    // un modul din nivelul următor dacă există
    const nextLevelModule = sortedModules.find(m => m.level === userProgress.level + 1);
    if (nextLevelModule) {
      return nextLevelModule.id;
    }
    
    // Dacă nu există module de niveluri superioare, recomandă ultimul modul
    return sortedModules[sortedModules.length - 1]?.id || '';
  }

  // Calculează XP-ul necesar pentru nivelul următor
  private calculateXPForNextLevel(currentLevel: number): number {
    // Formulă simplă pentru XP-ul necesar: 100 * nivel^2
    return 100 * Math.pow(currentLevel, 2);
  }

  // Încarcă sesiunea din fișier
  private async loadSessionData(): Promise<any | null> {
    const sessionPath = path.join(this.dataPath, 'session.json');
    if (fs.existsSync(sessionPath)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        return sessionData;
      } catch (error) {
        console.error('Error loading session data:', error);
        return null;
      }
    }
    return null;
  }

  // Salvează sesiunea în fișier
  private async saveSessionData(data: any): Promise<void> {
    const sessionPath = path.join(this.dataPath, 'session.json');
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving session data:', error);
    }
  }

  // Pornește botul
  public async start(): Promise<void> {
    console.log('Pornire WhatsLynx Learning Bot...');
    
    // Încarcă datele sesiunii
    const sessionData = await this.loadSessionData();
    
    // Configurează gestionarul pentru salvarea sesiunii
    this.client.on('auth.authenticated', async (data) => {
      await this.saveSessionData(data);
    });
    
    // Conectează-te la WhatsApp
    try {
      await this.client.connect(sessionData);
      await this.client.auth.startAuthentication();
    } catch (error) {
      console.error('Error starting WhatsLynx Learning Bot:', error);
    }
  }
}

// Inițiază botul
const learningBot = new WhatsLynxLearningBot();
learningBot.start().catch(console.error);