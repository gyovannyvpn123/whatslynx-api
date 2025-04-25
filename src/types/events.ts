/**
 * Event types for WhatsLynx
 */

/**
 * WhatsApp event types
 */
export enum WhatsLynxEvents {
  // Connection states (as events)
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  CONNECTION_VALIDATED = 'connection.validated',
  CONNECTION_UPDATE = 'connection.update',
  CONNECTION_STATE_CHANGED = 'connection.state.changed',
  DISCONNECTED = 'disconnected',
  DISCONNECTING = 'disconnecting',
  RECONNECTING = 'reconnecting',
  QR_RECEIVED = 'qr.received',
  
  // Connection error events
  CONNECTION_ERROR = 'connection.error',
  CONNECTION_FAILED = 'connection.failed',
  RECONNECT_FAILED = 'reconnect.failed',
  
  // Auth events
  AUTH_QR = 'auth.qr',
  AUTH_PAIRING_CODE = 'auth.pairing_code',
  AUTH_AUTHENTICATED = 'auth.authenticated',
  AUTH_ERROR = 'auth.error',
  AUTH_FAILED = 'auth.failed',
  AUTH_LOGOUT = 'auth.logout',
  AUTHENTICATED = 'authenticated',
  QR_CODE_RECEIVED = 'qrcode',
  PAIRING_CODE_RECEIVED = 'pairingcode',
  SESSION_RESTORE_ATTEMPT = 'session.restore.attempt',
  SESSION_RESTORE_FAILED = 'session.restore.failed',
  SESSION_DATA_UPDATED = 'session.data.updated',
  
  // Message events
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENDING = 'message.sending',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_DELIVERED = 'message.delivered',
  MESSAGE_READ = 'message.read',
  MESSAGE_ERROR = 'message.error',
  MESSAGE_STATUS_UPDATE = 'message.status.update',
  MESSAGE_REACTION = 'message.reaction',
  MESSAGE_REVOKED = 'message.revoked',
  MESSAGE_ACK = 'message.ack',
  MEDIA_UPLOAD_STARTED = 'media.upload.started',
  MEDIA_UPLOAD_PROGRESS = 'media.upload.progress',
  MEDIA_UPLOAD_COMPLETE = 'media.upload.complete',
  MEDIA_UPLOAD_ERROR = 'media.upload.error',
  MEDIA_UPLOAD_FAILED = 'media.upload.failed',
  MEDIA_DOWNLOAD_STARTED = 'media.download.started',
  MEDIA_DOWNLOAD_PROGRESS = 'media.download.progress',
  MEDIA_DOWNLOAD_COMPLETE = 'media.download.complete',
  MEDIA_DOWNLOAD_ERROR = 'media.download.error',
  MEDIA_DOWNLOAD_FAILED = 'media.download.failed',
  MEDIA_DOWNLOADED = 'media.downloaded',
  MEDIA_UPDATED = 'media.updated',
  REACTION_RECEIVED = 'reaction.received',
  REACTION_SENT = 'reaction.sent',
  POLL_RECEIVED = 'poll.received',
  UNKNOWN_MESSAGE_RECEIVED = 'message.unknown.received',
  
  // Chat events
  CHAT_NEW = 'chat.new',
  CHAT_UPDATE = 'chat.update',
  CHAT_PRESENCE = 'chat.presence',
  CHAT_TYPING = 'chat.typing',
  CHAT_RECORDING = 'chat.recording',
  
  // Group events
  GROUP_CREATE = 'group.create',
  GROUP_CREATED = 'group.created',
  GROUP_UPDATE = 'group.update',
  GROUP_LEAVE = 'group.leave',
  GROUP_LEFT = 'group.left',
  GROUP_JOIN = 'group.join',
  GROUP_ADD = 'group.add',
  GROUP_REMOVE = 'group.remove',
  GROUP_PROMOTE = 'group.promote',
  GROUP_DEMOTE = 'group.demote',
  GROUP_INVITE_RECEIVED = 'group.invite.received',
  GROUP_SETTINGS_CHANGED = 'group.settings.changed',
  GROUP_PICTURE_CHANGED = 'group.picture.changed',
  GROUP_SUBJECT_CHANGED = 'group.subject.changed',
  GROUP_DESCRIPTION_CHANGED = 'group.description.changed', 
  GROUP_PARTICIPANT_ADDED = 'group.participant.added',
  GROUP_PARTICIPANT_REMOVED = 'group.participant.removed',
  GROUP_PARTICIPANT_PROMOTED = 'group.participant.promoted',
  GROUP_PARTICIPANT_DEMOTED = 'group.participant.demoted',
  GROUP_INVITE_CODE_CHANGED = 'group.invite.code.changed',
  GROUP_JOINED = 'group.joined',
  
  // Call events
  CALL_INCOMING = 'call.incoming',
  CALL_ACCEPT = 'call.accept',
  CALL_REJECT = 'call.reject',
  CALL_END = 'call.end',
  
  // Status events
  STATUS_UPDATE = 'status.update',
  STATUS_UPDATED = 'status.updated',
  STATUS_DELETED = 'status.deleted',
  STATUS_VIEW = 'status.view',
  
  // Profile events
  PROFILE_NAME_CHANGED = 'profile.name.changed',
  PROFILE_STATUS_CHANGED = 'profile.status.changed',
  PROFILE_PICTURE_CHANGED = 'profile.picture.changed',
  PRESENCE_UPDATED = 'presence.updated',
  
  // Other events
  ERROR = 'error',
  WARN = 'warn',
  LOG = 'log',
  DEBUG = 'debug'
}