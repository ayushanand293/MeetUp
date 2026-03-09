# Week 2 & 3 Mobile Implementation - Step by Step

**Goal**: Build full real-time location sharing map with WebSocket integration  
**Estimated Time**: 8-10 days total  
**Backend Status**: ✅ Ready to use

---

## Part 0: Setup & Dependencies

### Step 0.1: Install Required Packages

```bash
cd mobile

# Location services
npm install expo-location

# Map library (react-native-maps is more mature & feature-rich)
npm install react-native-maps
npm install react-native-svg

# Optional: For better error handling
npm install axios
```

### Step 0.2: Update app.json (Already Done ✅)
Your app.json is already configured with MeetUp branding.

### Step 0.3: Verify Backend is Running

```bash
# In project root
docker-compose up -d
docker-compose exec backend python seed.py

# You'll see output like:
# 🔑 SESSION ID: <UUID>
# 👤 USER 1 (Alice): Token: <JWT>
# 👤 USER 2 (Bob): Token: <JWT>
```

Save these credentials - you'll need them for testing!

---

## Part 1: Location Services (Day 1-2)

### Step 1.1: Create `mobile/src/services/locationService.js`

**File**: `mobile/src/services/locationService.js`

```javascript
import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';

class LocationService {
  constructor() {
    this.watcher = null;
    this.currentLocation = null;
    this.listeners = []; // For subscribers
  }

  /**
   * Request location permission from user
   * @returns {boolean} - true if permission granted
   */
  async requestPermission() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to use MeetUp. Please enable it in settings.'
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      Alert.alert('Error', 'Failed to request location permission');
      return false;
    }
  }

  /**
   * Check if location services are enabled
   */
  async checkLocationEnabled() {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(
          'Location Disabled',
          'Please enable location services on your device.'
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Location check error:', error);
      return true; // Continue anyway
    }
  }

  /**
   * Get current user location once
   * @returns {object} - {lat, lon, accuracy_m} or null if error
   */
  async getCurrentLocation() {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, accuracy } = location.coords;
      this.currentLocation = {
        lat: latitude,
        lon: longitude,
        accuracy_m: accuracy || 10,
        timestamp: new Date().toISOString(),
      };

      return this.currentLocation;
    } catch (error) {
      console.error('Get location error:', error);
      // Return mock location for testing (Bangalore, India)
      return {
        lat: 12.9716,
        lon: 77.5946,
        accuracy_m: 50,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Start watching location every 2 seconds
   * @param {function} onLocationChange - Callback when location updates
   */
  async startTracking(onLocationChange) {
    try {
      // Test permission first
      const hasPermission = await this.requestPermission();
      if (!hasPermission) return false;

      const enabled = await this.checkLocationEnabled();
      if (!enabled) return false;

      // Watch position every 2 seconds (2000ms)
      this.watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 5, // Update if moved 5 meters
        },
        (location) => {
          const { latitude, longitude, accuracy } = location.coords;
          this.currentLocation = {
            lat: latitude,
            lon: longitude,
            accuracy_m: accuracy || 10,
            timestamp: new Date().toISOString(),
          };

          // Notify all listeners
          if (onLocationChange) {
            onLocationChange(this.currentLocation);
          }
        }
      );

      return true;
    } catch (error) {
      console.error('Start tracking error:', error);
      Alert.alert('Error', 'Failed to start location tracking');
      return false;
    }
  }

  /**
   * Stop tracking location
   */
  stopTracking() {
    if (this.watcher) {
      this.watcher.remove();
      this.watcher = null;
    }
  }

  /**
   * Get last known location
   */
  getLastLocation() {
    return this.currentLocation;
  }

  /**
   * Subscribe to location changes
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }
}

// Singleton instance
const locationService = new LocationService();
export default locationService;
```

**Test this**:
```javascript
// Test in console:
import locationService from './services/locationService';
const loc = await locationService.getCurrentLocation();
console.log(loc); // Should print {lat, lon, accuracy_m, timestamp}
```

---

### Step 1.2: Test Location Service in a Screen

Create a test component first (optional):

