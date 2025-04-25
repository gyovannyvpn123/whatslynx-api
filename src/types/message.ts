/**
 * Message type definitions for WhatsLynx
 */

/**
 * Message types (text, media, etc.)
 */
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  CONTACT = 'contact',
  CONTACT_CARD = 'contact_card',
  CONTACT_CARD_MULTI = 'contact_card_multi',
  LOCATION = 'location',
  LIVE_LOCATION = 'live_location',
  TEMPLATE = 'template',
  GROUP_INVITE = 'group_invite',
  LIST = 'list',
  BUTTON = 'button',
  BUTTONS = 'buttons', // Alias for BUTTON for backward compatibility
  PRODUCT = 'product',
  ORDER = 'order',
  POLL = 'poll',
  REACTION = 'reaction',
  CALL = 'call',
  UNKNOWN = 'unknown' // For unsupported or unrecognized message types
}

/**
 * Chat types (individual, group, etc.)
 */
export enum ChatType {
  INDIVIDUAL = 'individual',
  GROUP = 'group',
  BROADCAST = 'broadcast',
  STATUS = 'status'
}

/**
 * Message delivery status
 */
export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  SERVER_ACK = 'server_ack',
  DELIVERY_ACK = 'delivery_ack',
  DELIVERED = 'delivered',
  READ = 'read',
  PLAYED = 'played',
  FAILED = 'failed',
  ERROR = 'error'
}

/**
 * Media types for attachments
 */
export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker'
}

/**
 * Generic message interface
 */
export interface Message {
  id: string;
  chatId: string;
  type: MessageType;
  sender: string;
  senderName?: string;
  timestamp: number;
  fromMe: boolean;
  isBroadcast?: boolean;
  isStatus?: boolean;
  isViewOnce?: boolean;
  isForwarded?: boolean;
  forwardingScore?: number;
  isStarred?: boolean;
  mentionedIds?: string[];
  quotedMessage?: Message;
  contextInfo?: {
    quotedMessageId?: string;
    mentionedJids?: string[];
    forwardingScore?: number;
  };
  content: any;
  // Additional properties for internal tracking
  serverMessageId?: string;
  status?: MessageStatus;
  quoted?: Message;
  mentions?: string[];
  metadata?: Record<string, any>;
  
  // Common properties used in different message types
  body?: string;
  caption?: string;
  url?: string;
  fileSize?: number;
  
  // Media properties
  mimetype?: string;
  mediaKey?: string | Buffer;
  fileName?: string;
  width?: number;
  height?: number;
  seconds?: number;
  ptt?: boolean;
  isAnimated?: boolean;
  
  // Location messages
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
  accuracyInMeters?: number;
  speedInMps?: number;
  degreesClockwise?: number;
  sequenceNumber?: number;
  comment?: string;
  
  // Contact messages
  displayName?: string;
  vcard?: string;
  contacts?: Array<{
    displayName: string;
    vcard: string;
  }>;
  
  // Button and list messages
  title?: string;
  description?: string;
  footerText?: string;
  buttonText?: string;
  buttons?: Array<{
    id: string;
    text: string;
  }>;
  sections?: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>
  }>;
  
  // Template messages
  namespace?: string;
  templateId?: string;
  templateParams?: Array<{
    type: string;
    value: string;
  }>;
  parameters?: Array<any>;
}

/**
 * Text message
 */
export interface TextMessage extends Message {
  type: MessageType.TEXT;
  content: {
    body: string;
  };
  body: string; // Alias for content.body
}

/**
 * Media message common properties
 */
export interface MediaMessage extends Message {
  type: MessageType.IMAGE | MessageType.VIDEO | MessageType.AUDIO | MessageType.DOCUMENT | MessageType.STICKER;
  content: {
    caption?: string;
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName?: string;
    width?: number;
    height?: number;
    seconds?: number;
    jpegThumbnail?: string | Buffer;
  };
  caption?: string; // Alias for content.caption
}

/**
 * Image message
 */
export interface ImageMessage extends MediaMessage {
  type: MessageType.IMAGE;
  content: {
    caption?: string;
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName?: string;
    width: number;
    height: number;
    jpegThumbnail?: string | Buffer;
  };
}

/**
 * Video message
 */
export interface VideoMessage extends MediaMessage {
  type: MessageType.VIDEO;
  content: {
    caption?: string;
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName?: string;
    width: number;
    height: number;
    seconds: number;
    jpegThumbnail?: string | Buffer;
  };
}

/**
 * Audio message
 */
export interface AudioMessage extends MediaMessage {
  type: MessageType.AUDIO;
  content: {
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName?: string;
    seconds: number;
    ptt?: boolean; // Voice note flag
  };
}

/**
 * Document message
 */
export interface DocumentMessage extends MediaMessage {
  type: MessageType.DOCUMENT;
  content: {
    caption?: string;
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName: string;
    title?: string;
    pageCount?: number;
    jpegThumbnail?: string | Buffer;
  };
}

/**
 * Sticker message
 */
export interface StickerMessage extends MediaMessage {
  type: MessageType.STICKER;
  content: {
    mimetype: string;
    url?: string;
    mediaKey?: string | Buffer;
    fileSize?: number;
    fileName?: string;
    width: number;
    height: number;
    isAnimated?: boolean;
  };
}

