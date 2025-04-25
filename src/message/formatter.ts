import { isValidUrl, isValidWhatsAppId } from '../utils/validators';

/**
 * Message formatting utilities
 * Provides methods to format message content
 */
export class MessageFormatter {
  private client: any; // WhatsLynxClient

  /**
   * Create a new message formatter
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Format a mention - format text to mention a user
   * @param userId User ID to mention
   * @returns Formatted mention string
   */
  mention(userId: string): string {
    if (!isValidWhatsAppId(userId)) {
      throw new Error('Invalid user ID format');
    }
    
    return `@${userId.split('@')[0]}`;
  }

  /**
   * Format text with multiple mentions
   * @param text Text content
   * @param mentionedIds Array of user IDs to mention
   * @returns Formatted text with mentions
   */
  formatWithMentions(text: string, mentionedIds: string[]): string {
    if (!text || !mentionedIds || !Array.isArray(mentionedIds)) {
      return text;
    }
    
    let formattedText = text;
    
    // Replace @mentions with formatted mentions
    for (const userId of mentionedIds) {
      const phoneNumber = userId.split('@')[0];
      const mention = this.mention(userId);
      
      // Replace @12345 with the proper mention format
      const pattern = new RegExp(`@${phoneNumber}\\b`, 'g');
      formattedText = formattedText.replace(pattern, mention);
    }
    
    return formattedText;
  }

  /**
   * Create text with bold formatting
   * @param text Text to format as bold
   * @returns Formatted text
   */
  bold(text: string): string {
    return `*${text}*`;
  }

  /**
   * Create text with italic formatting
   * @param text Text to format as italic
   * @returns Formatted text
   */
  italic(text: string): string {
    return `_${text}_`;
  }

  /**
   * Create text with strikethrough formatting
   * @param text Text to format as strikethrough
   * @returns Formatted text
   */
  strikethrough(text: string): string {
    return `~${text}~`;
  }

  /**
   * Create text with monospace (code) formatting
   * @param text Text to format as monospace
   * @returns Formatted text
   */
  monospace(text: string): string {
    return `\`\`\`${text}\`\`\``;
  }

  /**
   * Create text with inline code formatting
   * @param text Text to format as inline code
   * @returns Formatted text
   */
  inlineCode(text: string): string {
    return `\`${text}\``;
  }

  /**
   * Create a URL with preview (WhatsApp will generate a link preview)
   * @param url URL to format
   * @param displayText Optional text to display instead of the URL
   * @returns Formatted URL
   */
  link(url: string, displayText?: string): string {
    if (!isValidUrl(url)) {
      throw new Error('Invalid URL format');
    }
    
    return displayText ? `[${displayText}](${url})` : url;
  }

  /**
   * Format a phone number to a WhatsApp compatible ID
   * @param phoneNumber Phone number to format
   * @returns WhatsApp ID
   */
  formatPhoneNumberToWhatsAppId(phoneNumber: string): string {
    // Remove any non-digit characters
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Remove leading + if present
    const number = cleanNumber.startsWith('+') ? cleanNumber.substring(1) : cleanNumber;
    
    return `${number}@c.us`;
  }

  /**
   * Extract phone number from WhatsApp ID
   * @param id WhatsApp ID
   * @returns Phone number or null if invalid
   */
  extractPhoneNumber(id: string): string | null {
    if (!isValidWhatsAppId(id)) {
      return null;
    }
    
    return id.split('@')[0];
  }

  /**
   * Format a vCard for contact messages
   * @param name Contact name
   * @param phoneNumber Contact phone number
   * @param options Additional vCard options
   * @returns Formatted vCard string
   */
  formatVCard(
    name: string, 
    phoneNumber: string, 
    options: { 
      organization?: string, 
      email?: string, 
      website?: string, 
      note?: string 
    } = {}
  ): string {
    // Clean phone number - remove any non-digit characters except +
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    // Create vCard
    const vCard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
      `TEL;type=CELL;type=VOICE;waid=${cleanPhone.replace('+', '')}:${cleanPhone}`
    ];
    
    // Add optional fields
    if (options.organization) {
      vCard.push(`ORG:${options.organization}`);
    }
    
    if (options.email) {
      vCard.push(`EMAIL:${options.email}`);
    }
    
    if (options.website && isValidUrl(options.website)) {
      vCard.push(`URL:${options.website}`);
    }
    
    if (options.note) {
      vCard.push(`NOTE:${options.note}`);
    }
    
    vCard.push('END:VCARD');
    
    return vCard.join('\n');
  }

  /**
   * Create a list of sections for a list message
   * @param sections List of sections to format
   * @returns Formatted sections array
   */
  formatListSections(sections: Array<{
    title: string,
    rows: Array<{
      id?: string,
      title: string,
      description?: string
    }>
  }>): any[] {
    return sections.map(section => ({
      title: section.title,
      rows: section.rows.map(row => ({
        rowId: row.id || `${Math.floor(Math.random() * 100000)}`,
        title: row.title,
        description: row.description || ''
      }))
    }));
  }

  /**
   * Create a list of buttons for a button message
   * @param buttons List of buttons to format
   * @returns Formatted buttons array
   */
  formatButtons(buttons: Array<{
    id?: string,
    text: string
  }>): any[] {
    return buttons.map(button => ({
      buttonId: button.id || `${Math.floor(Math.random() * 100000)}`,
      buttonText: {
        displayText: button.text
      },
      type: 1
    }));
  }

  /**
   * Create a location object for location messages
   * @param latitude Latitude coordinate
   * @param longitude Longitude coordinate
   * @param options Additional location options
   * @returns Formatted location object
   */
  formatLocation(
    latitude: number, 
    longitude: number, 
    options: { 
      name?: string, 
      address?: string 
    } = {}
  ): any {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Latitude and longitude must be numbers');
    }
    
    const location: any = {
      degreesLatitude: latitude,
      degreesLongitude: longitude
    };
    
    if (options.name) {
      location.name = options.name;
    }
    
    if (options.address) {
      location.address = options.address;
    }
    
    return location;
  }
}
