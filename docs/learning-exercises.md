# Exerciții Practice pentru Traseul de Învățare WhatsLynx

Acest document conține exerciții practice pentru fiecare nivel din traseul de învățare gamificat. Aceste exerciții sunt concepute pentru a vă ajuta să aplicați cunoștințele dobândite și să progresați în stăpânirea WhatsLynx API.

## Nivel 1: Exerciții pentru Novice

### Exercițiul 1.1: Configurarea și Testarea Conexiunii
**Dificultate**: ⭐☆☆☆☆
**Obiectiv**: Instalează WhatsLynx API și testează o conexiune de bază.

**Pași**:
1. Instalează WhatsLynx API folosind npm: `npm install whatslynx qrcode-terminal`
2. Creează un fișier `connection-test.ts` care importă biblioteca și inițializează un client
3. Adaugă gestionarea evenimentelor pentru `auth.qr` și `connection.open`
4. Rulează script-ul și verifică dacă se generează codul QR

**Indicii**:
- Asigură-te că ai instalat Node.js și TypeScript
- Verifică documentația pentru evenimentele disponibile

### Exercițiul 1.2: Persistența Sesiunii
**Dificultate**: ⭐⭐☆☆☆
**Obiectiv**: Implementează salvarea și restaurarea sesiunii pentru a evita autentificarea repetată.

**Pași**:
1. Extinde exemplul anterior pentru a salva datele sesiunii într-un fișier
2. Adaugă cod pentru a încărca sesiunea existentă la pornire
3. Testează deconectarea și reconectarea fără a necesita scanarea unui nou cod QR

**Cod Schelet**:
```typescript
import { WhatsLynxClient } from 'whatslynx';
import qrcode from 'qrcode-terminal';
import fs from 'fs';

// Funcție pentru încărcarea datelor sesiunii
async function loadSession(): Promise<any | null> {
  // Implementează încărcarea din fișier
  // ...
}

// Funcție pentru salvarea datelor sesiunii
async function saveSession(data: any): Promise<void> {
  // Implementează salvarea în fișier
  // ...
}

// Creează clientul
const client = new WhatsLynxClient({
  // ...opțiuni
});

// Adaugă ascultători pentru evenimente
client.on('auth.qr', (qr) => {
  // Afișează codul QR
});

client.on('auth.authenticated', () => {
  // Salvează datele sesiunii
});

// Pornește conexiunea
async function start() {
  const sessionData = await loadSession();
  
  // Încearcă să te conectezi cu datele sesiunii existente sau pornește o nouă sesiune
  // ...
}

start();
```

### Exercițiul 1.3: Implementarea Autentificării cu Cod de Asociere
**Dificultate**: ⭐⭐⭐☆☆
**Obiectiv**: Implementează autentificarea folosind codul de asociere în loc de QR.

**Pași**:
1. Creează un nou script pentru autentificarea cu cod de asociere
2. Adaugă prompturi pentru a cere utilizatorului numărul de telefon
3. Implementează apelurile către metodele de autentificare cu cod de asociere
4. Testează autentificarea completă

**Indicii**:
- Consultă documentația pentru a vedea parametrii necesari
- Folosește pachetul `readline` sau `inquirer` pentru prompturi interactive

## Nivel 2: Exerciții pentru Explorator

### Exercițiul 2.1: Bot de Comandă Simplă
**Dificultate**: ⭐⭐☆☆☆
**Obiectiv**: Creează un bot care răspunde la comenzi simple prefixate cu '!'.

**Pași**:
1. Creează un nou script care se conectează la WhatsApp
2. Implementează un ascultător pentru evenimentul `message.received`
3. Adaugă logică pentru a detecta comenzi care încep cu '!'
4. Implementează cel puțin 3 comenzi: `!help`, `!ping`, și `!time`

**Cod Schelet**:
```typescript
client.on('message.received', async (message) => {
  if (!message.fromMe && message.content.startsWith('!')) {
    const command = message.content.slice(1).split(' ')[0];
    
    switch (command) {
      case 'help':
        // Trimite lista de comenzi disponibile
        break;
      case 'ping':
        // Trimite un mesaj "pong" și măsoară timpul de răspuns
        break;
      case 'time':
        // Trimite data și ora curentă
        break;
      default:
        // Trimite un mesaj pentru comandă necunoscută
        break;
    }
  }
});
```

### Exercițiul 2.2: Răspunsuri Contextuale
**Dificultate**: ⭐⭐⭐☆☆
**Obiectiv**: Implementează răspunsuri care țin cont de contextul conversației.

**Pași**:
1. Extinde botul anterior pentru a urmări starea conversației pentru fiecare chat
2. Implementează o comandă care necesită mai multe interacțiuni (ex: un joc simplu)
3. Salvează și utilizează date despre utilizator între mesaje

