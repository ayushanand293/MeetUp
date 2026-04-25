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
  Modal,
  Animated,
  Share,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';
import { useAuth } from '../context/AuthContext';
import locationService from '../services/locationService';
import realtimeService from '../services/realtimeService';
import client from '../api/client';
import analyticsService from '../services/analyticsService';
import { supabase } from '../api/supabase';
import { getRoute, formatDistance, formatDuration, haversineDistance, TransportMode } from '../services/orsService';
import { useTheme, Spacing, Radius, Font } from '../theme';
import ModernDistanceBar from '../components/ModernDistanceBar';

const DEBUG = process.env.NODE_ENV !== 'production';

const getSessionEndMessage = (reason) => {
  if (reason === 'USER_ACTION') return 'The meetup was ended by one of you.';
  if (reason === 'PEER_LEFT') return 'The other person left the meetup.';
  if (reason === 'SESSION_TIMEOUT') return 'The meetup ended because it was inactive.';
  if (reason === 'PROXIMITY_REACHED') return 'You both reached the meetup point.';
  if (reason === 'MANUAL_CONFIRM') return 'Both of you confirmed arrival.';
  return 'This meetup has ended.';
};

const getInitErrorMessage = (error) => {
  const raw = String(error?.message || '').toLowerCase();
  if (raw.includes('not signed in')) return 'Please sign in again to continue.';
  if (raw.includes('no active session')) return 'No active meetup found. Accept a request first.';
  if (raw.includes('permission')) return 'Location permission is required to share your location.';
  if (raw.includes('location services')) return 'Turn on location services to continue sharing.';
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout') || raw.includes('internet')) {
    return 'We could not connect right now. Check your internet and try again.';
  }
  return 'We could not start this meetup right now. Please try again.';
};

const classifyInitIssue = (error) => {
  const raw = String(error?.message || '').toLowerCase();
  if (raw.includes('permission')) {
    return {
      kind: 'permission',
      title: 'Location Permission Needed',
      message: 'Grant location access so MeetUp can keep sharing your position.',
    };
  }

  if (raw.includes('location services')) {
    return {
      kind: 'services',
      title: 'Location Services Off',
      message: 'Turn on location services on this device, then retry.',
    };
  }

  if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout') || raw.includes('internet')) {
    return {
      kind: 'network',
      title: 'Network Unavailable',
      message: 'Check your connection and tap Retry when you are back online.',
    };
  }

  return {
    kind: 'generic',
    title: 'Unable to Start Meetup',
    message: 'We could not start this meetup right now. Please try again.',
  };
};

