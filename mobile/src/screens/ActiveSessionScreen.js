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
import { supabase } from '../api/supabase';
import { getRoute, formatDistance, formatDuration, haversineDistance, TransportMode } from '../services/orsService';
import { useTheme, Spacing, Radius, Font } from '../theme';

const DEBUG = process.env.NODE_ENV !== 'production';

const ActiveSessionScreen = ({ route, navigation }) => {
  const { friend, sessionId: routeSessionId } = route.params || {};
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);

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

  // Routing state
  const [selectedMode, setSelectedMode] = useState('foot-walking');
  const selectedModeRef = useRef('foot-walking'); // ref avoids stale closure in timeout
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeFetchRef = useRef(null);

  // Peer display name (passed from accept flow or friend param)
  const peerName = friend?.display_name || friend?.name || 'Peer';

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
  // WebView load state
  const webViewReadyRef = useRef(false);
  const lastMapDataRef = useRef(null);

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

        // 1. Resolve session ID — prefer route param (from accept flow), otherwise fetch from backend
        let activeSessionId = routeSessionId;

        if (!activeSessionId) {
          DEBUG && console.log('[ActiveSessionScreen] Fetching active session from backend...');
          const sessionResponse = await client.get('/sessions/active');
          const activeSession = sessionResponse.data;
          if (!activeSession || !activeSession.session_id) {
            throw new Error('No active session found. Ask your friend to send you a meet request first.');
          }
          activeSessionId = activeSession.session_id;
        }

        setSessionId(activeSessionId);
        DEBUG && console.log('[ActiveSessionScreen] Session ID:', activeSessionId);

        // 2. Request location permission
        DEBUG && console.log('[ActiveSessionScreen] Requesting location permission...');
        const hasPermission = await locationService.requestPermission();
        if (!hasPermission) {
          throw new Error('Location permission is required to share your location.');
        }

        // 3. Start location tracking
        DEBUG && console.log('[ActiveSessionScreen] Starting location tracking...');
        const trackingStarted = await locationService.startTracking((location) => {
          if (!isMountedRef.current) return;
          setMyLocation(location);
        });

        if (!trackingStarted) {
          throw new Error('Failed to start location tracking.');
        }

        // 4. Get initial location
        const initialLocation = await locationService.getCurrentLocation();
        if (initialLocation) {
          setMyLocation(initialLocation);
        }

        // 5. Connect WebSocket with real auth token
        DEBUG && console.log('[ActiveSessionScreen] Connecting WebSocket...');
        const { data: { session: supabaseSession } } = await supabase.auth.getSession();
        if (!supabaseSession?.access_token) {
          throw new Error('You are not signed in. Please sign in and try again.');
        }

        _subscribeToWsEvents();

        const wsBaseUrl = client.defaults.baseURL.replace('/api/v1', '');
        await realtimeService.connect(
          supabaseSession.access_token,
          activeSessionId,
          wsBaseUrl
        );

        DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
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
   * Helper to safely inject map data into WebView
   */
  const injectMapData = useCallback((mapData) => {
    lastMapDataRef.current = mapData;
    if (!webViewReadyRef.current || !webViewRef.current) return;
    const jsCode = `
      if (window.updateMap) {
        window.updateMap(${JSON.stringify(mapData)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(jsCode);
  }, []);

  /**
   * Update map when locations change
   */
  useEffect(() => {
    if (myLocation || peerLocation) {
      injectMapData({ myLocation, peerLocation, routeCoords, peerName });
    }
  }, [myLocation, peerLocation, routeCoords, peerName, injectMapData]);

  /**
   * Fetch ORS route whenever both locations are known or mode changes
   */
  useEffect(() => {
    if (!myLocation || !peerLocation) return;

    // Keep ref current so the timeout closure always reads latest mode
    selectedModeRef.current = selectedMode;

    if (routeFetchRef.current) clearTimeout(routeFetchRef.current);
    routeFetchRef.current = setTimeout(async () => {
      const mode = selectedModeRef.current; // read from ref, not closure
      setRouteLoading(true);
      const result = await getRoute(myLocation, peerLocation, mode);
      if (result) {
        setRouteCoords(result.coordinates);
        setRouteDistance(result.distanceM);
        setRouteDuration(result.durationSec);
        injectMapData({ myLocation, peerLocation, routeCoords: result.coordinates, peerName });
      } else {
        setRouteCoords(null);
        setRouteDistance(haversineDistance(myLocation, peerLocation));
        setRouteDuration(null);
      }
      setRouteLoading(false);
    }, 2000); // 2s debounce

    return () => clearTimeout(routeFetchRef.current);
  }, [myLocation?.lat, myLocation?.lon, peerLocation?.lat, peerLocation?.lon, selectedMode]);

  /**
   * Once WebView is loaded, flush any pending location data
   */
  const handleWebViewLoadEnd = useCallback(() => {
    webViewReadyRef.current = true;
    if (lastMapDataRef.current) {
      injectMapData(lastMapDataRef.current);
    }
  }, [injectMapData]);

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
            body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
            #map { position: absolute; top: 0; bottom: 0; width: 100%; }
            .label-icon { background: transparent; border: none; }
            .marker-label {
              font-size: 12px; font-weight: 700;
              color: #fff; background: rgba(0,0,0,0.6);
              padding: 2px 6px; border-radius: 8px;
              white-space: nowrap; text-align: center;
              margin-top: 4px;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const map = L.map('map').setView([37.7749, -122.4194], 14);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/${colors.mapTile}/{z}/{x}/{y}{r}.png', {
              attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
              subdomains: 'abcd',
              maxZoom: 19
            }).addTo(map);

            let myMarker, peerMarker, myLabel, peerLabel, myCircle, peerCircle, routeLine;
            let firstFit = true;

            function makeLabel(text, color) {
              return L.divIcon({
                className: 'label-icon',
                html: '<div class="marker-label" style="background:' + color + '88">' + text + '</div>',
                iconAnchor: [20, -10]
              });
            }

            window.updateMap = (data) => {
              const { myLocation, peerLocation, routeCoords, peerName } = data;
              const peer = peerName || 'Peer';

              if (myLocation) {
                const { lat, lon, accuracy_m } = myLocation;
                if (myMarker) {
                  myMarker.setLatLng([lat, lon]);
                  if (myCircle) { myCircle.setLatLng([lat, lon]); myCircle.setRadius(accuracy_m || 10); }
                } else {
                  myMarker = L.circleMarker([lat, lon], {
                    radius: 10, color: '${colors.myMarker}', fillColor: '${colors.myMarker}', fillOpacity: 1, weight: 2.5
                  }).addTo(map);
                  myLabel = L.marker([lat, lon], { icon: makeLabel('Me', '${colors.myMarker}'), interactive: false }).addTo(map);
                  myCircle = L.circle([lat, lon], { radius: accuracy_m || 10, color: '${colors.myMarker}', fillColor: '${colors.myMarker}', fillOpacity: 0.06, weight: 1 }).addTo(map);
                }
                if (myLabel) myLabel.setLatLng([lat, lon]);
              }

              if (peerLocation) {
                const { lat, lon, accuracy_m } = peerLocation;
                if (peerMarker) {
                  peerMarker.setLatLng([lat, lon]);
                  if (peerCircle) { peerCircle.setLatLng([lat, lon]); peerCircle.setRadius(accuracy_m || 10); }
                } else {
                  peerMarker = L.circleMarker([lat, lon], {
                    radius: 10, color: '${colors.peerMarker}', fillColor: '${colors.peerMarker}', fillOpacity: 1, weight: 2.5
                  }).addTo(map);
                  peerLabel = L.marker([lat, lon], { icon: makeLabel(peer, '${colors.peerMarker}'), interactive: false }).addTo(map);
                  peerCircle = L.circle([lat, lon], { radius: accuracy_m || 10, color: '${colors.peerMarker}', fillColor: '${colors.peerMarker}', fillOpacity: 0.08, weight: 1 }).addTo(map);
                }
                if (peerLabel) peerLabel.setLatLng([lat, lon]);
              }

              if (routeCoords && routeCoords.length > 1) {
                if (routeLine) routeLine.setLatLngs(routeCoords);
                else routeLine = L.polyline(routeCoords, { color: '${colors.routeLine}', weight: 3.5, opacity: 0.7, dashArray: '10 6' }).addTo(map);
              } else if (routeLine) { routeLine.remove(); routeLine = null; }

              // Fit both markers on first load
              if (firstFit && myLocation && peerLocation) {
                firstFit = false;
                const bounds = L.latLngBounds([[myLocation.lat, myLocation.lon], [peerLocation.lat, peerLocation.lon]]);
                map.fitBounds(bounds.pad(0.25));
              } else if (myLocation && !peerLocation) {
                map.setView([myLocation.lat, myLocation.lon], 15);
              }
            };
          </script>
        </body>
      </html>
    `;
  };

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.textSecondary} />
        <Text style={s.loadingText}>Initializing session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Leaflet Map via WebView */}
      <WebView
        ref={webViewRef}
        style={s.map}
        source={{ html: getMapHTML() }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        onLoadEnd={handleWebViewLoadEnd}
        renderLoading={() => (
          <View style={s.mapLoading}>
            <ActivityIndicator size="large" color={colors.textSecondary} />
          </View>
        )}
      />

      {/* Status Badge */}
      <View style={[
        s.statusBadge,
        wsStatus === 'connected' && s.statusConnected,
        wsStatus === 'reconnecting' && s.statusReconnecting,
        wsStatus === 'failed' && s.statusFailed,
        wsStatus === 'disconnected' && s.statusDisconnected,
      ]}>
        <View style={[
          s.statusDot,
          wsStatus === 'connected' && s.dotGreen,
          wsStatus === 'reconnecting' && s.dotOrange,
          wsStatus === 'failed' && s.dotRed,
          wsStatus === 'disconnected' && s.dotGray,
        ]} />
        <Text style={s.statusText}>
          {wsStatus === 'connected' ? 'Live'
            : wsStatus === 'reconnecting' ? `Reconnecting ${reconnectCountdown}s`
              : wsStatus === 'failed' ? 'Disconnected'
                : 'Offline'}
        </Text>
      </View>

      {/* Error Banner */}
      {(locationError || wsError) && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{locationError || wsError}</Text>
        </View>
      )}

      {/* Bottom Panel */}
      <View style={s.bottomPanel}>
        <View style={s.infoRow}>
          <View style={s.peerInfo}>
            <Text style={s.peerName}>{peerName}</Text>
            <Text style={s.peerSub}>
              {peerLocation ? `Last seen: ${peerLastSeenText}` : 'Waiting for location...'}
            </Text>
          </View>
          {routeDistance != null && (
            <View style={s.distanceBadge}>
              <Text style={s.distanceValue}>{formatDistance(routeDistance)}</Text>
              {routeDuration != null && (
                <Text style={s.etaValue}>{formatDuration(routeDuration)} away</Text>
              )}
            </View>
          )}
        </View>

        {peerLocation && (
          <View style={s.modeTabs}>
            {Object.values(TransportMode).map(mode => (
              <TouchableOpacity key={mode.id}
                style={[s.modeTab, selectedMode === mode.id && s.modeTabActive]}
                onPress={() => setSelectedMode(mode.id)}>
                <Text style={s.modeIcon}>{mode.icon}</Text>
                <Text style={[s.modeLabel, selectedMode === mode.id && s.modeLabelActive]}>
                  {mode.label}
                </Text>
                {routeLoading && selectedMode === mode.id && (
                  <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[s.endSessionButton, isStopping && s.buttonDisabled]}
          onPress={handleEndSession} disabled={isStopping}>
          <Text style={s.endSessionText}>{isStopping ? 'Ending...' : 'End Session'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
  loadingText: { marginTop: 12, ...Font.body, color: c.textSecondary },
  map: { flex: 1 },

  statusBadge: {
    position: 'absolute', top: 16, left: 16,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border,
  },
  statusConnected: {},
  statusReconnecting: { borderColor: c.warning },
  statusFailed: { borderColor: c.accent },
  statusDisconnected: {},
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  dotGreen: { backgroundColor: c.online },
  dotOrange: { backgroundColor: c.warning },
  dotRed: { backgroundColor: c.accent },
  dotGray: { backgroundColor: c.textMuted },
  statusText: { fontSize: 12, fontWeight: '600', color: c.textPrimary },

  errorBanner: {
    position: 'absolute', bottom: 130, left: 16, right: 16,
    backgroundColor: c.accentBg, padding: 12, borderRadius: Radius.sm,
    borderColor: c.accent, borderWidth: 1,
  },
  errorText: { color: c.accentLight, fontSize: 13, fontWeight: '500' },

  bottomPanel: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    borderTopWidth: 1, borderColor: c.border,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  peerInfo: { flex: 1 },
  peerName: { ...Font.subtitle, color: c.textPrimary },
  peerSub: { ...Font.caption, color: c.textMuted, marginTop: 3 },
  distanceBadge: { alignItems: 'flex-end' },
  distanceValue: { fontSize: 22, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.5 },
  etaValue: { ...Font.caption, color: c.textMuted, marginTop: 2 },

  modeTabs: {
    flexDirection: 'row', marginBottom: Spacing.md,
    backgroundColor: c.surfaceElevated, borderRadius: Radius.md, padding: 3,
    borderWidth: 1, borderColor: c.border,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 8, borderRadius: Radius.sm,
  },
  modeTabActive: { backgroundColor: c.borderLight },
  modeIcon: { fontSize: 14, marginRight: 5 },
  modeLabel: { ...Font.caption, color: c.textMuted },
  modeLabelActive: { color: c.textPrimary, fontWeight: '700' },

  mapLoading: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center',
    alignItems: 'center', backgroundColor: c.bg,
  },
  endSessionButton: {
    borderWidth: 1, borderColor: c.accent,
    borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  endSessionText: { color: c.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});

export default ActiveSessionScreen;
