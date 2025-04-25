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
 * Concatenate multiple buffers into one
 * @param buffers Array of buffers to concatenate
 * @returns Combined buffer
 */
export function concatBuffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers);
}

/**
 * Generate a random message ID
 * @returns Random message ID string
 */
export function generateMessageID(): string {
  // Format: 3EB0XXXX-YYYYYYYY (X = random hex, Y = timestamp hex)
  const randomHex = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const timestampHex = Date.now().toString(16).padStart(8, '0');
  return `3EB0${randomHex.toUpperCase()}-${timestampHex.toUpperCase()}`;
}

/**
 * Serialize a node for the WhatsApp binary protocol
 * @param node Node to serialize
 * @returns Serialized node buffer
 */
export function serializeNode(node: any[]): Buffer {
  // WhatsApp Web uses a custom binary format for nodes
  // This is a simplified implementation that handles the basics
  
  // Check if node is valid
  if (!Array.isArray(node) || node.length < 1) {
    throw new Error('Invalid node format');
  }
  
  // Extract node parts
  const [tag, attributes, content] = node;
  
  // Convert tag to buffer with a type byte
  const tagBuffer = Buffer.concat([
    Buffer.from([1]), // Type: string
    Buffer.from(tag, 'utf8')
  ]);
  
  // Serialize attributes if present
  let attributesBuffer = Buffer.alloc(0);
  if (attributes && typeof attributes === 'object') {
    const attrPairs = [];
    
    for (const [key, value] of Object.entries(attributes)) {
      // Key is always a string
      const keyBuffer = Buffer.concat([
        Buffer.from([1]), // Type: string
        Buffer.from(key, 'utf8')
      ]);
      
      // Value can be different types
      let valueBuffer;
      if (typeof value === 'string') {
        valueBuffer = Buffer.concat([
          Buffer.from([1]), // Type: string
          Buffer.from(value, 'utf8')
        ]);
      } else if (typeof value === 'number') {
        // Convert number to 8-byte buffer
        const numBuffer = Buffer.alloc(8);
        numBuffer.writeDoubleLE(value, 0);
        valueBuffer = Buffer.concat([
          Buffer.from([2]), // Type: number
          numBuffer
        ]);
      } else if (value === null || value === undefined) {
        valueBuffer = Buffer.from([0]); // Type: null
      } else if (typeof value === 'boolean') {
        valueBuffer = Buffer.from([3, value ? 1 : 0]); // Type: boolean
      } else if (Buffer.isBuffer(value)) {
        valueBuffer = Buffer.concat([
          Buffer.from([4]), // Type: binary
          Buffer.from(Int32Array.from([value.length]).buffer),
          value
        ]);
      } else {
        // Convert any other type to string
        valueBuffer = Buffer.concat([
          Buffer.from([1]), // Type: string
          Buffer.from(String(value), 'utf8')
        ]);
      }
      
      attrPairs.push(Buffer.concat([keyBuffer, valueBuffer]));
    }
    
    // Combine all attribute pairs
    attributesBuffer = Buffer.concat([
      Buffer.from([5]), // Type: attributes
      ...attrPairs
    ]);
  }
  
  // Serialize content if present
  let contentBuffer = Buffer.alloc(0);
  if (content !== undefined) {
    if (typeof content === 'string') {
      contentBuffer = Buffer.concat([
        Buffer.from([1]), // Type: string
        Buffer.from(content, 'utf8')
      ]);
    } else if (Array.isArray(content)) {
      // If content is an array of nodes, serialize each one
      const contentNodes = content.map(node => serializeNode(node));
      contentBuffer = Buffer.concat([
        Buffer.from([6]), // Type: array
        ...contentNodes
      ]);
    } else if (Buffer.isBuffer(content)) {
      contentBuffer = Buffer.concat([
        Buffer.from([4]), // Type: binary
        Buffer.from(Int32Array.from([content.length]).buffer),
        content
      ]);
    }
  }
  
  // Combine all parts with length prefix
  const combinedBuffer = Buffer.concat([tagBuffer, attributesBuffer, contentBuffer]);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(combinedBuffer.length, 0);
  
  return Buffer.concat([lengthBuffer, combinedBuffer]);
}

/**
 * Deserialize a node from the WhatsApp binary protocol
 * @param buffer Serialized node buffer
 * @returns Deserialized node
 */