**Indicii**:
- Utilizează un `Map` pentru a stoca starea pentru fiecare chat
- Implementează o mașină de stare simplă pentru fiecare conversație

### Exercițiul 2.3: Programator de Mesaje
**Dificultate**: ⭐⭐⭐⭐☆
**Obiectiv**: Creează un sistem pentru a programa trimiterea mesajelor la momente specifice.

**Pași**:
1. Implementează o comandă `!schedule` care permite utilizatorilor să programeze mesaje
2. Stochează mesajele programate într-o structură de date adecvată
3. Creează un mecanism pentru a verifica și trimite mesajele la momentul potrivit
4. Adaugă o comandă pentru a lista și anula mesajele programate

**Indicii**:
- Folosește `setTimeout` sau `node-cron` pentru programare
- Asigură-te că mesajele programate persistă între reporniri

## Nivel 3: Exerciții pentru Specialist Media

### Exercițiul 3.1: Procesator de Imagini
**Dificultate**: ⭐⭐⭐☆☆
**Obiectiv**: Creează un bot care poate procesa imagini primite și să le returneze modificate.

**Pași**:
1. Configurează detectarea și descărcarea imaginilor primite
2. Utilizează o bibliotecă de procesare a imaginilor (ex: sharp, Jimp) pentru a modifica imaginea
3. Implementează cel puțin 3 filtre diferite (ex: alb-negru, blur, inversare)
4. Trimite imaginea procesată înapoi la expeditor

**Indicii**:
- Verifică tipul mesajului pentru a detecta imaginile
- Utilizează biblioteca `sharp` pentru procesarea imaginilor

### Exercițiul 3.2: Generator de Stickere
**Dificultate**: ⭐⭐⭐⭐☆
**Obiectiv**: Creează un bot care convertește imaginile primite în stickere.

**Pași**:
1. Detectează când sunt primite imagini
2. Procesează imaginea pentru a o face potrivită pentru un sticker (512x512 px)
3. Convertește imaginea într-un format compatibil cu stickerele WhatsApp
4. Trimite rezultatul ca sticker

**Indicii**:
- Consultă documentația pentru formatul exact necesar pentru stickere
- Asigură-te că dimensiunea fișierului respectă limitele WhatsApp

### Exercițiul 3.3: Înregistrator și Transcriptor Audio
**Dificultate**: ⭐⭐⭐⭐⭐
**Obiectiv**: Creează un bot care poate transcrie mesaje vocale.

**Pași**:
1. Detectează și descarcă mesajele audio/vocale
2. Integrează cu un serviciu de recunoaștere vocală (ex: OpenAI Whisper API)
3. Procesează rezultatul și trimite transcrierea ca text
4. Implementează o funcție pentru a rezuma mesajele lungi

**Indicii**:
- Vei avea nevoie de un API key pentru serviciul de recunoaștere vocală
- Asigură-te că formatul audio este compatibil cu serviciul ales

## Nivel 4: Exerciții pentru Organizator de Grup

### Exercițiul 4.1: Manager de Grup Automat
**Dificultate**: ⭐⭐⭐☆☆
**Obiectiv**: Creează un bot pentru administrarea automată a grupurilor.

**Pași**:
1. Implementează detectarea când botul este adăugat într-un grup
2. Adaugă comenzi de moderare: avertizare, ștergere mesaje, kick, ban
3. Implementează reguli automate (ex: filtrarea limbajului nepotrivit)
4. Adaugă un sistem de bun venit pentru membrii noi

**Indicii**:
- Ascultă evenimentele de grup: `group.participant.joined`, `group.settings.updated`, etc.
- Păstrează o listă de administratori autorizați pentru comenzi

### Exercițiul 4.2: Sistem de Vot în Grup
**Dificultate**: ⭐⭐⭐⭐☆
**Obiectiv**: Implementează un sistem care permite membrilor grupului să voteze pe diferite subiecte.

**Pași**:
1. Creează o comandă pentru a începe un vot (`!poll`)
2. Permite utilizatorilor să voteze folosind reacții sau mesaje
3. Implementează o limită de timp pentru vot
4. Anunță rezultatele la sfârșitul votului

**Indicii**:
- Stochează datele votului într-o structură adecvată
- Folosește un timer pentru a închide votul automat

### Exercițiul 4.3: Sincronizator Multi-Grup
**Dificultate**: ⭐⭐⭐⭐⭐
**Obiectiv**: Creează un sistem care poate sincroniza mesaje între mai multe grupuri.

**Pași**:
1. Implementează un mecanism pentru a lega mai multe grupuri
2. Creează comenzi pentru a configura sincronizarea (ce se sincronizează și unde)
3. Adaugă filtre pentru a decide ce mesaje sunt sincronizate
4. Implementează un sistem de permisiuni pentru a controla cine poate sincroniza mesaje

