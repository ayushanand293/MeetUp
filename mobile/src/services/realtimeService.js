/**
 * RealtimeService - Enterprise-grade WebSocket real-time communication
 * 
 * Features:
 * - Exponential backoff reconnection with jitter
 * - Message queuing for offline support
 * - Event-driven subscriptions (multiple listeners)
 * - Promise-based connection management
 * - Automatic heartbeat/keepalive
 * - Session persistence and recovery
 * - Comprehensive error handling
 * - Performance metrics and monitoring
 * - Memory leak prevention
 */

const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * Advanced EventEmitter with once() support
 */
class EventEmitter {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    
    const listenersCopy = Array.from(this.listeners.get(event));
    for (const callback of listenersCopy) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    }
  }

  removeAllListeners() {
    this.listeners.clear();
    this.onceListeners.clear();
  }
}

/**
 * RealtimeService - WebSocket connection manager
 */
class RealtimeService extends EventEmitter {
  constructor() {
    super();
    
    // Connection state
    this.ws = null;
    this.url = null;
    this.token = null;
    this.sessionId = null;
    
    // Connection status
    this.connectionStatus = 'disconnected'; // 'connected', 'connecting', 'reconnecting', 'disconnected', 'failed'
    this.connectionAttempts = 0;
    this.isManualClose = false;
    
    // Reconnection strategy
    this.reconnectConfig = {
      initialDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      multiplier: 1.5, // 50% increase each attempt
      jitter: true, // Add randomness to prevent thundering herd
      maxAttempts: 10,
    };
    
    // Message handling
    this.messageQueue = [];
    this.maxQueuedMessages = 100;
    this.isProcessingQueue = false;
    
    // Heartbeat/keepalive
    this.heartbeatInterval = 30000; // 30 seconds
    this.heartbeatTimer = null;
    this.lastHeartbeatTime = null;
    
    // Session recovery
    this.subscriptionRooms = new Set();
    this.sessionStartTime = null;
    
    // Performance metrics
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      messagesFailed: 0,
      connectionTime: null,
      disconnectionTime: null,
      reconnectAttempts: 0,
      averageRoundTripTime: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
    };
    
    // Pending requests (for request-response pattern)
    this.pendingRequests = new Map();
    this.requestTimeout = 5000; // 5 seconds
    