/**
 * Contact message
 */
export interface ContactMessage extends Message {
  type: MessageType.CONTACT;
  content: {
    displayName: string;
    vcard: string;
  };
}

/**
 * Location message
 */
export interface LocationMessage extends Message {
  type: MessageType.LOCATION;
  content: {
    degreesLatitude: number;
    degreesLongitude: number;
    name?: string;
    address?: string;
    url?: string;
    jpegThumbnail?: string | Buffer;
  };
}

/**
 * Live location message
 */
export interface LiveLocationMessage extends Message {
  type: MessageType.LIVE_LOCATION;
  content: {
    degreesLatitude: number;
    degreesLongitude: number;
    name?: string;
    address?: string;
    url?: string;
    jpegThumbnail?: string | Buffer;
    accuracyInMeters?: number;
    speedInMps?: number;
    degreesClockwiseFromMagneticNorth?: number;
    timestampSeconds: number;
    sequenceNumber: number;
    timeOffset: number;
  };
}

/**
 * Group invite message
 */
export interface GroupInviteMessage extends Message {
  type: MessageType.GROUP_INVITE;
  content: {
    groupJid: string;
    groupName: string;
    inviteCode: string;
    inviteExpiration: number;
    jpegThumbnail?: string | Buffer;
  };
}

/**
 * Template message
 */
export interface TemplateMessage extends Message {
  type: MessageType.TEMPLATE;
  content: {
    header?: {
      type: 'text' | 'image' | 'video' | 'document';
      content: any;
    };
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    buttons: Array<{
      type: 'replyButton' | 'urlButton' | 'callButton';
      title: string;
      payload?: string;
      url?: string;
      phoneNumber?: string;
    }>;
  };
}

/**
 * List message
 */
export interface ListMessage extends Message {
  type: MessageType.LIST;
  content: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    listType: number;
    sections: Array<{
      title: string;
      rows: Array<{
        rowId: string;
        title: string;
        description?: string;
      }>;
    }>;
  };
}

/**
 * Button message
 */
export interface ButtonMessage extends Message {
  type: MessageType.BUTTON;
  content: {
    contentText: string;
    footerText?: string;
    headerType: number;
    buttons: Array<{
      buttonId: string;
      buttonText: {
        displayText: string;
      };
      type: number;
    }>;
    headerText?: string;
  };
}

/**
 * Product message
 */
export interface ProductMessage extends Message {
  type: MessageType.PRODUCT;
  content: {
    productId: string;
    title: string;
    description: string;
    currencyCode: string;
    priceAmount1000: number;
    retailerId?: string;
    url?: string;
    productImageCount: number;
    firstImageId?: string;
    salePriceAmount1000?: number;
  };
}

/**
 * Poll message
 */
export interface PollMessage extends Message {
  type: MessageType.POLL;
  content: {
    name: string;
    options: string[];
    selectableOptionsCount: number;
    pollInvalidated?: boolean;
  };
}

/**
 * Reaction message
 */
export interface ReactionMessage extends Message {
  type: MessageType.REACTION;
  content: {
    targetMessageId: string;
    targetMessageType: MessageType;
    emoji: string;
    senderTimestampMs: number;
  };
}

/**
 * Media attachment for sending
 */
export interface MediaAttachment {
  type: MediaType;
  url: string;
  mediaKey: string | Buffer;
  mimetype: string;
  fileSize: number;
  fileName: string;
  filehash?: string;
  caption?: string;
  width?: number;
  height?: number;
  seconds?: number;
  duration?: number;
  jpegThumbnail?: string | Buffer;
}

/**
 * Options for sending messages
 */
export interface SendMessageOptions {
  /** Message ID (optional for client-side tracking) */
  messageId?: string;
  /** Quoted message (reply) */
  quoted?: Message;
  /** Quoted message ID (alternative to quoted) */
  quotedMessageId?: string;
  /** Mentioned contacts (for @mentions) */
  mentions?: string[];
  /** Mentioned IDs (deprecated, use mentions instead) */
  mentionedIds?: string[];
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Whether to send as view once/disappearing */
  viewOnce?: boolean;
  /** Media caption */
  caption?: string;
  /** Media MIME type */
  mimetype?: string;
  /** Media file name */
  fileName?: string;
  /** Media type for sending media messages */
  mediaType?: MessageType;
  /** Send as document type regardless of actual media type */
  sendAsDocumentType?: boolean;
  /** Description text for list messages */
  description?: string;
  /** Footer text for buttons or list messages */
  footerText?: string;
  
  // Location message properties
  /** Location name */
  name?: string;
  /** Location address */
  address?: string;
  
  // For backward compatibility
  /** Location name (deprecated, use name instead) */
  locationName?: string;
  /** Location address (deprecated, use address instead) */
  locationAddress?: string;
}

/**
 * Extended message interface with additional properties
 * used internally for tracking and processing
 */
export interface ExtendedMessage extends Message {
  /** Server-assigned message ID */
  serverMessageId?: string;
  /** Message delivery/read status */
  status?: MessageStatus;
  /** Quoted message for replies */
  quoted?: Message;
  /** Mentions in the message */
  mentions?: string[];
}