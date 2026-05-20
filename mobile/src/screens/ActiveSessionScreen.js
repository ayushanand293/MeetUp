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
  ScrollView,
  Platform,
  Dimensions,
  PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Svg, { Path } from 'react-native-svg';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLinking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import locationService from '../services/locationService';
import realtimeService from '../services/realtimeService';
import backgroundLocation from '../services/backgroundLocation';
import client from '../api/client';
import { authStorage } from '../api/authStorage';
import analyticsService from '../services/analyticsService';
import { getRoute, formatDistance, formatDuration, haversineDistance, TransportMode } from '../services/orsService';
import { useTheme, Spacing, Radius, Font } from '../theme';
import ModernDistanceBar from '../components/ModernDistanceBar';

const DEBUG = process.env.NODE_ENV !== 'production';
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const DEFAULT_ROUTE_MODE = TransportMode.WALKING.id;
const isValidRouteMode = mode => Object.values(TransportMode).some(item => item.id === mode);
const routeModeStorageKey = (sessionId, userId, scope = 'me') => `meetup_route_mode:${sessionId}:${userId || 'anon'}:${scope}`;

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
  const [selectedMode, setSelectedMode] = useState(DEFAULT_ROUTE_MODE);
  const [peerSelectedMode, setPeerSelectedMode] = useState(DEFAULT_ROUTE_MODE);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const selectedModeRef = useRef(DEFAULT_ROUTE_MODE); // ref avoids stale closure in timeout
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeFetchRef = useRef(null);
  const [destinationRouteCoords, setDestinationRouteCoords] = useState(null);
  const [destinationRouteDistance, setDestinationRouteDistance] = useState(null);
  const [destinationRouteDuration, setDestinationRouteDuration] = useState(null);
  const [peerDestinationRouteCoords, setPeerDestinationRouteCoords] = useState(null);
  const [peerDestinationRouteDistance, setPeerDestinationRouteDistance] = useState(null);
  const [peerDestinationRouteDuration, setPeerDestinationRouteDuration] = useState(null);
  const [destinationRouteLoading, setDestinationRouteLoading] = useState(false);
  const destinationRouteFetchRef = useRef(null);

  // Peer display name (passed from accept flow or friend param, or fetched from session)
  const [peerName, setPeerName] = useState(friend?.display_name || friend?.name || 'Peer');
  const [destination, setDestination] = useState(friend?.destination || null);
  const distanceText = formatSessionDistance(routeDistance);
  const durationText = routeDuration != null ? formatDuration(routeDuration) : null;
  const isWithinArrivalRange = routeDistance != null && routeDistance <= 50;
  const selectedTransportMode = Object.values(TransportMode).find(mode => mode.id === selectedMode) || TransportMode.WALKING;
  const peerTransportMode = Object.values(TransportMode).find(mode => mode.id === peerSelectedMode) || TransportMode.WALKING;
  const tapHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const impactHaptic = useCallback((style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  }, []);
  const screenHeight = Dimensions.get('window').height;
  const sheetCollapsedHeight = Math.round(screenHeight * 0.26);
  const sheetExpandedHeight = Math.round(screenHeight * 0.78);
  const sheetDragRange = sheetExpandedHeight - sheetCollapsedHeight;
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const sheetProgressRef = useRef(0);
  const sheetDragStartRef = useRef(0);
  const sheetMaxHeight = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetCollapsedHeight, sheetExpandedHeight],
  });

  const snapSheetTo = useCallback((nextProgress) => {
    if (Math.abs(sheetProgressRef.current - nextProgress) > 0.1) {
      impactHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
    sheetProgressRef.current = nextProgress;
    Animated.spring(sheetProgress, {
      toValue: nextProgress,
      useNativeDriver: false,
      damping: 22,
      stiffness: 190,
      mass: 0.9,
    }).start();
  }, [impactHaptic, sheetProgress]);

  const sheetPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => {
      sheetDragStartRef.current = sheetProgressRef.current;
    },
    onPanResponderMove: (_, gesture) => {
      const nextProgress = clamp(sheetDragStartRef.current - (gesture.dy / sheetDragRange), 0, 1);
      sheetProgress.setValue(nextProgress);
      sheetProgressRef.current = nextProgress;
    },
    onPanResponderRelease: (_, gesture) => {
      const projected = sheetProgressRef.current - (gesture.vy * 0.18);
      snapSheetTo(projected > 0.5 ? 1 : 0);
    },
    onPanResponderTerminate: () => {
      snapSheetTo(sheetProgressRef.current > 0.5 ? 1 : 0);
    },
  })).current;

  // Peer info
  const [peerLastSeenText, setPeerLastSeenText] = useState('Not yet connected');
  const [peerIsStale, setPeerIsStale] = useState(false);
  const [peerMayBeDelayed, setPeerMayBeDelayed] = useState(false);
  const [sharingPausedText, setSharingPausedText] = useState('');
  const [backgroundSharingText, setBackgroundSharingText] = useState('');
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
  const arrivalCtaScale = useRef(new Animated.Value(1)).current;
  const wasWithinArrivalRangeRef = useRef(false);
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
  const [arrivalCountdown, setArrivalCountdown] = useState(60);
  const arrivalTimerRef = useRef(null);
  const sessionLaunchStartedAtRef = useRef(Date.now());
  const [isSharingPaused, setIsSharingPaused] = useState(false);
  const awaitingFirstUpdateAfterResumeRef = useRef(false);
  const lastPropagationMetricAtRef = useRef(0);
  const reconnectMetricEmittedRef = useRef(false);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    if (isWithinArrivalRange && !wasWithinArrivalRangeRef.current) {
      wasWithinArrivalRangeRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.sequence([
        Animated.spring(arrivalCtaScale, {
          toValue: 1.05,
          useNativeDriver: true,
          damping: 12,
          stiffness: 220,
        }),
        Animated.spring(arrivalCtaScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 180,
        }),
      ]).start();
      return;
    }

    if (!isWithinArrivalRange) {
      wasWithinArrivalRangeRef.current = false;
    }
  }, [arrivalCtaScale, isWithinArrivalRange]);

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
        if (!isSharingPaused) {
          // If we weren't manually paused but were backgrounded, show resuming status
          if (locationService.isPaused) {
            awaitingFirstUpdateAfterResumeRef.current = true;
            setSharingPausedText('Sharing paused (resuming...)');
            locationService.resumeTracking('app_foregrounded');
          }
        }
        return;
      }

      if (nextState.match(/inactive|background/) && !isSharingPaused) {
        backgroundLocation.isBackgroundSharingActive().then((active) => {
          if (!isMountedRef.current) return;
          if (active) {
            setSharingPausedText('');
            setBackgroundSharingText('Background sharing is on.');
            if (locationService.isTracking) {
              locationService.pauseTracking('app_backgrounded');
            }
            return;
          }

          setBackgroundSharingText('');
          setSharingPausedText('Background sharing is off. Keep app open for live updates.');
          if (locationService.isTracking) {
            locationService.pauseTracking('app_backgrounded');
          }
        });
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
        const storedOwnMode = await AsyncStorage.getItem(routeModeStorageKey(activeSessionId, user?.id, 'me'));
        if (isValidRouteMode(storedOwnMode)) {
          selectedModeRef.current = storedOwnMode;
          setSelectedMode(storedOwnMode);
        } else {
          selectedModeRef.current = DEFAULT_ROUTE_MODE;
          setSelectedMode(DEFAULT_ROUTE_MODE);
        }

        const storedPeerMode = await AsyncStorage.getItem(routeModeStorageKey(activeSessionId, user?.id, 'peer'));
        if (isValidRouteMode(storedPeerMode)) {
          setPeerSelectedMode(storedPeerMode);
        }

        rememberActiveSession({
          session_id: activeSessionId,
          peer_id: friend?.id || null,
          peer_name: friend?.display_name || friend?.name || null,
        });

        try {
          const snapshotResponse = await client.get(`/sessions/${activeSessionId}/snapshot`);
          if (snapshotResponse?.data?.destination) {
            setDestination(snapshotResponse.data.destination);
          }
        } catch (_) {
          // Destination is additive; location streaming can still start if snapshot fetch is unavailable.
        }

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
        const accessToken = await authStorage.getAccessToken();
        if (!accessToken) {
          throw new Error('You are not signed in. Please sign in and try again.');
        }

        _subscribeToWsEvents();

        const wsBaseUrl = client.defaults.baseURL.replace('/api/v1', '');
        await realtimeService.connect(
          accessToken,
          activeSessionId,
          wsBaseUrl
        );
        realtimeService.sendRouteModeUpdate(selectedModeRef.current);

        setSessionId(activeSessionId);
        sessionIdRef.current = activeSessionId;
        const backgroundStart = await backgroundLocation.startBackgroundSharing(activeSessionId);
        if (!backgroundStart.started) {
          setBackgroundSharingText('Background sharing is off. Keep app open for live updates.');
        } else {
          setBackgroundSharingText('');
        }
        DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
        analyticsService.track('session_launch_success', {
          elapsed_ms: Date.now() - sessionLaunchStartedAtRef.current,
          session_start_latency_ms: Date.now() - sessionLaunchStartedAtRef.current,
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

      // Priority 3: End-to-end latency metric
      if (payload.client_ts_ms) {
        const nowMs = Date.now();
        const e2eLatencyMs = Math.max(0, nowMs - payload.client_ts_ms);
        
        // Use a 10-second throttle per session to avoid spamming analytics
        if (nowMs - lastPropagationMetricAtRef.current >= 10000) {
          DEBUG && console.log(`[ActiveSessionScreen] location_end_to_end_latency_ms=${e2eLatencyMs}`);
          lastPropagationMetricAtRef.current = nowMs;
          
          analyticsService.track('location_end_to_end_latency_ms', {
            session_id: sessionIdRef.current,
            latency_ms: e2eLatencyMs,
            sample_type: 'peer_update',
          });
        }
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

    unsubscribes.onPeerRouteMode = realtimeService.on('peerRouteMode', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Peer route mode:', payload.mode);
      if (!isMountedRef.current) return;
      if (isValidRouteMode(payload.mode)) {
        setPeerSelectedMode(payload.mode);
        if (sessionIdRef.current) {
          AsyncStorage.setItem(routeModeStorageKey(sessionIdRef.current, user?.id, 'peer'), payload.mode).catch(() => {});
        }
      }
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

          // Only alert after a long time (60s) to allow short background transitions
          peerOfflineAlertedRef.current = true;
          Alert.alert('Connection Paused', 'The other person may have temporarily lost connection. You can stay here and wait for them to reconnect.');
        }, 60000); // 60s
        return;
      }
    });

    unsubscribes.onSessionEnded = realtimeService.on('sessionEnded', (payload) => {
      DEBUG && console.log('[ActiveSessionScreen] Session ended:', payload.reason);
      if (!isMountedRef.current) return;

      if (payload.reason === 'PROXIMITY_REACHED' || payload.reason === 'MANUAL_CONFIRM') {
        if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current);
        backgroundLocation.stopBackgroundSharing(sessionIdRef.current);
        clearActiveSessionHint();
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
      backgroundLocation.stopBackgroundSharing(sessionIdRef.current);
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

    unsubscribes.onTrackingPaused = locationService.on('trackingPaused', (data) => {
      if (!isMountedRef.current) return;
      
      if (data?.reason === 'manual_pause') {
        setSharingPausedText('Sharing paused by you');
      } else if (data?.reason === 'screen_blurred') {
        setSharingPausedText('Sharing paused (screen not in view)');
      } else {
        // Default to background if not other specific reason provided or it's app_backgrounded
        setSharingPausedText('Sharing paused (app in background)');
      }
    });

    unsubscribes.onTrackingResumed = locationService.on('trackingResumed', (data) => {
      if (!isMountedRef.current) return;
      
      // If manually resumed, we clear immediately. 
      // If foregrounded, we wait for first WS update to clear (handled in streaming loop)
      if (data?.reason === 'manual_resume') {
        awaitingFirstUpdateAfterResumeRef.current = false;
        setSharingPausedText('');
      } else if (!awaitingFirstUpdateAfterResumeRef.current) {
        setSharingPausedText('');
      }
    });

    wsEventUnsubscribesRef.current = unsubscribes;
  }, [user?.id]);

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
        
        if (sent && awaitingFirstUpdateAfterResumeRef.current) {
          awaitingFirstUpdateAfterResumeRef.current = false;
          setSharingPausedText('');
        }
      }
    }, 3000); // Every 3 seconds

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [myLocation, wsStatus, isFocused, appState, isSharingPaused]);

  useEffect(() => {
    selectedModeRef.current = selectedMode;
    if (sessionIdRef.current && isValidRouteMode(selectedMode)) {
      AsyncStorage.setItem(routeModeStorageKey(sessionIdRef.current, user?.id, 'me'), selectedMode).catch(() => {});
    }
    if (realtimeService.getStatus().connected) {
      realtimeService.sendRouteModeUpdate(selectedMode);
    }
  }, [selectedMode, user?.id]);

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
      injectMapData({
        myLocation,
        peerLocation,
        routeCoords,
        peerName,
        destination,
        destinationRouteCoords,
        peerDestinationRouteCoords,
      });
    }
  }, [myLocation, peerLocation, routeCoords, peerName, destination, destinationRouteCoords, peerDestinationRouteCoords, injectMapData]);

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
        injectMapData({
          myLocation,
          peerLocation,
          routeCoords: result.coordinates,
          peerName,
          destination,
          destinationRouteCoords,
          peerDestinationRouteCoords,
        });
      } else {
        setRouteCoords(null);
        setRouteDistance(haversineDistance(myLocation, peerLocation));
        setRouteDuration(null);
      }
      setRouteLoading(false);
    }, 2000); // 2s debounce

    return () => clearTimeout(routeFetchRef.current);
  }, [myLocation?.lat, myLocation?.lon, peerLocation?.lat, peerLocation?.lon, selectedMode, destination]);

  /**
   * Fetch route guidance to the selected destination.
   */
  useEffect(() => {
    if (!destination || !myLocation) {
      setDestinationRouteCoords(null);
      setDestinationRouteDistance(null);
      setDestinationRouteDuration(null);
      setPeerDestinationRouteCoords(null);
      setPeerDestinationRouteDistance(null);
      setPeerDestinationRouteDuration(null);
      return;
    }

    selectedModeRef.current = selectedMode;
    if (destinationRouteFetchRef.current) clearTimeout(destinationRouteFetchRef.current);

    destinationRouteFetchRef.current = setTimeout(async () => {
      const mode = selectedModeRef.current;
      const destinationPoint = { lat: Number(destination.lat), lon: Number(destination.lon) };
      setDestinationRouteLoading(true);

      const [myRoute, friendRoute] = await Promise.all([
        getRoute(myLocation, destinationPoint, mode),
        peerLocation ? getRoute(peerLocation, destinationPoint, peerSelectedMode) : Promise.resolve(null),
      ]);

      if (myRoute) {
        setDestinationRouteCoords(myRoute.coordinates);
        setDestinationRouteDistance(myRoute.distanceM);
        setDestinationRouteDuration(myRoute.durationSec);
      } else {
        setDestinationRouteCoords([[myLocation.lat, myLocation.lon], [destinationPoint.lat, destinationPoint.lon]]);
        setDestinationRouteDistance(haversineDistance(myLocation, destinationPoint));
        setDestinationRouteDuration(null);
      }

      if (friendRoute) {
        setPeerDestinationRouteCoords(friendRoute.coordinates);
        setPeerDestinationRouteDistance(friendRoute.distanceM);
        setPeerDestinationRouteDuration(friendRoute.durationSec);
      } else if (peerLocation) {
        setPeerDestinationRouteCoords([[peerLocation.lat, peerLocation.lon], [destinationPoint.lat, destinationPoint.lon]]);
        setPeerDestinationRouteDistance(haversineDistance(peerLocation, destinationPoint));
        setPeerDestinationRouteDuration(null);
      } else {
        setPeerDestinationRouteCoords(null);
        setPeerDestinationRouteDistance(null);
        setPeerDestinationRouteDuration(null);
      }

      setDestinationRouteLoading(false);
    }, 1800);

    return () => clearTimeout(destinationRouteFetchRef.current);
  }, [destination?.lat, destination?.lon, myLocation?.lat, myLocation?.lon, peerLocation?.lat, peerLocation?.lon, selectedMode, peerSelectedMode]);

  const destinationDistanceText = destinationRouteDistance != null
    ? formatDistance(destinationRouteDistance)
    : null;
  const peerDestinationDistanceText = peerDestinationRouteDistance != null
    ? formatDistance(peerDestinationRouteDistance)
    : null;
  const destinationEtaText = destinationRouteDuration != null
    ? formatDuration(destinationRouteDuration)
    : null;
  const peerDestinationEtaText = peerDestinationRouteDuration != null
    ? formatDuration(peerDestinationRouteDuration)
    : null;

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
      setPeerMayBeDelayed(diffSeconds > 60);
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
              backgroundLocation.stopBackgroundSharing(sessionId);
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
    backgroundLocation.stopBackgroundSharing(sessionIdRef.current);
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
            .leaflet-container {
              background: #eef2f3;
              cursor: grab;
            }
            .leaflet-container:active {
              cursor: grabbing;
            }
            .leaflet-tile {
              filter: contrast(1.12) saturate(1.16) brightness(0.99);
            }
            .leaflet-control-zoom {
              border: 1px solid rgba(23,33,47,0.18) !important;
              box-shadow: 0 6px 18px rgba(0,0,0,0.12);
              border-radius: 12px;
              overflow: hidden;
            }
            .leaflet-control-zoom a {
              color: #111827 !important;
              font-weight: 800;
            }
            .label-icon { background: transparent; border: none; }
            .marker-label-wrap {
              transform: translateY(20px);
              display: flex;
              justify-content: center;
            }
            .marker-label {
              font-size: 11px;
              font-weight: 800;
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
              width: 17px;
              height: 17px;
              border-radius: 9px;
              border: 2px solid #ffffff;
              box-shadow: 0 0 0 3px var(--marker-color), 0 7px 18px rgba(0, 0, 0, 0.32);
              background: var(--marker-color);
              position: relative;
            }
            .user-marker::after {
              content: '';
              position: absolute;
              width: 26px;
              height: 26px;
              left: -8px;
              top: -8px;
              border-radius: 13px;
              border: 1.5px solid var(--marker-color);
              opacity: 0.15;
              animation: userPulse 3s infinite ease-out;
            }
            .peer-marker {
              width: 17px;
              height: 17px;
              border-radius: 9px;
              border: 2px solid #ffffff;
              box-shadow: 0 0 0 3px var(--marker-color), 0 7px 18px rgba(0, 0, 0, 0.32);
              background: var(--marker-color);
              position: relative;
            }
            .peer-marker::after {
              content: '';
              position: absolute;
              width: 32px;
              height: 32px;
              left: -11px;
              top: -11px;
              border-radius: 16px;
              background: var(--marker-color);
              opacity: 0.25;
              animation: peerPulse 2.2s infinite ease-out;
            }
            @keyframes userPulse {
              0% { transform: scale(0.8); opacity: 0.2; }
              100% { transform: scale(1.6); opacity: 0; }
            }
            @keyframes peerPulse {
              0% { transform: scale(0.6); opacity: 0.4; }
              100% { transform: scale(1.4); opacity: 0; }
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const map = L.map('map', {
              zoomControl: true,
              inertia: true,
              inertiaDeceleration: 2600,
              preferCanvas: true,
              tap: true,
              zoomSnap: 0.25
            }).setView([37.7749, -122.4194], 14);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/${colors.mapTile}/{z}/{x}/{y}{r}.png', {
              attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
              subdomains: 'abcd',
              maxZoom: 19
            }).addTo(map);

            let myMarker, peerMarker, destinationMarker, myLabel, peerLabel, destinationLabel, myCircle, peerCircle, routeLine, routeLineHalo, destinationRouteLine, destinationRouteLineHalo, peerDestinationRouteLine, peerDestinationRouteLineHalo;
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
                iconSize: [17, 17],
                iconAnchor: [8.5, 8.5]
              });
            }

            function makeDestinationIcon() {
              return L.divIcon({
                className: 'label-icon',
                html: '<div style="width:24px;height:24px;border-radius:14px;background:#ffffff;border:2px solid #17212f;box-shadow:0 4px 10px rgba(0,0,0,0.24);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:4px;background:#17212f;"></div></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              });
            }

            window.updateMap = (data) => {
              const { myLocation, peerLocation, routeCoords, peerName, destination, destinationRouteCoords, peerDestinationRouteCoords } = data;
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
                if (routeLineHalo) routeLineHalo.setLatLngs(routeCoords);
                else routeLineHalo = L.polyline(routeCoords, { color: '#ffffff', weight: 7.5, opacity: 0.82, dashArray: '10 6', lineCap: 'round', lineJoin: 'round' }).addTo(map);
                if (routeLine) routeLine.setLatLngs(routeCoords);
                else routeLine = L.polyline(routeCoords, { color: '${colors.routeLine}', weight: 4.5, opacity: 0.86, dashArray: '10 6', lineCap: 'round', lineJoin: 'round' }).addTo(map);
              } else {
                if (routeLine) { routeLine.remove(); routeLine = null; }
                if (routeLineHalo) { routeLineHalo.remove(); routeLineHalo = null; }
              }

              if (destinationRouteCoords && destinationRouteCoords.length > 1) {
                if (destinationRouteLineHalo) destinationRouteLineHalo.setLatLngs(destinationRouteCoords);
                else destinationRouteLineHalo = L.polyline(destinationRouteCoords, { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
                if (destinationRouteLine) destinationRouteLine.setLatLngs(destinationRouteCoords);
                else destinationRouteLine = L.polyline(destinationRouteCoords, { color: '${colors.myMarker}', weight: 5.5, opacity: 0.94, lineCap: 'round', lineJoin: 'round' }).addTo(map);
              } else {
                if (destinationRouteLine) { destinationRouteLine.remove(); destinationRouteLine = null; }
                if (destinationRouteLineHalo) { destinationRouteLineHalo.remove(); destinationRouteLineHalo = null; }
              }

              if (peerDestinationRouteCoords && peerDestinationRouteCoords.length > 1) {
                if (peerDestinationRouteLineHalo) peerDestinationRouteLineHalo.setLatLngs(peerDestinationRouteCoords);
                else peerDestinationRouteLineHalo = L.polyline(peerDestinationRouteCoords, { color: '#ffffff', weight: 8, opacity: 0.82, dashArray: '8 7', lineCap: 'round', lineJoin: 'round' }).addTo(map);
                if (peerDestinationRouteLine) peerDestinationRouteLine.setLatLngs(peerDestinationRouteCoords);
                else peerDestinationRouteLine = L.polyline(peerDestinationRouteCoords, { color: '${colors.peerMarker}', weight: 4.5, opacity: 0.74, dashArray: '8 7', lineCap: 'round', lineJoin: 'round' }).addTo(map);
              } else {
                if (peerDestinationRouteLine) { peerDestinationRouteLine.remove(); peerDestinationRouteLine = null; }
                if (peerDestinationRouteLineHalo) { peerDestinationRouteLineHalo.remove(); peerDestinationRouteLineHalo = null; }
              }

              if (destination) {
                const { lat, lon, name } = destination;
                if (destinationMarker) {
                  destinationMarker.setLatLng([lat, lon]);
                } else {
                  destinationMarker = L.marker([lat, lon], { icon: makeDestinationIcon(), zIndexOffset: 900 }).addTo(map);
                  destinationLabel = L.marker([lat, lon], { icon: makeLabel(name || 'Place', 'destination'), interactive: false, zIndexOffset: 1100 }).addTo(map);
                }
                if (destinationLabel) destinationLabel.setLatLng([lat, lon]);
              }

              // Fit both markers on first load
              if (firstFit && myLocation && peerLocation) {
                firstFit = false;
                const points = [[myLocation.lat, myLocation.lon], [peerLocation.lat, peerLocation.lon]];
                if (destination) points.push([destination.lat, destination.lon]);
                const bounds = L.latLngBounds(points);
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

      {!!backgroundSharingText && !sharingPausedText && (
        <View style={s.pauseBanner}>
          <Text style={s.pauseText}>{backgroundSharingText}</Text>
        </View>
      )}

      {peerLocation && (
        <View style={s.mapModeControl}>
          <TouchableOpacity
            style={s.mapModeButton}
            activeOpacity={0.85}
            onPress={() => setModeMenuOpen(open => !open)}
          >
            {routeLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={s.mapModeIcon}>{selectedTransportMode.icon}</Text>
            )}
            <Text style={s.mapModeChevron}>{modeMenuOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {modeMenuOpen && (
            <View style={s.modeMenu}>
              {Object.values(TransportMode).map(mode => (
                <TouchableOpacity
                  key={mode.id}
                  style={[s.modeMenuItem, selectedMode === mode.id && s.modeMenuItemActive]}
                  activeOpacity={0.85}
                  onPress={() => {
                    tapHaptic();
                    setSelectedMode(mode.id);
                    setModeMenuOpen(false);
                  }}
                >
                  <Text style={s.modeMenuIcon}>{mode.icon}</Text>
                  <Text style={[s.modeMenuLabel, selectedMode === mode.id && s.modeMenuLabelActive]}>
                    {mode.label}
                  </Text>
                  {selectedMode === mode.id && <Text style={s.modeMenuCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

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
              : wsStatus === 'reconnecting' ? `${reconnectCountdown}s`
                  : wsStatus === 'failed' ? 'Offline'
                    : 'Offline'}
            </Text>
          </View>

          <View style={s.sessionActions}>
            <TouchableOpacity
              style={[s.sessionAction, isSharingPaused && s.sessionActionActive]}
              accessibilityLabel={isSharingPaused ? 'Resume sharing' : 'Pause sharing'}
              onPress={() => {
                impactHaptic();
                handleTogglePauseSharing();
              }}
            >
              <Text style={[s.sessionActionIcon, isSharingPaused && s.sessionActionLabelActive]}>{isSharingPaused ? '▶' : 'Ⅱ'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sessionAction, s.sessionActionDanger]}
              accessibilityLabel="End meetup"
              onPress={() => {
              impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
              handleEndSession();
            }}>
              <Text style={[s.sessionActionIcon, s.sessionActionDangerText]}>×</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sessionAction, isSharingInvite && s.buttonDisabled]}
              accessibilityLabel="Share invite"
              onPress={() => {
                tapHaptic();
                handleShareInvite();
              }}
              disabled={isSharingInvite || !sessionId}
            >
              {isSharingInvite ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <ShareNetworkIcon color={colors.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {routeDistance != null && (
        <View style={s.mapDistanceChip}>
          <ModernDistanceBar
            distanceM={routeDistance}
            maxDistanceM={500}
            colors={colors}
            variant="mapChip"
            onPress={() => {
              impactHaptic(Haptics.ImpactFeedbackStyle.Medium);
              snapSheetTo(1);
            }}
          />
        </View>
      )}

      {/* Bottom Panel */}
      <Animated.View style={[s.bottomPanel, { maxHeight: sheetMaxHeight }]}>
        <View style={s.sheetGrabberHitArea} {...sheetPanResponder.panHandlers}>
          <View style={s.sheetGrabber} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={true}
          contentContainerStyle={s.bottomPanelContent}
        >
        <View style={s.infoRow}>
          <View style={s.peerInfo}>
            <Text style={s.peerName}>{peerName}</Text>
          </View>
          <Text style={s.peerSub}>
            {peerLocation ? `Updated ${peerLastSeenText}` : 'Waiting for location...'}
            {peerMayBeDelayed ? ' • May be delayed by OS power settings' : ''}
          </Text>
        </View>

        {(distanceText || durationText) && (
          <View style={s.routeSummary}>
            <View style={s.routePulse}>
              <View style={s.routePulseDot} />
            </View>
            <View style={s.routeSummaryCopy}>
              <Text style={s.routeSummaryKicker}>Current route</Text>
              <Text style={s.routeSummaryTitle}>
                {durationText ? `${durationText} ETA` : 'ETA pending'}
              </Text>
            </View>
            <View style={s.routeSummaryMode}>
              <Text style={s.routeSummaryModeIcon}>{selectedTransportMode.icon}</Text>
            </View>
          </View>
        )}

        {!!destination && (
          <View style={s.destinationCard}>
            <View style={s.destinationHeader}>
              <View style={s.destinationPin}>
                <Text style={s.destinationPinText}>⌖</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.destinationKicker}>MEET AT</Text>
                <Text style={s.destinationName} numberOfLines={1}>{destination.name}</Text>
                {!!destination.address && (
                  <Text style={s.destinationAddress} numberOfLines={2}>{destination.address}</Text>
                )}
              </View>
            </View>

            <View style={s.destinationStats}>
              <DestinationMetric label="You" distance={destinationDistanceText} eta={destinationEtaText} colors={colors} variant="you" mode={selectedTransportMode} />
              <DestinationMetric label={peerName} distance={peerDestinationDistanceText} eta={peerDestinationEtaText} colors={colors} muted={!peerLocation} variant="friend" mode={peerTransportMode} />
            </View>

            <View style={s.destinationFooter}>
              <View style={s.destinationFooterDot} />
              <Text style={s.destinationRouteHint}>
                {destinationRouteLoading ? 'Updating routes' : destinationRouteDuration ? 'Routes shown on map' : 'Direct line until routing is ready'}
              </Text>
            </View>
            {peerMayBeDelayed && <Text style={s.destinationStaleText}>Friend last seen {peerLastSeenText}</Text>}
          </View>
        )}

        </ScrollView>
      </Animated.View>

      {isWithinArrivalRange && !isConfirmingArrival && (
        <Animated.View style={[s.arrivalActionWrap, { transform: [{ scale: arrivalCtaScale }] }]}>
          <TouchableOpacity
            style={s.arrivalAction}
            activeOpacity={0.88}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              handleImHere();
            }}
          >
            <View style={s.arrivalActionPulse}>
              <View style={s.arrivalActionDot} />
            </View>
            <Text style={s.arrivalActionText}>I'm Here</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

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
            <ActivityIndicator size="large" color={colors.textPrimary} style={{ marginBottom: 16 }} />
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
  initIssueTitle: { ...Font.subtitle, color: c.textPrimary, marginBottom: 8 },
  initIssueText: { ...Font.body, color: c.textSecondary, marginBottom: Spacing.md, lineHeight: 22 },
  initIssuePrimaryButton: {
    backgroundColor: c.textPrimary,
    borderRadius: Radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  initIssuePrimaryText: { color: c.bg, fontWeight: '800', fontSize: 15 },
  initIssueSecondaryButton: {
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  initIssueSecondaryText: { color: c.textPrimary, fontWeight: '700', fontSize: 14 },
  initIssueLinkButton: { paddingVertical: 8, alignItems: 'center' },
  initIssueLinkText: { color: c.textMuted, fontWeight: '700', fontSize: 13 },

  statusBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.cardBg,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  statusConnected: {
    borderColor: 'rgba(52,199,89,0.45)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  statusReconnecting: { borderColor: c.warning },
  statusFailed: { borderColor: c.accent },
  statusDisconnected: {},
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  dotGreen: { backgroundColor: '#34C759' },
  dotOrange: { backgroundColor: c.warning },
  dotRed: { backgroundColor: c.accent },
  dotGray: { backgroundColor: c.textMuted },
  statusText: { fontSize: 12, fontWeight: '800', color: c.textPrimary },

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
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: c.surfaceGlass || c.surface,
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12,
  },
  sheetGrabberHitArea: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: c.borderLight,
  },
  bottomPanelContent: {
    paddingBottom: 4,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  peerInfo: { flex: 1, minWidth: 92 },
  peerName: { color: c.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: -0.2 },
  peerSub: { color: c.textMuted, fontSize: 11, fontWeight: '800', lineHeight: 14, textAlign: 'right', marginTop: 5, maxWidth: '48%' },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.textPrimary,
    borderWidth: 1,
    borderColor: c.textPrimary,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  routePulse: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  routePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  routeSummaryCopy: {
    flex: 1,
  },
  routeSummaryKicker: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  routeSummaryTitle: {
    color: c.bg,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  routeSummaryMode: {
    minWidth: 36,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  routeSummaryModeIcon: {
    fontSize: 17,
  },
  destinationCard: {
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2,
  },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  destinationPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  destinationPinText: {
    color: c.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  destinationKicker: { color: c.textMuted, fontSize: 10, fontWeight: '900', marginBottom: 2, letterSpacing: 0.5 },
  destinationName: { color: c.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  destinationAddress: { color: c.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 16 },
  destinationStats: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  destinationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    paddingHorizontal: 2,
  },
  destinationFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.online,
    marginRight: 7,
  },
  destinationRouteHint: { color: c.textMuted, fontSize: 10, fontWeight: '800' },
  destinationStaleText: { color: c.warning, fontSize: 11, fontWeight: '700', marginTop: 5 },
  sessionActions: {
    marginTop: 8,
    gap: 7,
    alignItems: 'flex-end',
  },
  sessionAction: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.cardBg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
  },
  sessionActionActive: {
    backgroundColor: c.textPrimary,
    borderColor: c.textPrimary,
  },
  sessionActionDanger: {
    borderColor: c.border,
  },
  sessionActionIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: c.textPrimary,
  },
  sessionActionLabelActive: {
    color: c.bg,
  },
  sessionActionDangerText: {
    color: c.accent,
  },
  statLabel: {
    ...Font.caption,
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  statValue: {
    color: c.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.35,
  },
  distanceBadge: { alignItems: 'flex-end' },
  distanceValue: { fontSize: 22, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.5 },
  etaValue: { ...Font.caption, color: c.textMuted, marginTop: 2 },

  mapModeControl: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 76 : 16,
    right: 16,
    alignItems: 'flex-end',
    zIndex: 20,
    elevation: 20,
  },
  mapModeButton: {
    width: 54,
    height: 46,
    borderRadius: 16,
    backgroundColor: c.cardBg,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
  mapModeIcon: {
    fontSize: 21,
    marginRight: 2,
  },
  mapModeChevron: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 14,
    marginTop: 2,
  },
  mapDistanceChip: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 78 : 18,
    right: 86,
    zIndex: 18,
    elevation: 18,
  },
  modeMenu: {
    width: 138,
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: c.cardBg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 10,
  },
  modeMenuItem: {
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeMenuItemActive: {
    backgroundColor: c.textPrimary,
  },
  modeMenuIcon: {
    fontSize: 16,
    marginRight: 9,
  },
  modeMenuLabel: {
    flex: 1,
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  modeMenuLabelActive: {
    color: c.bg,
  },
  modeMenuCheck: {
    color: c.bg,
    fontSize: 13,
    fontWeight: '900',
  },

  mapLoading: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center',
    alignItems: 'center', backgroundColor: c.bg,
  },
  arrivalActionWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: Platform.OS === 'ios' ? 28 : 20,
    zIndex: 35,
    elevation: 35,
  },
  arrivalAction: {
    minHeight: 58,
    backgroundColor: c.textPrimary,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: c.textPrimary,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 12,
  },
  arrivalActionPulse: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(52,199,89,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  arrivalActionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
  },
  arrivalActionText: {
    color: c.bg,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  endSessionButton: {
    borderWidth: 1, borderColor: c.accent,
    borderRadius: Radius.pill, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  endSessionText: { color: c.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: c.surface, padding: 32, borderRadius: Radius.xl, width: '80%', alignItems: 'center', borderWidth: 1, borderColor: c.border, shadowColor: c.textPrimary, shadowOpacity: 0.1, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 10 },
  modalTitle: { ...Font.subtitle, color: c.textPrimary, marginBottom: 8 },
  modalText: { ...Font.body, color: c.textSecondary, marginBottom: 24, textAlign: 'center' },
  cancelButton: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: Radius.pill, backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border },
  cancelText: { color: c.textPrimary, fontWeight: '800' },
  successCard: { backgroundColor: c.successBg, padding: 32, borderRadius: Radius.xl, alignItems: 'center', borderWidth: 2, borderColor: c.textPrimary },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '800', color: c.textPrimary, marginBottom: 8 },
  successText: { fontSize: 16, color: c.textSecondary, fontWeight: '500' },
});

const DestinationMetric = ({ label, distance, eta, colors, muted, variant, mode }) => {
  const isFriend = variant === 'friend';
  const routeColor = isFriend ? colors.peerMarker : colors.myMarker;
  const dashSegments = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <View style={{
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      opacity: muted ? 0.55 : 1,
    }}>
      <View style={{
        width: 78,
        flexDirection: 'row',
        alignItems: 'center',
      }}>
        <View style={{
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: routeColor,
          opacity: isFriend ? 0.55 : 1,
          marginRight: 8,
        }} />
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <View style={{
        flex: 1,
        height: 16,
        justifyContent: 'center',
        marginRight: 10,
      }}>
        {isFriend ? (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            opacity: 0.42,
          }}>
            {dashSegments.map(segment => (
              <View
                key={segment}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: routeColor,
                  marginRight: segment === dashSegments.length - 1 ? 0 : 5,
                }}
              />
            ))}
          </View>
        ) : (
          <View style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: routeColor,
            opacity: 0.95,
          }} />
        )}
        <View style={{
          position: 'absolute',
          right: 0,
          width: 9,
          height: 9,
          borderRadius: 5,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: routeColor,
        }} />
      </View>

      <View style={{ minWidth: 86, alignItems: 'flex-end' }}>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', letterSpacing: -0.25 }}>
          {distance || 'Waiting'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          {!!mode?.icon && (
            <Text style={{ fontSize: 10, marginRight: 4 }}>
              {mode.icon}
            </Text>
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
            {eta || 'ETA pending'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const ShareNetworkIcon = ({ color }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path
      d="M3.6 11.2L20.2 4.2C20.8 3.95 21.42 4.55 21.18 5.16L14.38 20.9C14.08 21.58 13.1 21.5 12.93 20.78L11.18 13.3L3.82 12.66C3.08 12.6 2.9 11.5 3.6 11.2Z"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <Path
      d="M11.28 13.18L20.78 4.58"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </Svg>
);

export default ActiveSessionScreen;