```javascript
// mobile/src/screens/TestLocationScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import locationService from '../services/locationService';

const TestLocationScreen = () => {
  const [location, setLocation] = useState(null);

  const handleGetLocation = async () => {
    const loc = await locationService.getCurrentLocation();
    setLocation(loc);
  };

  const handleStartTracking = async () => {
    await locationService.startTracking((loc) => {
      setLocation(loc);
      console.log('Updated location:', loc);
    });
  };

  const handleStopTracking = () => {
    locationService.stopTracking();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Test</Text>
      {location && (
        <View style={styles.info}>
          <Text>Lat: {location.lat.toFixed(4)}</Text>
          <Text>Lon: {location.lon.toFixed(4)}</Text>
          <Text>Accuracy: {location.accuracy_m.toFixed(0)}m</Text>
          <Text>Time: {location.timestamp}</Text>
        </View>
      )}
      <Button title="Get Current" onPress={handleGetLocation} />
      <Button title="Start Tracking" onPress={handleStartTracking} />
      <Button title="Stop Tracking" onPress={handleStopTracking} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  info: { marginBottom: 20, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8 },
});

export default TestLocationScreen;
```

---

## Part 2: WebSocket Real-time Service (Day 2-4)

### Step 2.1: Create `mobile/src/services/realtimeService.js`

**File**: `mobile/src/services/realtimeService.js`

```javascript
import { Alert } from 'react-native';

/**
 * Real-time WebSocket service for location sharing
 * Handles connection, reconnection, message sending/receiving
 */
class RealtimeService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.token = null;
    this.sessionId = null;
    
    // State
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000; // Start with 3 seconds
    
    // Message queue for offline
    this.messageQueue = [];
    
    // Event listeners
    this.listeners = {
      onConnected: null,
      onDisconnected: null,
      onReconnecting: null,
      onPeerLocation: null,
      onPresenceUpdate: null,
      onSessionEnded: null,
      onError: null,
    };
  }

  /**
   * Connect to WebSocket
   * @param {string} token - JWT token
   * @param {string} sessionId - Session UUID
   * @param {string} baseUrl - Backend URL (default: http://localhost:8000)
   */
  connect(token, sessionId, baseUrl = 'http://localhost:8000') {
    // Convert http/https to ws/wss
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    this.url = `${wsUrl}/api/v1/ws/meetup?token=${token}&session_id=${sessionId}`;
    this.token = token;
    this.sessionId = sessionId;

    console.log('🔌 Connecting to WebSocket:', this.url);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => this._onOpen();
      this.ws.onmessage = (event) => this._onMessage(event);
      this.ws.onerror = (error) => this._onError(error);
      this.ws.onclose = () => this._onClose();
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this._callListener('onError', {
        code: 'CONNECTION_FAILED',
        message: error.message,
      });
      this._scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    console.log('❌ Disconnecting WebSocket');
    this.connected = false;
    this.reconnecting = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send location update to peers
   * @param {number} lat
   * @param {number} lon
   * @param {number} accuracy_m
   */
  sendLocationUpdate(lat, lon, accuracy_m = 10) {
    if (!this.connected) {
      console.warn('⚠️ WebSocket not connected, queuing message');
      this.messageQueue.push({ lat, lon, accuracy_m });
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

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('Send location error:', error);
      return false;
    }
  }

  /**
   * Send end session signal
   */
  endSession(reason = 'USER_ACTION') {
    const payload = {
      type: 'end_session',
      payload: { reason },
    };

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('End session error:', error);
      return false;
    }
  }

  /**
   * Register event listener
   * Usage: realtimeService.on('onPeerLocation', (data) => {...})
   */
  on(event, callback) {
    if (this.listeners.hasOwnProperty(event)) {
      this.listeners[event] = callback;
    }
  }

  /**
   * Unregister event listener
   */
  off(event) {
    if (this.listeners.hasOwnProperty(event)) {
      this.listeners[event] = null;
    }
  }

  // ===== PRIVATE METHODS =====

  _onOpen() {
    console.log('✅ WebSocket connected');
    this.connected = true;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this._callListener('onConnected');

    // Flush queued messages
    while (this.messageQueue.length > 0) {
      const { lat, lon, accuracy_m } = this.messageQueue.shift();
      this.sendLocationUpdate(lat, lon, accuracy_m);
    }
  }

  _onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 WebSocket message:', data.type);

      switch (data.type) {
        case 'presence_update':
          this._callListener('onPresenceUpdate', data.payload);
          break;

        case 'peer_location':
          this._callListener('onPeerLocation', data.payload);
          break;

        case 'session_ended':
          this._callListener('onSessionEnded', data.payload);
          this.disconnect();
          break;

        case 'error':
          console.error('Server error:', data.payload);
          this._callListener('onError', data.payload);
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Message parsing error:', error);
    }
  }

  _onError(error) {
    console.error('❌ WebSocket error:', error);
    this._callListener('onError', {
      code: 'WS_ERROR',
      message: error.message || 'WebSocket error occurred',
    });
  }

  _onClose() {
    console.log('🔌 WebSocket closed');
    this.connected = false;

    if (!this.reconnecting) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this._callListener('onError', {
        code: 'MAX_RECONNECT_FAILED',
        message: 'Failed to reconnect after multiple attempts',
      });
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    this._callListener('onReconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    console.log(
      `⏱️  Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (this.reconnecting) {
        this.connect(this.token, this.sessionId);
      }
    }, this.reconnectDelay);
  }

  _callListener(event, data = null) {
    if (this.listeners[event]) {
      try {
        this.listeners[event](data);
      } catch (error) {
        console.error(`Error in listener ${event}:`, error);
      }
    }
  }

  getStatus() {
    return {
      connected: this.connected,
      reconnecting: this.reconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
    };
  }
}

