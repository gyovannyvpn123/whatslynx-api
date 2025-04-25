/**
 * Error handling utilities for WhatsLynx
 * Provides consistent error handling across the library
 */

/**
 * WhatsLynx specific error class with error codes
 */
export class WhatsLynxError extends Error {
  code: string;
  
  constructor(message: string, code: string = 'GENERIC_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    
    // Capture stack trace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Safely extract error message from any error type
 * @param error Unknown error object
 * @returns String representation of the error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

/**
 * Get error code from WhatsLynxError or default code
 * @param error Any error type
 * @returns Error code
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof WhatsLynxError) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Create a standardized error object for event emissions
 * @param messageId Message ID related to the error
 * @param error Original error
 * @returns Structured error object
 */
export function createErrorObject(messageId: string, error: unknown): { messageId: string; error: string } {
  return {
    messageId,
    error: getErrorMessage(error)
  };
}

/**
 * Create a full error payload with code and message
 * @param error Original error
 * @returns Error payload with code and message
 */
export function createErrorPayload(error: unknown): { code: string; message: string } {
  return {
    code: getErrorCode(error),
    message: getErrorMessage(error)
  };
}