export function deserializeNode(buffer: Buffer): any[] {
  try {
    // This is a simplified implementation that handles the basics
    // In a real implementation, this would be much more complex
    
    // Check if buffer is valid
    if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
      throw new Error('Invalid buffer format');
    }
    
    // Read node length
    const nodeLength = buffer.readUInt32BE(0);
    
    // Check if buffer is complete
    if (buffer.length < nodeLength + 4) {
      throw new Error('Incomplete buffer');
    }
    
    // Extract node data (skip length prefix)
    const nodeData = buffer.slice(4, nodeLength + 4);
    
    // Parse tag (first part of the buffer)
    let offset = 0;
    const tagType = nodeData[offset++];
    
    if (tagType !== 1) {
      throw new Error('Invalid tag type');
    }
    
    // Find the end of the tag string (null terminator)
    let tagEnd = offset;
    while (tagEnd < nodeData.length && nodeData[tagEnd] !== 0) {
      tagEnd++;
    }
    
    // Extract tag
    const tag = nodeData.slice(offset, tagEnd).toString('utf8');
    offset = tagEnd + 1;
    
    // Parse attributes if present
    let attributes: Record<string, any> = {};
    if (offset < nodeData.length && nodeData[offset] === 5) {
      // Skip attribute type byte
      offset++;
      
      // Parse attributes until we reach content or end of buffer
      while (offset < nodeData.length && nodeData[offset] !== 6 && nodeData[offset] !== 0) {
        // Parse attribute key
        const keyType = nodeData[offset++];
        if (keyType !== 1) {
          throw new Error('Invalid attribute key type');
        }
        
        // Find the end of the key string
        let keyEnd = offset;
        while (keyEnd < nodeData.length && nodeData[keyEnd] !== 0) {
          keyEnd++;
        }
        
        // Extract key
        const key = nodeData.slice(offset, keyEnd).toString('utf8');
        offset = keyEnd + 1;
        
        // Parse attribute value
        const valueType = nodeData[offset++];
        let value;
        
        switch (valueType) {
          case 0: // null
            value = null;
            break;
          case 1: // string
            // Find the end of the value string
            let valueEnd = offset;
            while (valueEnd < nodeData.length && nodeData[valueEnd] !== 0) {
              valueEnd++;
            }
            
            // Extract value
            value = nodeData.slice(offset, valueEnd).toString('utf8');
            offset = valueEnd + 1;
            break;
          case 2: // number
            value = nodeData.readDoubleLE(offset);
            offset += 8;
            break;
          case 3: // boolean
            value = nodeData[offset++] === 1;
            break;
          case 4: // binary
            // Read binary length
            const binaryLength = nodeData.readInt32BE(offset);
            offset += 4;
            
            // Extract binary data
            value = nodeData.slice(offset, offset + binaryLength);
            offset += binaryLength;
            break;
          default:
            throw new Error(`Unknown attribute value type: ${valueType}`);
        }
        
        // Add attribute to collection
        attributes[key] = value;
      }
    }
    
    // Parse content if present
    let content;
    if (offset < nodeData.length) {
      const contentType = nodeData[offset++];
      
      switch (contentType) {
        case 0: // null
          content = null;
          break;
        case 1: // string
          // Extract content string (rest of the buffer)
          content = nodeData.slice(offset).toString('utf8');
          break;
        case 4: // binary
          // Read binary length
          const binaryLength = nodeData.readInt32BE(offset);
          offset += 4;
          
          // Extract binary data
          content = nodeData.slice(offset, offset + binaryLength);
          break;
        case 6: // array of nodes
          content = [];
          
          // Parse child nodes until the end of the buffer
          while (offset < nodeData.length) {
            // Read child node length
            const childLength = nodeData.readUInt32BE(offset);
            offset += 4;
            
            // Extract child node
            const childNode = nodeData.slice(offset, offset + childLength);
            offset += childLength;
            
            // Recursively deserialize child node
            const lengthBuf = Buffer.alloc(4);
            lengthBuf.writeUInt32BE(childLength, 0);
            content.push(deserializeNode(Buffer.concat([
              lengthBuf,
              childNode
            ])));
          }
          break;
        default:
          throw new Error(`Unknown content type: ${contentType}`);
      }
    }
    
    // Return the deserialized node
    return [tag, attributes, content];
  } catch (error: any) {
    throw new Error(`Failed to deserialize node: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Split a binary message into individual nodes
 * @param data Binary message data
 * @returns Array of nodes
 */
export function splitBinaryMessage(data: Buffer): any[] {
  const nodes = [];
  let offset = 0;
  
  try {
    while (offset < data.length) {
      // Check if we have enough data for the length prefix
      if (offset + 4 > data.length) {
        break;
      }
      
      // Read node length
      const nodeLength = data.readUInt32BE(offset);
      offset += 4;
      
      // Check if we have enough data for the node
      if (offset + nodeLength > data.length) {
        break;
      }
      
      // Extract node data
      const nodeData = data.slice(offset, offset + nodeLength);
      offset += nodeLength;
      
      // Deserialize node
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32BE(nodeLength, 0);
      const node = deserializeNode(Buffer.concat([
        lengthBuf,
        nodeData
      ]));
      
      nodes.push(node);
    }
  } catch (error) {
    // Just return whatever nodes we've parsed so far
  }
  
  return nodes;
}

/**
 * Join multiple nodes into a binary message
 * @param nodes Array of nodes
 * @returns Binary message buffer
 */
export function joinBinaryMessage(nodes: any[]): Buffer {
  const buffers = nodes.map(node => {
    const serialized = serializeNode(node);
    // Remove length prefix (first 4 bytes)
    return serialized.slice(4);
  });
  
  return Buffer.concat(buffers);
}

/**
 * Create a WhatsApp message node
 * @param tag Node tag
 * @param attrs Node attributes
 * @param content Node content
 * @returns WhatsApp message node
 */
export function createMessageNode(tag: string, attrs: Record<string, any> = {}, content?: any): any[] {
  return [tag, attrs, content];
}

/**
 * Encode a binary message for transmission
 * @param message Binary message to encode
 * @returns Encoded message buffer
 */
export function encodeMessage(message: Buffer): Buffer {
  // WhatsApp Web uses a simple length prefix
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(message.length, 0);
  
  return Buffer.concat([lengthBuffer, message]);
}

/**
 * Decode a binary message from transmission
 * @param data Encoded message buffer
 * @returns Decoded message buffer
 */
export function decodeMessage(data: Buffer): Buffer {
  // Check if the data is valid
  if (!Buffer.isBuffer(data) || data.length < 4) {
    throw new Error('Invalid message format');
  }
  
  // Read message length
  const messageLength = data.readUInt32BE(0);
  
  // Check if the data is complete
  if (data.length < messageLength + 4) {
    throw new Error('Incomplete message');
  }
  
  // Extract message (skip length prefix)
  return data.slice(4, messageLength + 4);
}