    // Client-side throttling for location updates (align with server 3s limit)
    this.lastLocationSentTime = 0;
  }

  /**
   * Connect to WebSocket server
   * @param {string} token - JWT authentication token
   * @param {string} sessionId - Session UUID
   * @param {string} baseUrl - Backend URL
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>}
   */
  async connect(token, sessionId, baseUrl = 'http://localhost:8000', options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Validate inputs
        if (!token || !sessionId) {
          throw new Error('Token and sessionId are required');
        }

        this.token = token;
        this.sessionId = sessionId;
        
        // Merge options
        if (options.reconnectConfig) {
          this.reconnectConfig = { ...this.reconnectConfig, ...options.reconnectConfig };
        }

        // Construct WebSocket URL
        const wsUrl = baseUrl.replace(/^http/, 'ws');
        this.url = `${wsUrl}/api/v1/ws/meetup?token=${encodeURIComponent(token)}&session_id=${sessionId}`;

        DEBUG && console.log('[RealtimeService] Connecting to:', this.url.substring(0, 50) + '... (token hidden)');
        
        this.connectionStatus = 'connecting';
        this.emit('statusChange', { status: 'connecting' });

        // Create WebSocket
        this.ws = new WebSocket(this.url);
        
        // Set event handlers
        this.ws.onopen = () => this._onOpen(resolve, reject);
        this.ws.onmessage = (event) => this._onMessage(event);
        this.ws.onerror = (event) => this._onError(event);
        this.ws.onclose = () => this._onClose();
      } catch (error) {
        console.error('[RealtimeService] Connection setup error:', error);
        this.connectionStatus = 'failed';
        this.metrics.messagesFailed++;
        this.emit('statusChange', { status: 'failed' });
        this.emit('error', { code: 'SETUP_FAILED', message: error.message });
        reject(error);
      }
    });
  }

  /**
   * Send location update with client-side throttling (1 per 3 seconds)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} accuracy_m - Accuracy in meters
   * @returns {boolean}
   */
  sendLocationUpdate(lat, lon, accuracy_m = 10) {
    const now = Date.now();
    const timeSinceLastSent = now - this.lastLocationSentTime;
    const THROTTLE_MS = 3000; // 3 seconds (align with server limit)

    // Enforce client-side throttle to prevent rate limit errors
    if (timeSinceLastSent < THROTTLE_MS) {
      DEBUG && console.debug(`[RealtimeService] Throttled location update (${THROTTLE_MS - timeSinceLastSent}ms remaining)`);
      return false; // Silently skip, don't queue
    }

    if (!this._isConnected()) {
      DEBUG && console.warn('[RealtimeService] Not connected, queuing location update');
      this._queueMessage({
        type: 'location_update',
        payload: { lat, lon, accuracy_m, timestamp: new Date().toISOString() },
      });
      return false;
    }

    const payload = {
      type: 'location_update',
      payload: {
        lat,
        lon,
        accuracy_m,
        timestamp: new Date().toISOString(),
      },
    };

    const sent = this._sendMessage(payload);
    if (sent) {
      this.lastLocationSentTime = now;
    }
    return sent;
  }

  /**
   * End session signal
   * @param {string} reason - Reason for ending
   * @returns {boolean}
   */
  endSession(reason = 'USER_ACTION') {
    const payload = {
      type: 'end_session',
      payload: { reason },
    };
    return this._sendMessage(payload);
  }

  /**
   * Gracefully disconnect
   */
  disconnect() {
    DEBUG && console.log('[RealtimeService] Disconnecting...');
    
    this.isManualClose = true;
    this.connectionStatus = 'disconnected';
    
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (error) {
        console.error('[RealtimeService] Close error:', error);
      }
      this.ws = null;
    }
    
    this._cleanup();
    this.emit('statusChange', { status: 'disconnected' });
    DEBUG && console.log('[RealtimeService] Disconnected');
  }

  /**
   * Get connection status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this._isConnected(),
      status: this.connectionStatus,
      reconnectAttempts: this.connectionAttempts,
      queuedMessages: this.messageQueue.length,
      sessionId: this.sessionId,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Reconfigure reconnection strategy
   * @param {Object} config
   */
  setReconnectConfig(config) {
    this.reconnectConfig = { ...this.reconnectConfig, ...config };
    DEBUG && console.log('[RealtimeService] Reconnect config updated:', this.reconnectConfig);
  }

  /**
   * Dispose all resources (cleanup)
   */
  dispose() {
    DEBUG && console.log('[RealtimeService] Disposing resources...');
    
    this.disconnect();
    this.removeAllListeners();
    this.messageQueue = [];
    this.pendingRequests.clear();
    this.subscriptionRooms.clear();
    
    DEBUG && console.log('[RealtimeService] Disposed');
  }

  // ===== PRIVATE METHODS =====

  /**
   * Check if connected and ready
   * @returns {boolean}
   * @private
   */
  _isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.connectionStatus === 'connected';
  }

  /**
   * Handle WebSocket open
   * @private
   */
  _onOpen(resolve, reject) {
    DEBUG && console.log('[RealtimeService] WebSocket opened');
    
    this.connectionStatus = 'connected';
    this.connectionAttempts = 0;
    this.metrics.connectionTime = Date.now();
    this.sessionStartTime = Date.now();
    
    // Start heartbeat
    this._startHeartbeat();
    
    // Flush queued messages
    this._flushMessageQueue();
    
    this.emit('statusChange', { status: 'connected' });
    this.emit('connected');
    
    if (resolve) resolve(true);
  }

  /**
   * Handle incoming messages
   * @private
   */
  _onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      const messageSize = event.data.length;
      
      this.metrics.messagesReceived++;
      this.metrics.totalBytesReceived += messageSize;
      
      DEBUG && console.log('[RealtimeService] Message:', data.type);

      switch (data.type) {
        case 'presence_update':
          this.emit('presenceUpdate', data.payload);
          break;

        case 'peer_location':
          this.emit('peerLocation', {
            ...data.payload,
            receivedAt: new Date().toISOString(),
          });
          break;

        case 'session_ended':
          DEBUG && console.log('[RealtimeService] Session ended:', data.payload);
          this.emit('sessionEnded', data.payload);
          this.disconnect();
          break;

        case 'error':
          console.error('[RealtimeService] Server error:', data.payload);
          this.emit('error', data.payload);
          break;

        case 'pong':
          // Heartbeat response
          this.lastHeartbeatTime = Date.now();
          break;

        default:
          DEBUG && console.warn('[RealtimeService] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[RealtimeService] Message parsing error:', error);
      this.metrics.messagesFailed++;
    }
  }

  /**
   * Handle WebSocket errors
   * @private
   */
  _onError(event) {
    console.error('[RealtimeService] WebSocket error:', event);
    this.metrics.messagesFailed++;
    this.emit('error', {
      code: 'WS_ERROR',
      message: 'WebSocket error occurred',
    });
  }

  /**
   * Handle WebSocket close
   * @private
   */
  _onClose() {
    DEBUG && console.log('[RealtimeService] WebSocket closed');
    
    this.metrics.disconnectionTime = Date.now();
    this._cleanup();

    // Don't reconnect if manually closed
    if (this.isManualClose) {
      this.connectionStatus = 'disconnected';
      this.emit('statusChange', { status: 'disconnected' });
      return;
    }

    // Attempt reconnection
    this._scheduleReconnect();
  }

  /**
   * Send message over WebSocket
   * @param {Object} payload
   * @returns {boolean}
   * @private
   */
  _sendMessage(payload) {
    if (!this._isConnected()) {
      console.warn('[RealtimeService] Not connected, queuing message');
      this._queueMessage(payload);
      return false;
    }

    try {
      const message = JSON.stringify(payload);
      this.ws.send(message);
      
      this.metrics.messagesSent++;
      this.metrics.totalBytesSent += message.length;
      
      DEBUG && console.log('[RealtimeService] Message sent:', payload.type);
      return true;
    } catch (error) {
      console.error('[RealtimeService] Send error:', error);
      this.metrics.messagesFailed++;
      this._queueMessage(payload);
      return false;
    }
  }

  /**
   * Queue message for when connection is restored
   * @param {Object} message
   * @private
   */
  _queueMessage(message) {
    if (this.messageQueue.length >= this.maxQueuedMessages) {
      DEBUG && console.warn('[RealtimeService] Message queue full, dropping oldest');
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
    DEBUG && console.log('[RealtimeService] Message queued', {
      queueSize: this.messageQueue.length,
    });
  }

  /**
   * Flush queued messages on reconnect
   * @private
   */
  async _flushMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    DEBUG && console.log('[RealtimeService] Flushing', this.messageQueue.length, 'queued messages');
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      if (!this._sendMessage(message)) {
        // Re-queue if failed
        this._queueMessage(message);
      }
      // Small delay between messages to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isProcessingQueue = false;
    DEBUG && console.log('[RealtimeService] Queue flushed');
  }

  /**
   * Schedule reconnection with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    if (this.connectionAttempts >= this.reconnectConfig.maxAttempts) {
      console.error('[RealtimeService] Max reconnection attempts reached');
      this.connectionStatus = 'failed';
      this.emit('statusChange', { status: 'failed' });
      this.emit('error', {
        code: 'MAX_RECONNECT_FAILED',
        message: 'Failed to reconnect after maximum attempts',
      });
      return;
    }

    this.connectionStatus = 'reconnecting';
    this.connectionAttempts++;

    // Calculate exponential backoff with optional jitter
    let delay = this.reconnectConfig.initialDelay * 
                Math.pow(this.reconnectConfig.multiplier, this.connectionAttempts - 1);
    
    delay = Math.min(delay, this.reconnectConfig.maxDelay);
    
    // Add jitter to prevent thundering herd problem
    if (this.reconnectConfig.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += Math.random() * jitterAmount - jitterAmount / 2;
    }

    delay = Math.max(delay, 100); // Minimum 100ms

    const delaySeconds = (delay / 1000).toFixed(2);
    DEBUG && console.log(
      `[RealtimeService] Scheduling reconnect in ${delaySeconds}s (attempt ${this.connectionAttempts}/${this.reconnectConfig.maxAttempts})`
    );

    this.emit('statusChange', {
      status: 'reconnecting',
      attempt: this.connectionAttempts,
      nextRetryIn: delay,
    });

    setTimeout(() => {
      if (this.connectionStatus === 'reconnecting') {
        DEBUG && console.log('[RealtimeService] Attempting reconnect...');
        this.metrics.reconnectAttempts++;
        this.connect(this.token, this.sessionId);
      }
    }, delay);
  }

  /**
   * Start heartbeat/keepalive
   * @private
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this._isConnected()) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
          DEBUG && console.log('[RealtimeService] Heartbeat sent');
        } catch (error) {
          console.error('[RealtimeService] Heartbeat error:', error);
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   * @private
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Cleanup resources
   * @private
   */
  _cleanup() {
    this._stopHeartbeat();
    this.ws = null;
    this.subscriptionRooms.clear();
  }
}

// Create singleton instance
const realtimeService = new RealtimeService();

export default realtimeService;
