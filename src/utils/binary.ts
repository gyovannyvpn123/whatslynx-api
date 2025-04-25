/**
 * Binary data utilities for WhatsApp protocol
 * 
 * This module provides tools for working with binary data
 * in the WhatsApp Web protocol, including node serialization
 * and binary message parsing.
 */

/**
 * Convert a string to a buffer
 * @param str String to convert
 * @returns Buffer representation
 */
export function stringToBuffer(str: string): Buffer {
  return Buffer.from(str, 'utf8');
}

/**
 * Convert a buffer to a string
 * @param buffer Buffer to convert
 * @returns String representation
 */
export function bufferToString(buffer: Buffer): string {
  return buffer.toString('utf8');
}

/**
 * Convert an array buffer to a buffer
 * @param arrayBuffer ArrayBuffer to convert
 * @returns Node.js Buffer
 */
export function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(arrayBuffer);
}

/**
 * Convert a buffer to an array buffer
 * @param buffer Buffer to convert
 * @returns ArrayBuffer representation
 */
export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

/**
 * Read a variable-length integer from a buffer
 * @param buffer Input buffer
 * @param offset Offset to start reading from
 * @returns Tuple containing the value and bytes read
 */
export function readVarInt(buffer: Buffer, offset: number = 0): [number, number] {
  let result = 0;
  let shift = 0;
  let counter = 0;
  let b: number;
  
  do {
    if (offset + counter >= buffer.length) {
      throw new Error('Buffer overflow when reading varint');
    }
    
    b = buffer[offset + counter++];
    result |= (b & 0x7f) << shift;
    shift += 7;
  } while ((b & 0x80) !== 0);
  
  return [result, counter];
}

/**
 * Write a variable-length integer to a buffer
 * @param value Value to write
 * @returns Buffer containing the written value
 */
export function writeVarInt(value: number): Buffer {
  const buff = [];
  
  while (value >= 0x80) {
    buff.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  
  buff.push(value & 0x7f);
  
  return Buffer.from(buff);
}

/**
 * Serialize a WhatsApp node into binary format
 * @param node Node to serialize
 * @returns Serialized node as Buffer
 */
export function serializeNode(node: any): Buffer {
  // This is a simplified implementation
  // In reality, this would implement the actual WhatsApp binary protocol
  
  // Convert node to JSON string
  const jsonStr = JSON.stringify(node);
  
  // Create a buffer with a length prefix
  const contentBuffer = Buffer.from(jsonStr, 'utf8');
  const lengthBuffer = writeVarInt(contentBuffer.length);
  
  return Buffer.concat([lengthBuffer, contentBuffer]);
}

/**
 * Deserialize a binary WhatsApp node
 * @param buffer Binary data
 * @param offset Offset to start reading from
 * @returns Tuple containing deserialized node and bytes read
 */
export function deserializeNode(buffer: Buffer, offset: number = 0): [any, number] {
  // This is a simplified implementation
  // In reality, this would implement the actual WhatsApp binary protocol
  
  try {
    // Read the length prefix
    const [length, bytesRead] = readVarInt(buffer, offset);
    offset += bytesRead;
    
    // Ensure buffer is large enough
    if (offset + length > buffer.length) {
      throw new Error('Buffer too small');
    }
    
    // Extract the content
    const content = buffer.slice(offset, offset + length).toString('utf8');
    
    // Parse the content as JSON
    const node = JSON.parse(content);
    
    return [node, bytesRead + length];
  } catch (error: any) {
    throw new Error(`Failed to deserialize node: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Split a binary message into multiple nodes
 * @param buffer Complete binary message
 * @returns Array of nodes
 */
export function splitBinaryMessage(buffer: Buffer): any[] {
  const nodes = [];
  let offset = 0;
  
  while (offset < buffer.length) {
    try {
      const [node, bytesRead] = deserializeNode(buffer, offset);
      nodes.push(node);
      offset += bytesRead;
    } catch (error) {
      break;
    }
  }
  
  return nodes;
}

/**
 * Join multiple nodes into a single binary message
 * @param nodes Array of nodes
 * @returns Combined binary message
 */
export function joinBinaryMessage(nodes: any[]): Buffer {
  const buffers = nodes.map(node => serializeNode(node));
  return Buffer.concat(buffers);
}

/**
 * Generate a random message ID
 * @returns Unique message ID string
 */
export function generateMessageID(): string {
  const crypto = require('crypto');
  const bytes = crypto.randomBytes(10);
  return bytes.toString('hex');
}
