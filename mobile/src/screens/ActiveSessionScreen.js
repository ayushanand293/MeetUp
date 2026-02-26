/**
 * ActiveSessionScreen - Real-time location sharing map view
 * 
 * Features:
 * - Real-time map with self and peer markers
 * - GPS tracking with permission handling
 * - WebSocket real-time updates
 * - Connection status indicator
 * - Last-seen timestamp for peer
 * - Error handling and recovery
 * - Proper resource cleanup
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import locationService from '../services/locationService';
import realtimeService from '../services/realtimeService';
import client from '../api/client';

const DEBUG = process.env.NODE_ENV !== 'production';

const ActiveSessionScreen = ({ route, navigation }) => {
  const { friend } = route.params || {};
  const { user } = useAuth();

  // Location state
  const [myLocation, setMyLocation] = useState(null);
  const [peerLocation, setPeerLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // WebSocket state
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [wsError, setWsError] = useState(null);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);

  // Peer info
  const [peerLastSeenText, setPeerLastSeenText] = useState('Not yet connected');
  const [peerIsStale, setPeerIsStale] = useState(false);

  // Refs for cleanup
  const webViewRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const lastSeenUpdateRef = useRef(null);
  const locationUnsubscribeRef = useRef(null);
  const wsEventUnsubscribesRef = useRef({});
  const countdownIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  /**
   * Initialize session and start services
   */
  useEffect(() => {
    if (!isMountedRef.current) return;
    
    const initializeSession = async () => {
      try {
        setIsLoading(true);
        setLocationError(null);
        setWsError(null);

        // 1. Try to get active session from backend
        DEBUG && console.log('[ActiveSessionScreen] Fetching active session...');
        let activeSession = null;
        let isDemo = false;
        
        try {
          const sessionResponse = await client.get('/sessions/active');
          activeSession = sessionResponse.data;
        } catch (error) {
          console.warn('[ActiveSessionScreen] Backend not available, starting in demo mode');
          isDemo = true;
          // Generate demo session
          activeSession = {
            session_id: 'demo_' + Math.random().toString(36).substr(2, 9),
          };
        }

        if (!activeSession) {
          throw new Error('No active session found');
        }

        setSessionId(activeSession.session_id);

        // 2. Request location permission
        DEBUG && console.log('[ActiveSessionScreen] Requesting location permission...');
        const hasPermission = await locationService.requestPermission();
        if (!hasPermission) {
          throw new Error('Location permission required to share your location');
        }

        // 3. Start location tracking
        DEBUG && console.log('[ActiveSessionScreen] Starting location tracking...');
        const trackingStarted = await locationService.startTracking((location) => {
          if (!isMountedRef.current) return;
          setMyLocation(location);
        });

        if (!trackingStarted) {
          throw new Error('Failed to start location tracking');
        }

        // 4. Get initial location
        const initialLocation = await locationService.getCurrentLocation();
        if (initialLocation) {
          setMyLocation(initialLocation);
        }

        // 5. Connect WebSocket only if not in demo mode and have auth
        if (!isDemo) {
          DEBUG && console.log('[ActiveSessionScreen] Connecting WebSocket...');
          const { data: session } = await client.auth.getSession();
          if (!session?.access_token) {
            console.warn('[ActiveSessionScreen] No auth token, running in demo mode');
            isDemo = true;
          } else {
            // Subscribe to WebSocket events
            _subscribeToWsEvents();
            
            await realtimeService.connect(
              session.access_token,
              activeSession.session_id,
              'http://localhost:8000'
            );
            
            DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
          }
        }

        if (isDemo) {
          // Demo mode: Simulate peer location updates
          DEBUG && console.log('[ActiveSessionScreen] Running in demo mode');
          
          // Subscribe to WS events for demo simulation
          _subscribeToWsEvents();
          
          // Simulate peer location
          setPeerLocation({
            lat: 37.7849,
            lon: -122.4094,
            accuracy_m: 50,
            receivedAt: new Date()
          });
          
          // Simulate connection status
          setWsStatus('connected');
        }

        setIsLoading(false);
      } catch (error) {
        console.error('[ActiveSessionScreen] Initialization error:', error);
        if (!isMountedRef.current) return;
        
        setLocationError(error.message || 'Failed to initialize session');
        setIsLoading(false);
        
        Alert.alert('Error', error.message || 'Failed to initialize session', [
          {
            text: 'Go Back',
            onPress: () => {
              _cleanup();
              navigation.goBack();
            },
          },
        ]);
      }
    };

    initializeSession();

    return () => {
      // Cleanup will be called separately
    };
  }, []);

  /**
   * Subscribe to WebSocket events
   */
  const _subscribeToWsEvents = useCallback(() => {
    const unsubscribes = {};

    unsubscribes.onConnected = realtimeService.on('connected', () => {
      DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
      if (!isMountedRef.current) return;
      setWsStatus('connected');
      setWsError(null);
      setReconnectCountdown(0);
    });

    unsubscribes.onStatusChange = realtimeService.on('statusChange', (data) => {
      DEBUG && console.log('[ActiveSessionScreen] WS status changed:', data.status);
      if (!isMountedRef.current) return;
      setWsStatus(data.status);
      
      if (data.status === 'reconnecting' && data.nextRetryIn) {
        setReconnectCountdown(Math.ceil(data.nextRetryIn / 1000));
      }
    });

    unsubscribes.onPeerLocation = realtimeService.on('peerLocation', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Peer location received');
      if (!isMountedRef.current) return;
      
      setPeerLocation({
        user_id: payload.user_id,
        lat: payload.lat,
        lon: payload.lon,
        accuracy_m: payload.accuracy_m,
        timestamp: payload.timestamp,
        receivedAt: new Date(),
      });

      setPeerLastSeenText('Just now');
      setPeerIsStale(false);
    });

    unsubscribes.onPresenceUpdate = realtimeService.on('presenceUpdate', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Presence update:', payload.status);
      if (!isMountedRef.current) return;
      
      if (payload.status === 'offline') {
        setPeerLocation(null);
        setPeerLastSeenText('Offline');
        Alert.alert('Peer Offline', 'Your peer has disconnected. But you can still see their last location.');
      }
    });

    unsubscribes.onSessionEnded = realtimeService.on('sessionEnded', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Session ended:', payload.reason);
      if (!isMountedRef.current) return;
      
      _cleanup();
      Alert.alert('Session Ended', `Reason: ${payload.reason}`, [
        {
          text: 'OK',
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Home' }],
            });
          },
        },
      ]);
    });

    unsubscribes.onError = realtimeService.on('error', (payload) => {
      console.error('[ActiveSessionScreen] WS error:', payload);
      if (!isMountedRef.current) return;
      
      setWsError(`Error: ${payload.message}`);
      
      if (payload.code === 'RATE_LIMIT_EXCEEDED') {
        Alert.alert('Rate Limited', 'Location updates are being sent too fast. Please slow down.');
      }
    });

    wsEventUnsubscribesRef.current = unsubscribes;
  }, []);

  /**
   * Location streaming loop
   */
  useEffect(() => {
    if (!myLocation || wsStatus !== 'connected') return;

    DEBUG && console.log('[ActiveSessionScreen] Starting location streaming');

    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    locationIntervalRef.current = setInterval(() => {
      if (realtimeService.getStatus().connected && myLocation) {
        const sent = realtimeService.sendLocationUpdate(
          myLocation.lat,
          myLocation.lon,
          myLocation.accuracy_m
        );
        DEBUG && sent && console.log('[ActiveSessionScreen] Location update sent');
      }
    }, 2000); // Every 2 seconds

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [myLocation, wsStatus]);

  /**
   * Update map when locations change
   */
  useEffect(() => {
    if (webViewRef.current && (myLocation || peerLocation)) {
      const mapData = JSON.stringify({
        myLocation,
        peerLocation
      });
      webViewRef.current.injectJavaScript(
        `window.updateMap('${mapData.replace(/'/g, "\\'")}');`
      );
    }
  }, [myLocation, peerLocation]);

  /**
   * Update "last seen" text every second
   */
  useEffect(() => {
    if (!peerLocation?.receivedAt) return;

    if (lastSeenUpdateRef.current) {
      clearInterval(lastSeenUpdateRef.current);
    }

    lastSeenUpdateRef.current = setInterval(() => {
      if (!isMountedRef.current) return;

      const now = new Date();
      const lastSeen = peerLocation.receivedAt;
      const diffSeconds = Math.floor((now - lastSeen) / 1000);

      if (diffSeconds < 60) {
        setPeerLastSeenText(`${diffSeconds}s ago`);
      } else {
        setPeerLastSeenText(`${Math.floor(diffSeconds / 60)}m ago`);
      }

      // Show warning if stale (>5 seconds)
      setPeerIsStale(diffSeconds > 5);
    }, 1000);

    return () => {
      if (lastSeenUpdateRef.current) {
        clearInterval(lastSeenUpdateRef.current);
      }
    };
  }, [peerLocation?.receivedAt]);

  /**
   * Update reconnect countdown
   */
  useEffect(() => {
    if (reconnectCountdown <= 0) return;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setReconnectCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [reconnectCountdown]);

  /**
   * Handle end session
   */
  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End Session',
      'Are you sure you want to end this meeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsStopping(true);

              // Signal via WebSocket
              realtimeService.endSession('USER_ACTION');

              // Notify backend
              if (sessionId) {
                await client.post(`/sessions/${sessionId}/end`, {
                  reason: 'USER_ACTION',
                });
              }

              _cleanup();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            } catch (error) {
              console.error('[ActiveSessionScreen] End session error:', error);
              Alert.alert('Error', 'Failed to end session');
              setIsStopping(false);
            }
          },
        },
      ]
    );
  }, [sessionId, navigation]);

  /**
   * Cleanup all resources
   */
  const _cleanup = useCallback(() => {
    DEBUG && console.log('[ActiveSessionScreen] Cleaning up resources...');

    // Stop tracking
    locationService.stopTracking();
    if (locationUnsubscribeRef.current) {
      locationUnsubscribeRef.current();
    }

    // Clear intervals
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    if (lastSeenUpdateRef.current) {
      clearInterval(lastSeenUpdateRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Unsubscribe from WS events
    Object.values(wsEventUnsubscribesRef.current).forEach((unsub) => {
      try {
        unsub?.();
      } catch (e) {
        console.error('Error unsubscribing:', e);
      }
    });
    wsEventUnsubscribesRef.current = {};

    // Disconnect WS
    realtimeService.disconnect();

    DEBUG && console.log('[ActiveSessionScreen] Cleanup complete');
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      _cleanup();
    };
  }, [_cleanup]);

  /**
   * Generate map HTML with Leaflet
   */
  const getMapHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
          <style>
            body { margin: 0; padding: 0; }
            #map { position: absolute; top: 0; bottom: 0; width: 100%; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const map = L.map('map').setView([37.7749, -122.4194], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors',
              maxZoom: 19
            }).addTo(map);

            let myMarker, peerMarker, myCircle, peerCircle;

            window.updateMap = (data) => {
              const { myLocation, peerLocation } = JSON.parse(data);
              
              if (myLocation) {
                const { lat, lon, accuracy_m } = myLocation;
                
                if (myMarker) {
                  myMarker.setLatLng([lat, lon]);
                } else {
                  myMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    color: '#007AFF',
                    fillColor: '#007AFF',
                    fillOpacity: 1
                  }).bindPopup('You').addTo(map);
                }
                
                if (myCircle) {
                  myCircle.setRadius(accuracy_m);
                } else {
                  myCircle = L.circle([lat, lon], {
                    radius: accuracy_m,
                    color: 'rgba(0, 122, 255, 0.3)',
                    fill: true,
                    fillColor: 'rgba(0, 122, 255, 0.1)',
                    fillOpacity: 0.1
                  }).addTo(map);
                }
                
                map.flyTo([lat, lon], 14, { animate: true, duration: 0.5 });
              }
              
              if (peerLocation) {
                const { lat, lon, accuracy_m } = peerLocation;
                
                if (peerMarker) {
                  peerMarker.setLatLng([lat, lon]);
                } else {
                  peerMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    color: '#22C55E',
                    fillColor: '#22C55E',
                    fillOpacity: 1
                  }).bindPopup('Peer').addTo(map);
                }
                
                if (peerCircle) {
                  peerCircle.setRadius(accuracy_m);
                } else {
                  peerCircle = L.circle([lat, lon], {
                    radius: accuracy_m,
                    color: 'rgba(34, 197, 94, 0.3)',
                    fill: true,
                    fillColor: 'rgba(34, 197, 94, 0.1)',
                    fillOpacity: 0.1
                  }).addTo(map);
                }
              }
            };
          </script>
        </body>
      </html>
    `;
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Leaflet Map via WebView */}
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: getMapHTML() }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
      />

      {/* Status Badge */}
      <View
        style={[
          styles.statusBadge,
          wsStatus === 'connected' && styles.statusConnected,
          wsStatus === 'reconnecting' && styles.statusReconnecting,
          wsStatus === 'failed' && styles.statusFailed,
          wsStatus === 'disconnected' && styles.statusDisconnected,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            wsStatus === 'connected' && styles.dotGreen,
            wsStatus === 'reconnecting' && styles.dotOrange,
            wsStatus === 'failed' && styles.dotRed,
            wsStatus === 'disconnected' && styles.dotGray,
          ]}
        />
        <Text style={styles.statusText}>
          {wsStatus === 'connected'
            ? 'Connected'
            : wsStatus === 'reconnecting'
            ? `Reconnecting... ${reconnectCountdown}s`
            : wsStatus === 'failed'
            ? 'Connection Failed'
            : 'Disconnected'}
        </Text>
      </View>

      {/* Error Banner */}
      {(locationError || wsError) && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            {locationError || wsError}
          </Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomPanel}>
        {friend && (
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{friend.name || 'Peer'}</Text>
            <Text style={styles.friendSubtitle}>
              {peerLocation
                ? `Last seen: ${peerLastSeenText}`
                : 'Waiting for location...'}
            </Text>
            {peerIsStale && peerLocation && (
              <Text style={styles.staleWarning}>
                ⚠️ Location might be outdated
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.endSessionButton, isStopping && styles.buttonDisabled]}
          onPress={handleEndSession}
          disabled={isStopping}
        >
          <Text style={styles.endSessionText}>
            {isStopping ? 'Ending...' : 'End Session'}
          </Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  map: {
    flex: 1,
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: '90%',
  },
  statusConnected: {
    backgroundColor: '#E8F5E9',
  },
  statusReconnecting: {
    backgroundColor: '#FFF3E0',
  },
  statusFailed: {
    backgroundColor: '#FFEBEE',
  },
  statusDisconnected: {
    backgroundColor: '#F5F5F5',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
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
  dotGray: {
    backgroundColor: '#999',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flex: 1,
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
    fontSize: 13,
    fontWeight: '500',
  },
  bottomPanel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  friendInfo: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomColor: '#f0f0f0',
    borderBottomWidth: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  friendSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  staleWarning: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
    fontWeight: '600',
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  endSessionButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  endSessionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ActiveSessionScreen;
