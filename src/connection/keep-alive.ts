/**
 * Keep-alive mechanism for WhatsApp Web connection
 */
export class KeepAlive {
  private client: any; // WhatsLynxClient
  private interval: NodeJS.Timeout | null = null;
  private lastPingResponse: number = Date.now();
  private pingFailures: number = 0;
  private maxPingFailures: number = 3;

  /**
   * Create a new keep-alive manager
   * @param client WhatsApp client instance
   */
  constructor(client: any) {
    this.client = client;
  }

  /**
   * Start the keep-alive mechanism
   */
  start(): void {
    this.stop();
    this.pingFailures = 0;
    this.lastPingResponse = Date.now();
    
    // Send a ping every 20 seconds
    this.interval = setInterval(() => {
      this.sendPing().catch(() => {
        this.pingFailures++;
        
        if (this.pingFailures >= this.maxPingFailures) {
          this.client.getOptions().logger('warn', `No ping response after ${this.maxPingFailures} attempts, reconnecting...`);
          this.handleDisconnection();
        }
      });
      
      // Check if we haven't received a ping response for too long
      const now = Date.now();
      const pingTimeout = 60000; // 60 seconds
      
      if (now - this.lastPingResponse > pingTimeout) {
        this.client.getOptions().logger('warn', 'No ping response for 60 seconds, reconnecting...');
        this.handleDisconnection();
      }
    }, 20000);
  }

  /**
   * Stop the keep-alive mechanism
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Send a ping to the server
   * @returns Promise that resolves when ping is acknowledged
   */
  private async sendPing(): Promise<void> {
    if (!this.client.socket.isConnected()) {
      throw new Error('Socket is not connected');
    }

    try {
      // Generate a unique tag for this ping message
      const tag = `ping_${Date.now()}`;
      
      // Send the ping message with a tag
      await this.client.socket.sendTaggedMessage({
        type: 'ping'
      }, tag);
      
      // If we get here, the ping was successful
      this.pingFailures = 0;
      this.lastPingResponse = Date.now();
    } catch (error) {
      this.client.getOptions().logger('error', 'Ping failed', error);
      throw error;
    }
  }

  /**
   * Handle disconnection due to ping failures
   * @private
   */
  private handleDisconnection(): void {
    this.stop();
    
    // Only attempt to reconnect if socket thinks it's still connected
    if (this.client.socket.isConnected()) {
      this.client.socket.reconnect().catch((error: unknown) => {
        this.client.getOptions().logger('error', 'Failed to reconnect after ping failures', error);
      });
    }
  }
}