// Singleton instance
const realtimeService = new RealtimeService();
export default realtimeService;
```

**Test this**:
```javascript
// In a screen or useEffect:
import realtimeService from './services/realtimeService';

realtimeService.on('onConnected', () => {
  console.log('✅ Connected!');
});

realtimeService.on('onPeerLocation', (data) => {
  console.log('📍 Peer location:', data);
});

// Connect with test credentials
realtimeService.connect(TOKEN_ALICE, SESSION_ID);

// Send a test location after connection
setTimeout(() => {
  realtimeService.sendLocationUpdate(37.7749, -122.4194);
}, 1000);
```

---

## Part 3: Rewrite ActiveSessionScreen with Map (Day 4-6)

### Step 3.1: Replace `mobile/src/screens/ActiveSessionScreen.js`

**File**: `mobile/src/screens/ActiveSessionScreen.js` (COMPLETE REWRITE)

```javascript
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import locationService from '../services/locationService';
import realtimeService from '../services/realtimeService';
import client from '../api/client';

const ActiveSessionScreen = ({ route, navigation }) => {
  const { friend } = route.params || {};

  // State
  const [myLocation, setMyLocation] = useState(null);
  const [peerLocation, setPeerLocation] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected', 'reconnecting', 'disconnected'
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);

  const mapRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const locationUnsubscribeRef = useRef(null);

  useEffect(() => {
    initializeSession();
    return cleanup;
  }, []);

  // Initialize: get session, start location tracking, connect WebSocket
  const initializeSession = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Get active session from backend
      const sessionResponse = await client.get('/sessions/active');
      const activeSession = sessionResponse.data;

      if (!activeSession) {
        throw new Error('No active session found');
      }

      setSessionId(activeSession.session_id);

      // 2. Start location tracking
      const started = await locationService.startTracking((location) => {
        setMyLocation(location);
        console.log('📍 My location:', location);
      });

      if (!started) {
        throw new Error('Failed to start location tracking');
      }

      // 3. Get initial location
      const initialLocation = await locationService.getCurrentLocation();
      setMyLocation(initialLocation);

      // 4. Connect WebSocket
      const { data: session } = await client.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No auth token available');
      }

      connectWebSocket(session.access_token, activeSession.session_id);

      setIsLoading(false);
    } catch (err) {
      console.error('Initialization error:', err);
      setError(err.message || 'Failed to initialize session');
      setIsLoading(false);
      Alert.alert('Error', err.message || 'Failed to initialize session');
    }
  };

  // Connect to WebSocket and set up listeners
  const connectWebSocket = (token, sid) => {
    realtimeService.on('onConnected', () => {
      console.log('✅ WebSocket connected');
      setConnectionStatus('connected');
    });

    realtimeService.on('onReconnecting', (data) => {
      console.log(`⏱️ Reconnecting... attempt ${data.attempt}/${data.maxAttempts}`);
      setConnectionStatus('reconnecting');
    });

    realtimeService.on('onPeerLocation', (payload) => {
      console.log('📍 Peer location received:', payload);
      setPeerLocation({
        user_id: payload.user_id,
        lat: payload.lat,
        lon: payload.lon,
        accuracy_m: payload.accuracy_m,
        timestamp: payload.timestamp,
      });
    });

    realtimeService.on('onPresenceUpdate', (payload) => {
      console.log('👥 Presence update:', payload);
      if (payload.status === 'offline') {
        setPeerLocation(null);
        Alert.alert('Peer Offline', 'Your peer has disconnected');
      }
    });

    realtimeService.on('onSessionEnded', (payload) => {
      console.log('🛑 Session ended:', payload);
      Alert.alert('Session Ended', `Reason: ${payload.reason}`);
      cleanup();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    });

    realtimeService.on('onError', (payload) => {
      console.error('🔴 WebSocket error:', payload);
      setError(`Error: ${payload.message}`);
      if (payload.code === 'RAT_LIMIT_EXCEEDED') {
        Alert.alert('Rate Limited', 'Sending updates too fast');
      }
    });

    // Connect
    realtimeService.connect(token, sid);

    // Start streaming location every 2 seconds
    startLocationStreaming();
  };

  // Stream location updates every 2 seconds
  const startLocationStreaming = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    locationIntervalRef.current = setInterval(() => {
      if (realtimeService.getStatus().connected && myLocation) {
        realtimeService.sendLocationUpdate(
          myLocation.lat,
          myLocation.lon,
          myLocation.accuracy_m
        );
      }
    }, 2000); // Every 2 seconds
  };

  // Handle end session
  const handleEndSession = async () => {
    Alert.alert(
      'End Session',
      'Are you sure you want to end this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              // Send WebSocket signal
              realtimeService.endSession('USER_ACTION');

              // Notify backend
              if (sessionId) {
                await client.post(`/sessions/${sessionId}/end`, {
                  reason: 'USER_ACTION',
                });
              }

              cleanup();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            } catch (err) {
              Alert.alert('Error', 'Failed to end session');
            }
          },
        },
      ]
    );
  };

  // Cleanup
  const cleanup = () => {
    console.log('🧹 Cleaning up...');
    
    // Stop location tracking
    locationService.stopTracking();
    if (locationUnsubscribeRef.current) {
      locationUnsubscribeRef.current();
    }

    // Stop location streaming
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    // Disconnect WebSocket
    realtimeService.disconnect();
  };

  // Calculate center point for map
  const getCenterCoordinate = () => {
    if (myLocation) {
      return {
        latitude: myLocation.lat,
        longitude: myLocation.lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    // Default to San Francisco
    return {
      latitude: 37.7749,
      longitude: -122.4194,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={getCenterCoordinate()}
        provider="google"
      >
        {/* My Location Marker */}
        {myLocation && (
          <>
            {/* Accuracy Circle */}
            <Circle
              center={{ latitude: myLocation.lat, longitude: myLocation.lon }}
              radius={myLocation.accuracy_m}
              fillColor="rgba(0, 122, 255, 0.1)"
              strokeColor="rgba(0, 122, 255, 0.3)"
              strokeWidth={1}
            />
            {/* My Marker */}
            <Marker
              coordinate={{
                latitude: myLocation.lat,
                longitude: myLocation.lon,
              }}
              title="You"
              description={`Accuracy: ${myLocation.accuracy_m.toFixed(0)}m`}
              pinColor="#007AFF"
            />
          </>
        )}

        {/* Peer Location Marker */}
        {peerLocation && (
          <>
            {/* Peer Accuracy Circle */}
            <Circle
              center={{
                latitude: peerLocation.lat,
                longitude: peerLocation.lon,
              }}
              radius={peerLocation.accuracy_m}
              fillColor="rgba(34, 197, 94, 0.1)"
              strokeColor="rgba(34, 197, 94, 0.3)"
              strokeWidth={1}
            />
            {/* Peer Marker */}
            <Marker
              coordinate={{
                latitude: peerLocation.lat,
                longitude: peerLocation.lon,
              }}
              title={friend?.name || 'Peer'}
              description={`Accuracy: ${peerLocation.accuracy_m.toFixed(0)}m`}
              pinColor="#22C55E"
            />
          </>
        )}
      </MapView>

      {/* Connection Status Badge */}
      <View
        style={[
          styles.statusBadge,
          connectionStatus === 'connected'
            ? styles.statusConnected
            : connectionStatus === 'reconnecting'
            ? styles.statusReconnecting
            : styles.statusDisconnected,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            connectionStatus === 'connected' && styles.dotGreen,
            connectionStatus === 'reconnecting' && styles.dotOrange,
            connectionStatus === 'disconnected' && styles.dotRed,
          ]}
        />
        <Text style={styles.statusText}>
          {connectionStatus === 'connected'
            ? 'Connected'
            : connectionStatus === 'reconnecting'
            ? 'Reconnecting...'
            : 'Disconnected'}
        </Text>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomPanel}>
        {friend && (
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{friend.name || 'Peer'}</Text>
            <Text style={styles.friendEmail}>{friend.email || 'Unknown'}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.endSessionButton}
          onPress={handleEndSession}
        >
          <Text style={styles.endSessionText}>End Session</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  statusBadge: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusConnected: {
    backgroundColor: '#E8F5E9',
  },
  statusReconnecting: {
    backgroundColor: '#FFF3E0',
  },
  statusDisconnected: {
    backgroundColor: '#FFEBEE',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  dotGreen: {
    backgroundColor: '#34C759',
  },
  dotOrange: {
    backgroundColor: '#FF9500',
  },
  dotRed: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    borderColor: '#FF3B30',
    borderWidth: 1,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomPanel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  friendInfo: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomColor: '#f0f0f0',
    borderBottomWidth: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 14,
    color: '#999',
  },
  endSessionButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  endSessionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ActiveSessionScreen;
```

---

## Part 4: Week 2 Testing

### Test Checklist

- [ ] **Location Permission**: App requests permission on first launch
- [ ] **Location Tracking**: Displays blue marker at device location
- [ ] **WebSocket Connection**: Shows "Connected" badge after session starts
- [ ] **Location Streaming**: Sends location every 2s to backend
- [ ] **Peer Marker**: Green marker appears when peer connects (use web client)
- [ ] **Peer Updates**: Green marker moves when peer moves (with <2s delay)
- [ ] **Connection Status**: Badge reflects state (green/orange/red)
- [ ] **End Session**: Button navigates back to home
- [ ] **Error Display**: Error messages show if WS fails
- [ ] **Map Interaction**: Can pan/zoom map without issues

### Test Script

```bash
# Terminal 1: Start backend
docker-compose up -d
docker-compose exec backend python seed.py
# Note: SESSION_ID, TOKEN_ALICE, TOKEN_BOB

# Terminal 2: Start mobile app
cd mobile
npm start
# Select iOS simulator or Android

# Browser: Open web/client.html
# Paste SESSION_ID and TOKEN_ALICE
# Click Connect

# Mobile: Login, navigate to accept request
# Accept a test request to start session
# Both should connect and see each other

# Verify:
# 1. Web shows blue marker (you) and green marker (peer from mobile)
# 2. Mobile shows blue marker (you) and green marker (peer from web)
# 3. Move around / move web marker manually
# 4. Both update in real-time
```

---

## Part 5: Week 3 Enhancements

### Task 5.1: Exponential Backoff Reconnection

Update `mobile/src/services/realtimeService.js`:

Replace the reconnection logic:

```javascript
// In realtimeService.js, update the constants and _scheduleReconnect method:

class RealtimeService {
  constructor() {
    // ... existing code ...
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Cap at 30 seconds
    this.reconnectMultiplier = 2; // Double each time
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this._callListener('onError', {
        code: 'MAX_RECONNECT_FAILED',
        message: 'Failed to reconnect after multiple attempts',
      });
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    // Calculate exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    let delay = this.reconnectDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts - 1);
    delay = Math.min(delay, this.maxReconnectDelay);

    this._callListener('onReconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      nextRetryIn: delay / 1000, // Convert to seconds
    });

    console.log(
      `⏱️  Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (this.reconnecting) {
        // Resubscribe to session room on reconnect
        console.log('🔄 Attempting to reconnect...');
        this.connect(this.token, this.sessionId);
      }
    }, delay);
  }
}
```

Update the status badge to show retry countdown (optional):

```javascript
// In ActiveSessionScreen.js, add a timer display for reconnecting state:

const [retryCountdown, setRetryCountdown] = useState(0);

realtimeService.on('onReconnecting', (data) => {
  setConnectionStatus('reconnecting');
  setRetryCountdown(data.nextRetryIn);
  
  // Count down
  const interval = setInterval(() => {
    setRetryCountdown((prev) => {
      if (prev <= 0.5) {
        clearInterval(interval);
        return 0;
      }
      return prev - 0.1;
    });
  }, 100);
});

// Update status badge text:
{connectionStatus === 'reconnecting'
  ? `Reconnecting... ${retryCountdown.toFixed(1)}s`
  : 'Reconnecting...'}
```

---

### Task 5.2: Last-Seen Timestamp Display

Update `realtimeService.js` to track timestamps:

```javascript
class RealtimeService {
  constructor() {
    // ... existing code ...
    this.peerLastSeen = null;
  }

  _onMessage(event) {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'peer_location':
          // Update last seen
          this.peerLastSeen = {
            timestamp: new Date(data.payload.timestamp),
            userId: data.payload.user_id,
          };
          this._callListener('onPeerLocation', {
            ...data.payload,
            lastSeenAt: this.peerLastSeen.timestamp,
          });
          break;
        // ... other cases ...
      }
    } catch (error) {
      console.error('Message parsing error:', error);
    }
  }

  getPeerLastSeen() {
    return this.peerLastSeen;
  }
}
```

Update `ActiveSessionScreen.js` to show last-seen:

```javascript
const [peerLastSeenText, setPeerLastSeenText] = useState('Just now');
const [peerIsStale, setPeerIsStale] = useState(false);

realtimeService.on('onPeerLocation', (payload) => {
  console.log('📍 Peer location:', payload);
  setPeerLocation({
    user_id: payload.user_id,
    lat: payload.lat,
    lon: payload.lon,
    accuracy_m: payload.accuracy_m,
    timestamp: payload.timestamp,
    lastSeenAt: payload.lastSeenAt,
  });
  setPeerLastSeenText('Just now');
  setPeerIsStale(false);
});

// Update last-seen text every second
useEffect(() => {
  const interval = setInterval(() => {
    if (!peerLocation?.lastSeenAt) return;

    const now = new Date();
    const lastSeen = new Date(peerLocation.lastSeenAt);
    const diffSeconds = Math.floor((now - lastSeen) / 1000);

    if (diffSeconds < 60) {
      setPeerLastSeenText(`${diffSeconds}s ago`);
    } else {
      setPeerLastSeenText(`${Math.floor(diffSeconds / 60)}m ago`);
    }

    // Show warning if stale (>5 seconds)
    setPeerIsStale(diffSeconds > 5);
  }, 1000);

  return () => clearInterval(interval);
}, [peerLocation]);

// Update friend info display:
<View style={styles.friendInfo}>
  <Text style={styles.friendName}>{friend?.name || 'Peer'}</Text>
  <Text style={styles.friendEmail}>{friend?.email || 'Unknown'}</Text>
  <Text style={[styles.lastSeen, peerIsStale && styles.lastSeenStale]}>
    {peerLocation
      ? `Last seen: ${peerLastSeenText}`
      : 'Waiting for peer location...'}
  </Text>
  {peerIsStale && (
    <Text style={styles.staleWarning}>⚠️ Location might be outdated</Text>
  )}
</View>

// Add styles:
lastSeen: {
  fontSize: 12,
  color: '#666',
  marginTop: 4,
},
lastSeenStale: {
  color: '#FF9500',
  fontWeight: '600',
},
staleWarning: {
  fontSize: 11,
  color: '#FF9500',
  marginTop: 4,
  fontWeight: '500',
},
```

---

## 📝 Summary of Implementation

### Week 2 (4 days)
1. ✅ Location permissions & continuous tracking
2. ✅ WebSocket connection with simple reconnect
3. ✅ Location streaming every 2s
4. ✅ Map display with self + peer markers
5. ✅ Connection status badge
6. ✅ End session button

### Week 3 (2 days)
1. ✅ Exponential backoff reconnection
2. ✅ Last-seen timestamp display
3. ✅ Stale data warning

---

## 🧪 Final Testing Checklist

- [ ] Mobile connects to active session
- [ ] Shows "Connected" immediately
- [ ] Location updates visible on web client in real-time
- [ ] Web updates visible on mobile in real-time
- [ ] Disconnect internet → shows "Reconnecting" with countdown
- [ ] Reconnect internet → automatically reestablishes connection
- [ ] Last-seen timestamp updates every second
- [ ] Warning shows if peer location >5s old
- [ ] End session clears everything
- [ ] No crashes or memory leaks

---

## Git Commit Structure

```bash
git checkout -b feat/mobile-week2-realtime

# Commit 1
git add mobile/src/services/locationService.js
git commit -m "feat(mobile): add location permission + continuous tracking"

# Commit 2
git add mobile/src/services/realtimeService.js
git commit -m "feat(mobile): add WebSocket client with reconnect logic"

# Commit 3
git add mobile/src/screens/ActiveSessionScreen.js
git commit -m "feat(mobile): implement map view with self + peer markers"

# Commit 4 (Week 3)
git commit -am "feat(mobile): add exponential backoff reconnection"

# Commit 5 (Week 3)
git commit -am "feat(mobile): add last-seen timestamp + stale warning"

git push origin feat/mobile-week2-realtime
# Create PR for review
```