**Indicii**:
- Gestionează cu atenție identitatea expeditorului original
- Evită bucle de sincronizare prin marcare adecvată a mesajelor

## Nivel 5: Exerciții pentru Automatizator

### Exercițiul 5.1: Integrator de Știri
**Dificultate**: ⭐⭐⭐☆☆
**Obiectiv**: Creează un bot care trimite actualizări de știri din surse RSS.

**Pași**:
1. Integrează cu un parser RSS (ex: `rss-parser`)
2. Implementează comenzi pentru a adăuga/șterge surse de știri
3. Configurează verificări periodice pentru actualizări noi
4. Formatează și trimite știrile nou descoperite

**Indicii**:
- Stochează un timestamp pentru ultima verificare pentru a evita duplicarea
- Utilizează un job programat pentru verificări periodice

### Exercițiul 5.2: Asistent de Programare
**Dificultate**: ⭐⭐⭐⭐☆
**Obiectiv**: Creează un bot care se integrează cu Google Calendar pentru programări.

**Pași**:
1. Configurează autentificarea OAuth pentru Google Calendar API
2. Implementează comenzi pentru a vedea, adăuga și șterge evenimente
3. Adaugă notificări pentru evenimente viitoare
4. Implementează un sistem conversațional pentru programarea întâlnirilor

**Indicii**:
- Vei avea nevoie de credențiale pentru Google Calendar API
- Utilizează dialoguri multi-etapă pentru o experiență naturală

### Exercițiul 5.3: Hub de Integrare
**Dificultate**: ⭐⭐⭐⭐⭐
**Obiectiv**: Creează un sistem modular care poate integra multiple servicii externe prin plug-ins.

**Pași**:
1. Proiectează o arhitectură de plug-in pentru integrări
2. Implementează cel puțin 3 integrări diferite (ex: traducere, căutare, notificări)
3. Creează un sistem de permisiuni pentru a controla accesul la fiecare integrare
4. Adaugă un mecanism de configurare pentru fiecare plugin

**Indicii**:
- Utilizează un design modular care permite adăugarea ușoară de noi plug-ins
- Implementează un mecanism de ajutor dinamic bazat pe plug-ins-urile instalate

## Nivel 6: Exerciții pentru Maestru WhatsLynx

### Exercițiul 6.1: Chatbot cu AI
**Dificultate**: ⭐⭐⭐⭐☆
**Obiectiv**: Creează un chatbot alimentat de inteligență artificială folosind API-ul OpenAI.

**Pași**:
1. Integrează WhatsLynx cu OpenAI API
2. Implementează un sistem de gestionare a contextului conversațional
3. Adaugă comenzi pentru a controla comportamentul chatbot-ului
4. Implementează limite de utilizare și metrici de utilizare

**Indicii**:
- Utilizează modelele de completare text pentru răspunsuri naturale
- Gestionează cu atenție lungimea contextului și tokenurile

### Exercițiul 6.2: Platformă de e-Commerce
**Dificultate**: ⭐⭐⭐⭐⭐
**Obiectiv**: Creează un sistem complet de e-commerce care funcționează prin WhatsApp.

**Pași**:
1. Implementează un catalog de produse cu imagini și descrieri
2. Adaugă un coș de cumpărături și sistem de comandă
3. Integrează cu un procesor de plăți (ex: simulat sau Stripe)
4. Implementează notificări despre starea comenzii și livrare

**Indicii**:
- Utilizează o bază de date pentru a stoca informațiile despre produse și comenzi
- Implementează un flux de utilizator intuitiv cu butoane și meniuri

### Exercițiul 6.3: Ecosistem Multi-Bot
**Dificultate**: ⭐⭐⭐⭐⭐
**Obiectiv**: Proiectează și implementează un ecosistem de boți specializați care colaborează.

**Pași**:
1. Creează o arhitectură pentru comunicarea între boți
2. Implementează cel puțin 3 boți specializați (ex: asistent personal, bot de notificări, bot de divertisment)
3. Adaugă un mecanism central de gestionare și monitorizare
4. Implementează failover și load balancing

**Indicii**:
- Utilizează un broker de mesaje sau o bază de date partajată pentru comunicare
- Proiectează o arhitectură scalabilă care poate crește cu cerințele

---

Aceste exerciții sunt concepute pentru a fi provocatoare și pentru a vă ajuta să vă dezvoltați abilitățile practice cu WhatsLynx API. Nu ezitați să adaptați și să extindeți exercițiile în funcție de interesele și nevoile voastre specifice. Pe măsură ce completați exercițiile, veți dobândi o înțelegere profundă a capacităților WhatsLynx și veți putea crea aplicații din ce în ce mai sofisticate.

Mult succes în dezvoltarea abilităților voastre WhatsLynx! 🌟