const formatSessionDistance = (meters) => {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 1 : 2)} km`;
};

const ActiveSessionScreen = ({ route, navigation }) => {
  const { friend, sessionId: routeSessionId, inviteToken } = route.params || {};
  const { user, rememberActiveSession, clearActiveSessionHint } = useAuth();
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);
  const isFocused = useIsFocused();

  // Location state
  const [myLocation, setMyLocation] = useState(null);
  const [peerLocation, setPeerLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // WebSocket state
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [wsError, setWsError] = useState(null);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [initIssue, setInitIssue] = useState(null);
  const [initAttempt, setInitAttempt] = useState(0);

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);
  const [isSharingInvite, setIsSharingInvite] = useState(false);

  // Routing state
  const [selectedMode, setSelectedMode] = useState('foot-walking');
  const selectedModeRef = useRef('foot-walking'); // ref avoids stale closure in timeout
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeFetchRef = useRef(null);

  // Peer display name (passed from accept flow or friend param, or fetched from session)
  const [peerName, setPeerName] = useState(friend?.display_name || friend?.name || 'Peer');
  const distanceText = formatSessionDistance(routeDistance);
  const durationText = routeDuration != null ? formatDuration(routeDuration) : null;

  // Peer info
  const [peerLastSeenText, setPeerLastSeenText] = useState('Not yet connected');
  const [peerIsStale, setPeerIsStale] = useState(false);
  const [sharingPausedText, setSharingPausedText] = useState('');
  const [appState, setAppState] = useState(AppState.currentState);

  // Refs for cleanup
  const webViewRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const lastSeenUpdateRef = useRef(null);
  const locationUnsubscribeRef = useRef(null);
  const locationEventUnsubscribesRef = useRef({});
  const wsEventUnsubscribesRef = useRef({});
  const countdownIntervalRef = useRef(null);
  const peerOfflineTimerRef = useRef(null);
  const peerOfflineAlertedRef = useRef(false);
  const isMountedRef = useRef(true);
  // WebView load state
  const webViewReadyRef = useRef(false);
  const lastMapDataRef = useRef(null);

  // Flow State
  const [meetingSuccess, setMeetingSuccess] = useState(false);
  const successPulse = useRef(new Animated.Value(1)).current;
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
  const [arrivalCountdown, setArrivalCountdown] = useState(60);
  const arrivalTimerRef = useRef(null);
  const sessionLaunchStartedAtRef = useRef(Date.now());
  const [isSharingPaused, setIsSharingPaused] = useState(false);

  const _subscribeToLocationEvents = useCallback(() => {
    const unsubscribes = {};

    unsubscribes.permissionGranted = locationService.on('permissionGranted', () => {
      if (!isMountedRef.current) return;
      setInitIssue(null);
      setLocationError(null);
    });

    unsubscribes.permissionDenied = locationService.on('permissionDenied', () => {
      if (!isMountedRef.current) return;
      setInitIssue({
        kind: 'permission',
        title: 'Location Permission Needed',
        message: 'Grant location access so MeetUp can keep sharing your position.',
      });
      setLocationError('Location permission is required to share your location.');
    });

    unsubscribes.permissionUndetermined = locationService.on('permissionUndetermined', () => {
      if (!isMountedRef.current) return;
      setInitIssue({
        kind: 'permission',
        title: 'Location Permission Needed',
        message: 'Grant location access so MeetUp can keep sharing your position.',
      });
      setLocationError('Location permission is required to share your location.');
    });

    unsubscribes.permissionError = locationService.on('permissionError', ({ error }) => {
      if (!isMountedRef.current) return;
      setInitIssue({
        kind: 'permission',
        title: 'Location Permission Needed',
        message: error?.message || 'MeetUp could not request location permission.',
      });
      setLocationError(error?.message || 'Location permission request failed.');
    });

    unsubscribes.locationServicesDisabled = locationService.on('locationServicesDisabled', () => {
      if (!isMountedRef.current) return;
      setInitIssue({
        kind: 'services',
        title: 'Location Services Off',
        message: 'Turn on location services on this device, then retry.',
      });
      setLocationError('Location services are disabled.');
    });

    unsubscribes.trackingError = locationService.on('trackingError', ({ error }) => {
      if (!isMountedRef.current) return;
      setLocationError(error?.message || 'Location tracking stopped. Please retry.');
    });

    locationEventUnsubscribesRef.current = unsubscribes;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);

      if (nextState === 'active') {
        setSharingPausedText('');
        if (locationService.isPaused && !isSharingPaused) {
          locationService.resumeTracking('app_foregrounded');
        }
        return;
      }

      if (nextState.match(/inactive|background/)) {
        setSharingPausedText('Sharing paused (app in background)');
        if (locationService.isTracking) {
          locationService.pauseTracking('app_backgrounded');
        }
      }
    });

    return () => subscription.remove();
  }, [isSharingPaused]);

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
        setInitIssue(null);

        _subscribeToLocationEvents();

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

        DEBUG && console.log('[ActiveSessionScreen] Session ID:', activeSessionId);
        rememberActiveSession({
          session_id: activeSessionId,
          peer_id: friend?.id || null,
          peer_name: friend?.display_name || friend?.name || null,
        });

        // Fetch peer display name if not provided via route params
        if ((!friend?.display_name && !friend?.name) && peerName === 'Peer') {
          try {
            DEBUG && console.log('[ActiveSessionScreen] Fetching peer display name...');
            const sessionDetailsResponse = await client.get(`/sessions/${activeSessionId}/participants`);
            const participants = sessionDetailsResponse.data;
            const currentUserId = String(user?.id || '');
            
            if (participants && Array.isArray(participants)) {
              const peerParticipant = participants.find(p => String(p.user_id) !== currentUserId);
              if (peerParticipant?.display_name) {
                DEBUG && console.log('[ActiveSessionScreen] Peer display name:', peerParticipant.display_name);
                setPeerName(peerParticipant.display_name);
                rememberActiveSession({
                  session_id: activeSessionId,
                  peer_id: peerParticipant.user_id,
                  peer_name: peerParticipant.display_name,
                });
              }
            }
          } catch (err) {
            DEBUG && console.log('[ActiveSessionScreen] Failed to fetch peer display name:', err);
            // Silent fail - will use default 'Peer'
          }
        }

        if (inviteToken && activeSessionId) {
          try {
            DEBUG && console.log('[ActiveSessionScreen] Redeeming invite token...');
            await client.post(`/sessions/${activeSessionId}/invite/redeem`, { token: inviteToken });
          } catch (err) {
            if (err.response?.status !== 400 && err.response?.data?.status !== 'already_joined') {
              console.warn('Invite token redeem failed: ', err.response?.data);
            }
          }
        }

        // 2. Request location permission
        DEBUG && console.log('[ActiveSessionScreen] Requesting location permission...');
        const hasPermission = await locationService.requestPermission();
        if (!hasPermission) {
          setLocationError('Location permission is required to share your location.');
          setInitIssue({
            kind: 'permission',
            title: 'Location Permission Needed',
            message: 'Grant location access so MeetUp can keep sharing your position.',
          });
          analyticsService.track('session_launch_failed', {
            elapsed_ms: Date.now() - sessionLaunchStartedAtRef.current,
            source: inviteToken ? 'invite' : routeSessionId ? 'route' : 'lookup',
            reason: 'Location permission is required to share your location.',
          });
          setIsLoading(false);
          return;
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

        // 4. Prime initial location in background (do not block session startup)
        locationService.getCurrentLocation()
          .then((initialLocation) => {
            if (initialLocation && isMountedRef.current) {
              setMyLocation(initialLocation);
            }
          })
          .catch(() => {
            // non-blocking; tracking callback will still update location shortly
          });

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

        setSessionId(activeSessionId);
        DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
        analyticsService.track('session_launch_success', {
          elapsed_ms: Date.now() - sessionLaunchStartedAtRef.current,
          source: inviteToken ? 'invite' : routeSessionId ? 'route' : 'lookup',
          has_permission: true,
        });
        setIsLoading(false);
      } catch (error) {
        // Avoid LogBox red overlay for expected recoverable startup failures.
        if (DEBUG) {
          console.log('[ActiveSessionScreen] Initialization issue:', error?.message || error);
        }
        if (!isMountedRef.current) return;

        const friendlyInitMessage = getInitErrorMessage(error);
        setLocationError(friendlyInitMessage);
        setInitIssue(classifyInitIssue(error));
        setWsError(null);
        analyticsService.track('session_launch_failed', {
          elapsed_ms: Date.now() - sessionLaunchStartedAtRef.current,
          source: inviteToken ? 'invite' : routeSessionId ? 'route' : 'lookup',
          reason: friendlyInitMessage,
        });
        setIsLoading(false);
      }
    };

    initializeSession();

    return () => {
      _cleanup();
    };
  }, [initAttempt, routeSessionId, inviteToken, friend, navigation, _subscribeToLocationEvents, _cleanup]);

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

      peerOfflineAlertedRef.current = false;
      if (peerOfflineTimerRef.current) {
        clearTimeout(peerOfflineTimerRef.current);
        peerOfflineTimerRef.current = null;
      }

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

      if (payload.status === 'online') {
        peerOfflineAlertedRef.current = false;
        if (peerOfflineTimerRef.current) {
          clearTimeout(peerOfflineTimerRef.current);
          peerOfflineTimerRef.current = null;
        }
        setPeerLastSeenText('Just now');
        setPeerIsStale(false);
        return;
      }

      if (payload.status === 'offline') {
        if (peerOfflineTimerRef.current) {
          clearTimeout(peerOfflineTimerRef.current);
        }

        peerOfflineTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current || peerOfflineAlertedRef.current) return;

          peerOfflineAlertedRef.current = true;
          setPeerLocation(null);
          setPeerLastSeenText('Offline');
          setPeerIsStale(true);
          Alert.alert('Connection Paused', 'The other person may have temporarily lost connection. You can stay here and wait for them to reconnect.');
        }, 8000);
        return;
      }
    });

    unsubscribes.onSessionEnded = realtimeService.on('sessionEnded', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Session ended:', payload.reason);
      if (!isMountedRef.current) return;

      if (payload.reason === 'PROXIMITY_REACHED' || payload.reason === 'MANUAL_CONFIRM') {
        if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current);
        setIsConfirmingArrival(false);
        setMeetingSuccess(true);
        
        Animated.loop(
          Animated.sequence([
            Animated.timing(successPulse, { toValue: 1.05, duration: 600, useNativeDriver: true }),
            Animated.timing(successPulse, { toValue: 1, duration: 600, useNativeDriver: true })
          ])
        ).start();

        setTimeout(() => {
          _cleanup();
          navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        }, 5000); // give them 5 seconds to enjoy the success screen
        return;
      }

      _cleanup();
      clearActiveSessionHint();
      Alert.alert('Meetup Ended', getSessionEndMessage(payload.reason), [
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

      // Suppress rate limit errors from alerting user - handled transparently by client-side throttling
      if (payload.code === 'RATE_LIMIT_EXCEEDED') {
        DEBUG && console.log('[ActiveSessionScreen] Rate limit (suppressed for UX)');
        return;
      }

      setWsError(`Error: ${payload.message}`);
    });

    unsubscribes.onTrackingPaused = locationService.on('trackingPaused', () => {
      if (!isMountedRef.current) return;
      setSharingPausedText('Sharing paused (app in background)');
    });

    unsubscribes.onTrackingResumed = locationService.on('trackingResumed', () => {
      if (!isMountedRef.current) return;
      setSharingPausedText('');
    });

    wsEventUnsubscribesRef.current = unsubscribes;
  }, []);

  /**
   * Location streaming loop
   */
  useEffect(() => {
    if (!isFocused) {
      if (locationService.isTracking) {
        setSharingPausedText('Sharing paused (screen not in view)');
        locationService.pauseTracking('screen_blurred');
      }
      return;
    }

    if (isFocused && appState === 'active' && locationService.isPaused && !isSharingPaused) {
      locationService.resumeTracking('screen_focused');
    }

    if (!myLocation || wsStatus !== 'connected' || !isFocused || appState !== 'active' || isSharingPaused) return;

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
    }, 3000); // Every 3 seconds

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [myLocation, wsStatus, isFocused, appState, isSharingPaused]);

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
      'End Meetup?',
      'This will end location sharing for both of you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Meetup',
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

              clearActiveSessionHint();
              _cleanup();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            } catch (error) {
              console.error('[ActiveSessionScreen] End session error:', error);
              Alert.alert('Could Not End Meetup', 'Please try again in a moment.');
              setIsStopping(false);
            }
          },
        },
      ]
    );
  }, [sessionId, navigation, clearActiveSessionHint]);

  const handleImHere = useCallback(async () => {
    try {
      setIsConfirmingArrival(true);
      setArrivalCountdown(60);

      // Fire HTTP confirmation endpoint
      if (sessionId) {
        client.post(`/sessions/${sessionId}/im-here`).catch(err => {
          console.error('[ActiveSessionScreen] Failed im-here request:', err);
        });
      }

      if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current);
      arrivalTimerRef.current = setInterval(() => {
        setArrivalCountdown(prev => {
          if (prev <= 1) {
            clearInterval(arrivalTimerRef.current);
            setIsConfirmingArrival(false);
            Alert.alert('No Confirmation Yet', 'The other person has not confirmed arrival. You can try again.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setIsConfirmingArrival(false);
      Alert.alert('Error', 'Failed to confirm arrival');
    }
  }, [sessionId]);

  const handleShareInvite = useCallback(async () => {
    if (!sessionId) {
      Alert.alert('No Active Meetup', 'Start the meetup before sharing an invite.');
      return;
    }

    try {
      setIsSharingInvite(true);
      const inviteResponse = await client.post(`/sessions/${sessionId}/invite`);
      const token = inviteResponse?.data?.invite_token;

      if (!token) {
        throw new Error('Invite token missing');
      }

      const inviteUrl = `${ExpoLinking.createURL('invite')}?token=${encodeURIComponent(token)}`;
      const shareText = `Join my meetup on MeetUp: ${inviteUrl}`;
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareText)}`;

      try {
        if (await Linking.canOpenURL(whatsappUrl)) {
          await Linking.openURL(whatsappUrl);
          return;
        }
      } catch (linkError) {
        DEBUG && console.log('[ActiveSessionScreen] WhatsApp share fallback:', linkError?.message);
      }

      await Share.share({
        message: shareText,
        title: 'MeetUp invite',
      });
    } catch (error) {
      console.error('[ActiveSessionScreen] Share invite error:', error);
      Alert.alert('Could Not Share Invite', 'Please try again in a moment.');
    } finally {
      setIsSharingInvite(false);
    }
  }, [sessionId]);

  const handleTogglePauseSharing = useCallback(async () => {
    try {
      if (!isSharingPaused) {
        setIsSharingPaused(true);
        setSharingPausedText('Sharing paused by you');
        if (locationIntervalRef.current) {
          clearInterval(locationIntervalRef.current);
          locationIntervalRef.current = null;
        }
        locationService.pauseTracking('manual_pause');
        analyticsService.track('sharing_paused', {
          sessionId,
          source: 'manual',
        });
        Alert.alert('Sharing Paused', 'Your location is no longer being shared.');
        return;
      }

      setIsSharingPaused(false);
      setSharingPausedText('');
      const resumed = await locationService.resumeTracking('manual_resume');
      if (!resumed) {
        throw new Error('Unable to resume location sharing.');
      }
      analyticsService.track('sharing_resumed', {
        sessionId,
        source: 'manual',
      });
      Alert.alert('Sharing Resumed', 'Your location is being shared again.');
    } catch (error) {
      console.error('[ActiveSessionScreen] Toggle pause sharing error:', error);
      setLocationError(error?.message || 'Could not change sharing state right now.');
    }
  }, [isSharingPaused, sessionId]);

  /**
   * Cleanup all resources
   */
  const _cleanup = useCallback(() => {
    DEBUG && console.log('[ActiveSessionScreen] Cleaning up resources...');

    Object.values(locationEventUnsubscribesRef.current).forEach((unsub) => {
      try {
        unsub?.();
      } catch (e) {
        console.error('Error unsubscribing location event:', e);
      }
    });
    locationEventUnsubscribesRef.current = {};

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
    if (arrivalTimerRef.current) {
      clearInterval(arrivalTimerRef.current);
    }
    if (peerOfflineTimerRef.current) {
      clearTimeout(peerOfflineTimerRef.current);
      peerOfflineTimerRef.current = null;
    }

    setInitIssue(null);

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

  const handleRetrySession = useCallback(async () => {
    _cleanup();
    setLocationError(null);
    setWsError(null);
    setInitAttempt((value) => value + 1);
  }, [_cleanup]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch((error) => {
      console.warn('[ActiveSessionScreen] Failed to open settings:', error);
    });
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
            .marker-label-wrap {
              transform: translateY(20px);
              display: flex;
              justify-content: center;
            }
            .marker-label {
              font-size: 11px;
              font-weight: 700;
              color: #17212f;
              background: rgba(255,255,255,0.98);
              border: 1px solid rgba(23,33,47,0.18);
              box-shadow: 0 3px 10px rgba(0, 0, 0, 0.16);
              padding: 3px 7px;
              border-radius: 999px;
              white-space: nowrap;
              text-align: center;
              max-width: 110px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .marker-label.peer {
              border-color: rgba(15, 22, 35, 0.26);
            }
            .user-marker {
              width: 14px;
              height: 14px;
              border-radius: 7px;
              border: 2px solid #ffffff;
              box-shadow: 0 0 0 2px var(--marker-color), 0 3px 8px rgba(0, 0, 0, 0.25);
              background: var(--marker-color);
            }
            .peer-marker {
              width: 14px;
              height: 14px;
              border-radius: 7px;
              border: 2px solid #ffffff;
              box-shadow: 0 0 0 2px var(--marker-color), 0 3px 8px rgba(0, 0, 0, 0.25);
              background: var(--marker-color);
              position: relative;
            }
            .peer-marker::after {
              content: '';
              position: absolute;
              width: 26px;
              height: 26px;
              left: -8px;
              top: -8px;
              border-radius: 13px;
              border: 1.5px solid var(--marker-color);
              opacity: 0.28;
              animation: peerPulse 2.2s infinite ease-out;
            }
            @keyframes peerPulse {
              0% { transform: scale(0.95); opacity: 0.35; }
              100% { transform: scale(1.35); opacity: 0; }
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

            function makeLabel(text, kind) {
              const safeText = String(text || '').slice(0, 20);
              return L.divIcon({
                className: 'label-icon',
                html: '<div class="marker-label-wrap"><div class="marker-label ' + kind + '">' + safeText + '</div></div>',
                iconSize: [120, 24],
                iconAnchor: [60, 0]
              });
            }

            function makeDotIcon(kind, color) {
              const className = kind === 'peer' ? 'peer-marker' : 'user-marker';
              return L.divIcon({
                className: 'label-icon',
                html: '<div class="' + className + '" style="--marker-color:' + color + '"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
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
                  myMarker = L.marker([lat, lon], { icon: makeDotIcon('me', '${colors.myMarker}') }).addTo(map);
                  myLabel = L.marker([lat, lon], { icon: makeLabel('You', 'me'), interactive: false, zIndexOffset: 1000 }).addTo(map);
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
                  peerMarker = L.marker([lat, lon], { icon: makeDotIcon('peer', '${colors.peerMarker}') }).addTo(map);
                  peerLabel = L.marker([lat, lon], { icon: makeLabel(peer, 'peer'), interactive: false, zIndexOffset: 1000 }).addTo(map);
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

  // Full-screen recovery card when no session exists
  if (initIssue && !sessionId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.initIssueContainer}>
          <View style={s.initIssueCard}>
            <Text style={s.initIssueTitle}>{initIssue.title}</Text>
            <Text style={s.initIssueText}>{initIssue.message}</Text>

            <TouchableOpacity
              style={s.initIssuePrimaryButton}
              onPress={initIssue.kind === 'permission' ? async () => {
                const granted = await locationService.requestPermission();
                if (granted) {
                  await handleRetrySession();
                }
              } : handleRetrySession}
            >
              <Text style={s.initIssuePrimaryText}>
                {initIssue.kind === 'permission' ? 'Grant Location Access' : 'Retry'}
              </Text>
            </TouchableOpacity>

            {(initIssue.kind === 'permission' || initIssue.kind === 'services') && (
              <TouchableOpacity style={s.initIssueSecondaryButton} onPress={handleOpenSettings}>
                <Text style={s.initIssueSecondaryText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
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
          {(wsStatus === 'failed' || initIssue?.kind === 'network') && (
            <TouchableOpacity style={s.errorActionButton} onPress={handleRetrySession}>
              <Text style={s.errorActionText}>Retry</Text>
            </TouchableOpacity>
          )}
          {initIssue?.kind === 'permission' && (
            <TouchableOpacity style={s.errorActionButton} onPress={handleOpenSettings}>
              <Text style={s.errorActionText}>Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!sharingPausedText && (
        <View style={s.pauseBanner}>
          <Text style={s.pauseText}>{sharingPausedText}</Text>
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
            <ModernDistanceBar distanceM={routeDistance} maxDistanceM={500} colors={colors} />
          )}
        </View>

        {(distanceText || durationText) && (
          <View style={s.statsRow}>
            {distanceText && (
              <View style={s.statPill}>
                <Text style={s.statLabel}>Distance</Text>
                <Text style={s.statValue}>{distanceText}</Text>
              </View>
            )}
            {durationText && (
              <View style={s.statPill}>
                <Text style={s.statLabel}>ETA</Text>
                <Text style={s.statValue}>{durationText}</Text>
              </View>
            )}
          </View>
        )}

        <View style={s.controlButtons}>
          <TouchableOpacity
            style={[s.controlButton, isSharingPaused && s.controlButtonActive]}
            onPress={handleTogglePauseSharing}
          >
            <Text style={s.controlButtonIcon}>{isSharingPaused ? '▶️' : '⏸️'}</Text>
            <Text style={[s.controlButtonLabel, isSharingPaused && s.controlButtonLabelActive]}>
              {isSharingPaused ? 'Resume Sharing' : 'Pause Sharing'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.controlButton} onPress={handleEndSession}>
            <Text style={s.controlButtonIcon}>🛑</Text>
            <Text style={s.controlButtonLabel}>Stop Sharing</Text>
          </TouchableOpacity>
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
          style={[s.shareInviteButton, isSharingInvite && s.buttonDisabled]}
          onPress={handleShareInvite}
          disabled={isSharingInvite || !sessionId}
        >
          <Text style={s.shareInviteText}>{isSharingInvite ? 'Preparing Invite...' : 'Share Invite'}</Text>
        </TouchableOpacity>

        {routeDistance != null && routeDistance <= 50 && (
          <TouchableOpacity style={s.imHereButton} onPress={handleImHere}>
            <Text style={s.imHereText}>I'm Here!</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recovery Modal - appears on top of active session when there's a permission/service/network issue */}
      {initIssue && sessionId && (
        <Modal visible={true} transparent animationType="fade">
          <View style={s.modalOverlay}>
            <View style={s.initIssueCard}>
              <Text style={s.initIssueTitle}>{initIssue.title}</Text>
              <Text style={s.initIssueText}>{initIssue.message}</Text>

              <TouchableOpacity
                style={s.initIssuePrimaryButton}
                onPress={initIssue.kind === 'permission' ? async () => {
                  const granted = await locationService.requestPermission();
                  if (granted) {
                    await handleRetrySession();
                  }
                } : handleRetrySession}
              >
                <Text style={s.initIssuePrimaryText}>
                  {initIssue.kind === 'permission' ? 'Grant Location Access' : 'Retry'}
                </Text>
              </TouchableOpacity>

              {(initIssue.kind === 'permission' || initIssue.kind === 'services') && (
                <TouchableOpacity style={s.initIssueSecondaryButton} onPress={handleOpenSettings}>
                  <Text style={s.initIssueSecondaryText}>Open Settings</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.initIssueLinkButton} onPress={() => setInitIssue(null)}>
                <Text style={s.initIssueLinkText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Confirmation Modal */}
      <Modal visible={isConfirmingArrival} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={s.modalTitle}>Waiting for peer...</Text>
            <Text style={s.modalText}>They have {arrivalCountdown}s to confirm</Text>
            <TouchableOpacity style={s.cancelButton} onPress={() => {
              if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current);
              setIsConfirmingArrival(false);
            }}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={meetingSuccess} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <Animated.View style={[s.successCard, { transform: [{ scale: successPulse }] }]}>
            <Text style={s.successEmoji}>🎉</Text>
            <Text style={s.successTitle}>Meeting Detected!</Text>
            <Text style={s.successText}>You've arrived securely.</Text>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
  loadingText: { marginTop: 12, ...Font.body, color: c.textSecondary },
  map: { flex: 1 },
  initIssueContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    backgroundColor: c.bg,
  },
  initIssueCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    shadowColor: c.textPrimary,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 5,
  },
  initIssueTitle: { ...Font.h3, color: c.textPrimary, marginBottom: 8 },
  initIssueText: { ...Font.body, color: c.textSecondary, marginBottom: Spacing.md, lineHeight: 22 },
  initIssuePrimaryButton: {
    backgroundColor: c.textPrimary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  initIssuePrimaryText: { color: c.bg, fontWeight: '800', fontSize: 15 },
  initIssueSecondaryButton: {
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  initIssueSecondaryText: { color: c.textPrimary, fontWeight: '700', fontSize: 14 },
  initIssueLinkButton: { paddingVertical: 8, alignItems: 'center' },
  initIssueLinkText: { color: c.textMuted, fontWeight: '700', fontSize: 13 },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { color: c.accentLight, fontSize: 13, fontWeight: '500' },
  errorActionButton: {
    backgroundColor: c.surface,
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorActionText: { color: c.textPrimary, fontWeight: '800', fontSize: 12 },

  pauseBanner: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    backgroundColor: c.surfaceElevated,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pauseText: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  bottomPanel: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    borderTopWidth: 1, borderColor: c.border,
    shadowColor: c.textPrimary,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  peerInfo: { flex: 1 },
  peerName: { ...Font.subtitle, color: c.textPrimary },
  peerSub: { ...Font.caption, color: c.textMuted, marginTop: 3 },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  controlButtonActive: {
    backgroundColor: c.textPrimary,
    borderColor: c.textPrimary,
  },
  controlButtonIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  controlButtonLabel: {
    ...Font.caption,
    color: c.textPrimary,
    fontWeight: '800',
  },
  controlButtonLabelActive: {
    color: c.bg,
  },
  statPill: {
    flex: 1,
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statLabel: {
    ...Font.caption,
    color: c.textMuted,
    fontSize: 11,
  },
  statValue: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
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
  imHereButton: {
    backgroundColor: c.primary,
    borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm, shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  imHereText: { color: c.bg, fontSize: 16, fontWeight: '800' },
  shareInviteButton: {
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  shareInviteText: { color: c.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  endSessionButton: {
    borderWidth: 1, borderColor: c.accent,
    borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  endSessionText: { color: c.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: c.surface, padding: 24, borderRadius: Radius.lg, width: '80%', alignItems: 'center' },
  modalTitle: { ...Font.h3, color: c.textPrimary, marginBottom: 8 },
  modalText: { ...Font.body, color: c.textSecondary, marginBottom: 24 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.md, backgroundColor: c.borderLight },
  cancelText: { color: c.textPrimary, fontWeight: '600' },
  successCard: { backgroundColor: c.successBg || '#E6F4EA', padding: 32, borderRadius: Radius.xl, alignItems: 'center', borderWidth: 2, borderColor: c.success || '#34A853' },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '800', color: c.success || '#34A853', marginBottom: 8 },
  successText: { fontSize: 16, color: c.textSecondary, fontWeight: '500' },
});

export default ActiveSessionScreen;
