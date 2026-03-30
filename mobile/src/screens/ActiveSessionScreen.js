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
  Share,
  Animated,
  Easing,
} from 'react-native';
import * as Linking from 'expo-linking';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import locationService from '../services/locationService';
import realtimeService from '../services/realtimeService';
import analyticsService from '../services/analyticsService';
import client from '../api/client';
import { supabase } from '../api/supabase';
import { getRoute, formatDistance, formatDuration, haversineDistance, TransportMode } from '../services/orsService';
import { useTheme, Spacing, Radius, Font } from '../theme';
import ModernDistanceBar from '../components/ModernDistanceBar';

const DEBUG = process.env.NODE_ENV !== 'production';

const ActiveSessionScreen = ({ route, navigation }) => {
  const {
    friend,
    sessionId: routeSessionId,
    fromInvite,
    inviteToken,
  } = route.params || {};
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  // Location state
  const [myLocation, setMyLocation] = useState(null);
  const [peerLocation, setPeerLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isLocationPaused, setIsLocationPaused] = useState(false);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);

  // WebSocket state
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [wsError, setWsError] = useState(null);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionNotice, setConnectionNotice] = useState(null);

  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);
  const [isSharingInvite, setIsSharingInvite] = useState(false);
  const [isIAmHereOpen, setIsIAmHereOpen] = useState(false);
  const [iAmHereCountdown, setIAmHereCountdown] = useState(60);
  const [iAmHereWaiting, setIAmHereWaiting] = useState(false);
  const [isSubmittingIAmHere, setIsSubmittingIAmHere] = useState(false);
  const [showMeetingDetected, setShowMeetingDetected] = useState(false);
  const [showInviteJoined, setShowInviteJoined] = useState(!!fromInvite);
  const [inviteTokenIssue, setInviteTokenIssue] = useState(false);

  // Routing state
  const [selectedMode, setSelectedMode] = useState('foot-walking');
  const selectedModeRef = useRef('foot-walking'); // ref avoids stale closure in timeout
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeFetchRef = useRef(null);
  const iAmHereTimerRef = useRef(null);
  const iAmHereWaitingTimeoutRef = useRef(null);
  const iAmHereWaitingStateRef = useRef(false);
  const lastImHereSubmitRef = useRef(0);

  // Peer display name (passed from accept flow or friend param)
  const peerName = friend?.display_name || friend?.name || 'Peer';

  // Peer info
  const [peerLastSeenText, setPeerLastSeenText] = useState('Not yet connected');
  const [peerIsStale, setPeerIsStale] = useState(false);
  const [peerLocationExpired, setPeerLocationExpired] = useState(false);
  const directDistanceM = myLocation && peerLocation ? haversineDistance(myLocation, peerLocation) : null;
  const canConfirmArrival = directDistanceM != null && directDistanceM <= 50;

  // Refs for cleanup
  const webViewRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const lastSeenUpdateRef = useRef(null);
  const locationUnsubscribeRef = useRef(null);
  const wsEventUnsubscribesRef = useRef({});
  const locationEventUnsubscribesRef = useRef([]);
  const countdownIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const iAmHerePulse = useRef(new Animated.Value(1)).current;
  const successScale = useRef(new Animated.Value(0.94)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successRippleScale = useRef(new Animated.Value(0.7)).current;
  const successRippleOpacity = useRef(new Animated.Value(0)).current;
  const noticeOpacity = useRef(new Animated.Value(0)).current;
  const noticeTranslateY = useRef(new Animated.Value(-6)).current;
  const noticeTimeoutRef = useRef(null);
  const lastWsStatusRef = useRef('disconnected');
  // WebView load state
  const webViewReadyRef = useRef(false);
  const lastMapDataRef = useRef(null);

  const pushConnectionNotice = useCallback((message, tone = 'neutral') => {
    setConnectionNotice({
      key: Date.now(),
      message,
      tone,
    });
  }, []);

  const fetchSessionSnapshot = useCallback(async (targetSessionId = sessionId) => {
    if (!targetSessionId) return;

    try {
      setIsRefreshingSnapshot(true);
      const response = await client.get(`/sessions/${targetSessionId}/snapshot`);
      const locations = response?.data?.locations || {};

      const peerEntry = Object.entries(locations).find(([uid]) => uid !== String(user?.id));
      if (peerEntry && peerEntry[1]) {
        const payload = peerEntry[1];
        const mapped = {
          user_id: peerEntry[0],
          lat: payload.lat,
          lon: payload.lon,
          accuracy_m: payload.accuracy_m,
          timestamp: payload.timestamp,
          receivedAt: new Date(payload.timestamp || Date.now()),
        };
        setPeerLocation(mapped);
        setPeerLastSeenText('Just now');
        setPeerIsStale(false);
        setPeerLocationExpired(false);
      }
    } catch (error) {
      DEBUG && console.log('[ActiveSessionScreen] Snapshot refresh skipped:', error?.message || error);
    } finally {
      setIsRefreshingSnapshot(false);
    }
  }, [sessionId, user?.id]);

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

        if (inviteToken) {
          try {
            await client.post(`/sessions/${activeSessionId}/invite/redeem`, { token: inviteToken });
            if (isMountedRef.current) {
              setShowInviteJoined(true);
              setInviteTokenIssue(false);
            }
            analyticsService.track('invite_token_redeemed', {
              sessionId: activeSessionId,
            });
          } catch (error) {
            const statusCode = error?.response?.status;

            // If backend doesn't expose redeem yet, keep flow working without surfacing a warning.
            if (statusCode === 404 || statusCode == null) {
              analyticsService.track('invite_token_redeem_unavailable', {
                sessionId: activeSessionId,
                status: statusCode || null,
              });
              DEBUG && console.log('[ActiveSessionScreen] Invite redeem endpoint unavailable; continuing');
            } else if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 410) {
              if (isMountedRef.current) {
                setInviteTokenIssue(true);
              }
              analyticsService.track('invite_token_redeem_invalid', {
                sessionId: activeSessionId,
                status: statusCode,
              });
            } else {
              analyticsService.track('invite_token_redeem_failed', {
                sessionId: activeSessionId,
                status: statusCode || null,
              });
              DEBUG && console.log('[ActiveSessionScreen] Invite redeem non-blocking error:', error?.message || error);
            }
          }
        }

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

        const unsubscribes = [
          locationService.on('trackingPaused', () => {
            if (!isMountedRef.current) return;
            setIsLocationPaused(true);
          }),
          locationService.on('trackingResumed', () => {
            if (!isMountedRef.current) return;
            setIsLocationPaused(false);
            fetchSessionSnapshot(activeSessionId);
          }),
          locationService.on('trackingStarted', () => {
            if (!isMountedRef.current) return;
            setIsLocationPaused(false);
          }),
        ];
        locationEventUnsubscribesRef.current = unsubscribes;

        if (!trackingStarted) {
          throw new Error('Failed to start location tracking.');
        }

        // 4. Get initial location
        const initialLocation = await locationService.getCurrentLocation();
        if (initialLocation) {
          setMyLocation(initialLocation);
        }

        // 4b. Prime peer position from snapshot fallback (TTL-backed)
        await fetchSessionSnapshot(activeSessionId);

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
  }, [fetchSessionSnapshot, inviteToken, routeSessionId]);

  /**
   * Subscribe to WebSocket events
   */
  const _subscribeToWsEvents = useCallback(() => {
    const unsubscribes = {};

    unsubscribes.onConnected = realtimeService.on('connected', () => {
      DEBUG && console.log('[ActiveSessionScreen] WebSocket connected');
      if (!isMountedRef.current) return;
      const prevStatus = lastWsStatusRef.current;
      setWsStatus('connected');
      setWsError(null);
      setReconnectCountdown(0);
      setReconnectAttempt(0);
      lastWsStatusRef.current = 'connected';

      if (prevStatus !== 'connected') {
        pushConnectionNotice('Connection restored. Syncing latest positions...', 'success');
        fetchSessionSnapshot();
      }
    });

    unsubscribes.onStatusChange = realtimeService.on('statusChange', (data) => {
      DEBUG && console.log('[ActiveSessionScreen] WS status changed:', data.status);
      if (!isMountedRef.current) return;
      const nextStatus = data.status;
      const prevStatus = lastWsStatusRef.current;

      setWsStatus(nextStatus);

      if ((nextStatus === 'reconnecting' || nextStatus === 'grace') && data.nextRetryIn) {
        setReconnectCountdown(Math.ceil(data.nextRetryIn / 1000));
      }

      if (nextStatus === 'grace' && prevStatus !== 'grace') {
        pushConnectionNotice('Network interrupted. Holding session in grace mode...', 'warning');
      }

      if (nextStatus === 'reconnecting') {
        setReconnectAttempt((prev) => {
          if (typeof data.attempt === 'number' && data.attempt > 0) {
            return data.attempt;
          }
          return prev + 1;
        });
        if (prevStatus !== 'reconnecting') {
          pushConnectionNotice('Attempting to reconnect to live updates...', 'warning');
        }
      }

      if (nextStatus === 'connected') {
        setReconnectAttempt(0);
        if (prevStatus !== 'connected') {
          pushConnectionNotice('Back online. Sync complete.', 'success');
          fetchSessionSnapshot();
        }
      }

      lastWsStatusRef.current = nextStatus;
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

      if (payload.reason === 'PROXIMITY_REACHED') {
        setIAmHereWaiting(false);
        if (iAmHereWaitingTimeoutRef.current) {
          clearTimeout(iAmHereWaitingTimeoutRef.current);
          iAmHereWaitingTimeoutRef.current = null;
        }
        setShowMeetingDetected(true);
        setTimeout(() => {
          if (!isMountedRef.current) return;
          _cleanup();
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
        }, 1800);
        return;
      }

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

      // Suppress rate limit errors from alerting user - handled transparently by client-side throttling
      if (payload.code === 'RATE_LIMIT_EXCEEDED') {
        DEBUG && console.log('[ActiveSessionScreen] Rate limit (suppressed for UX)');
        return;
      }

      setWsError(`Error: ${payload.message}`);
    });

    wsEventUnsubscribesRef.current = unsubscribes;
  }, [fetchSessionSnapshot, pushConnectionNotice]);

  /**
   * Location streaming loop
   */
  useEffect(() => {
    if (!myLocation || wsStatus !== 'connected' || isLocationPaused) return;

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
  }, [isLocationPaused, myLocation, wsStatus]);

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

      // Week 4: stale and expiry signal (TTL store target is 120s)
      setPeerIsStale(diffSeconds > 15);
      setPeerLocationExpired(diffSeconds > 120);
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

  useEffect(() => {
    if (!connectionNotice) return;

    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }

    noticeOpacity.setValue(0);
    noticeTranslateY.setValue(-6);

    Animated.parallel([
      Animated.timing(noticeOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(noticeTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    noticeTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(noticeOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(noticeTranslateY, {
          toValue: -6,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isMountedRef.current) return;
        setConnectionNotice((current) => (current?.key === connectionNotice.key ? null : current));
      });
    }, 2400);

    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
        noticeTimeoutRef.current = null;
      }
    };
  }, [connectionNotice, noticeOpacity, noticeTranslateY]);

  useEffect(() => {
    iAmHereWaitingStateRef.current = iAmHereWaiting;
  }, [iAmHereWaiting]);

  useEffect(() => {
    if (!showInviteJoined) return;
    const t = setTimeout(() => setShowInviteJoined(false), 2600);
    return () => clearTimeout(t);
  }, [showInviteJoined]);

  useEffect(() => {
    if (!canConfirmArrival || iAmHereWaiting) {
      iAmHerePulse.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iAmHerePulse, {
          toValue: 1.03,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(iAmHerePulse, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [canConfirmArrival, iAmHerePulse, iAmHereWaiting]);

  useEffect(() => {
    if (!showMeetingDetected) {
      successScale.setValue(0.94);
      successOpacity.setValue(0);
      successRippleScale.setValue(0.7);
      successRippleOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        stiffness: 220,
        damping: 20,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(successRippleOpacity, {
          toValue: 0.25,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(successRippleScale, {
            toValue: 1.7,
            duration: 540,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(successRippleOpacity, {
            toValue: 0,
            duration: 540,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [showMeetingDetected, successOpacity, successRippleOpacity, successRippleScale, successScale]);

  const submitImHere = useCallback(async (trigger = 'manual') => {
    if (!sessionId || isSubmittingIAmHere) return;

    const now = Date.now();
    if (now - lastImHereSubmitRef.current < 15000) {
      DEBUG && console.log('[ActiveSessionScreen] im_here deduped within 15s window');
      return;
    }

    lastImHereSubmitRef.current = now;
    setIsSubmittingIAmHere(true);

    let wsSent = false;
    let apiSent = false;

    try {
      wsSent = realtimeService.sendImHere();

      // Optional backend endpoint; safe fallback when not yet implemented.
      try {
        await client.post(`/sessions/${sessionId}/im-here`, {
          timestamp: new Date().toISOString(),
          source: trigger,
        });
        apiSent = true;
      } catch (_) {
        apiSent = false;
      }

      setIsIAmHereOpen(false);
      setIAmHereWaiting(true);

      if (iAmHereWaitingTimeoutRef.current) {
        clearTimeout(iAmHereWaitingTimeoutRef.current);
      }

      iAmHereWaitingTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        if (iAmHereWaitingStateRef.current) {
          Alert.alert('Still waiting', 'Your peer has not confirmed yet. You can try again.');
          setIAmHereWaiting(false);
        }
      }, 65000);

      if (!wsSent && !apiSent) {
        Alert.alert('Connection unstable', 'We queued your confirmation and will retry when connected.');
      }
    } catch (error) {
      console.error('[ActiveSessionScreen] submit im_here failed:', error);
      Alert.alert('Could not confirm', 'Please try again in a moment.');
      setIAmHereWaiting(false);
    } finally {
      setIsSubmittingIAmHere(false);
    }
  }, [isSubmittingIAmHere, sessionId]);

  useEffect(() => {
    if (!isIAmHereOpen) {
      if (iAmHereTimerRef.current) {
        clearInterval(iAmHereTimerRef.current);
        iAmHereTimerRef.current = null;
      }
      return;
    }

    setIAmHereCountdown(60);
    iAmHereTimerRef.current = setInterval(() => {
      setIAmHereCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(iAmHereTimerRef.current);
          iAmHereTimerRef.current = null;
          submitImHere('timer');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (iAmHereTimerRef.current) {
        clearInterval(iAmHereTimerRef.current);
        iAmHereTimerRef.current = null;
      }
    };
  }, [isIAmHereOpen, submitImHere]);

  const handleIAmHere = useCallback(() => {
    if (isIAmHereOpen || isSubmittingIAmHere) return;
    if (!canConfirmArrival) {
      Alert.alert('Not close enough yet', 'Move within 50 meters to confirm arrival.');
      return;
    }
    if (iAmHereWaiting) {
      Alert.alert('Already confirmed', 'You already confirmed arrival. Waiting for your peer.');
      return;
    }
    setIAmHereWaiting(false);
    setIAmHereCountdown(60);
    setIsIAmHereOpen(true);
  }, [canConfirmArrival, iAmHereWaiting, isIAmHereOpen, isSubmittingIAmHere]);

  const handleToggleSharing = useCallback(async () => {
    try {
      if (isLocationPaused) {
        await locationService.resumeTracking('user_privacy_resume');
        setIsLocationPaused(false);
        await fetchSessionSnapshot(sessionId);
      } else {
        locationService.pauseTracking('user_privacy_pause');
        setIsLocationPaused(true);
      }
    } catch (error) {
      console.error('[ActiveSessionScreen] Toggle sharing failed:', error);
      Alert.alert('Action failed', 'Could not update location sharing right now.');
    }
  }, [fetchSessionSnapshot, isLocationPaused, sessionId]);

  const handleRefreshSnapshot = useCallback(async () => {
    await fetchSessionSnapshot(sessionId);
  }, [fetchSessionSnapshot, sessionId]);

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

  const handleShareInvite = useCallback(async () => {
    if (!sessionId) {
      Alert.alert('Session not ready', 'Please wait for the session to initialize.');
      return;
    }

    try {
      setIsSharingInvite(true);
      analyticsService.track('invite_share_started', { sessionId });

      let inviteToken = null;
      try {
        // Optional backend support; gracefully falls back when endpoint is unavailable.
        const res = await client.post(`/sessions/${sessionId}/invite`);
        inviteToken = res?.data?.invite_token || null;
        analyticsService.track('invite_token_created', {
          sessionId,
          hasToken: Boolean(inviteToken),
        });
      } catch (_) {
        inviteToken = null;
        analyticsService.track('invite_token_create_unavailable', { sessionId });
      }

      const url = Linking.createURL(`session/${sessionId}`, {
        queryParams: inviteToken ? { token: inviteToken } : undefined,
      });

      const inviterName = user?.user_metadata?.display_name || user?.email || 'Your friend';
      const message = [
        `${inviterName} invited you to a MeetUp session.`,
        `Open in app: ${url}`,
        `WhatsApp quick-share: https://wa.me/?text=${encodeURIComponent(url)}`,
      ].join('\n');
      await Share.share({ message, url, title: 'MeetUp Invite' });
      analyticsService.track('invite_shared', {
        sessionId,
        hasToken: Boolean(inviteToken),
      });
    } catch (error) {
      analyticsService.track('invite_share_failed', {
        sessionId,
        message: error?.message || 'unknown',
      });
      console.error('[ActiveSessionScreen] Share invite error:', error);
      Alert.alert('Share failed', 'Could not create invite link right now.');
    } finally {
      setIsSharingInvite(false);
    }
  }, [sessionId, user?.email, user?.user_metadata?.display_name]);

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
    locationEventUnsubscribesRef.current.forEach((unsub) => {
      try {
        unsub?.();
      } catch (e) {
        console.error('Error unsubscribing location events:', e);
      }
    });
    locationEventUnsubscribesRef.current = [];

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
    if (iAmHereTimerRef.current) {
      clearInterval(iAmHereTimerRef.current);
      iAmHereTimerRef.current = null;
    }
    if (iAmHereWaitingTimeoutRef.current) {
      clearTimeout(iAmHereWaitingTimeoutRef.current);
      iAmHereWaitingTimeoutRef.current = null;
    }
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
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

      <View pointerEvents="none" style={s.ambientOrbTop} />
      <View pointerEvents="none" style={s.ambientOrbBottom} />

      {/* Status Badge */}
      <View style={[
        s.statusBadge,
        wsStatus === 'connected' && s.statusConnected,
        wsStatus === 'grace' && s.statusGrace,
        wsStatus === 'reconnecting' && s.statusReconnecting,
        wsStatus === 'failed' && s.statusFailed,
        wsStatus === 'disconnected' && s.statusDisconnected,
      ]}>
        <View style={[
          s.statusDot,
          wsStatus === 'connected' && s.dotGreen,
          wsStatus === 'grace' && s.dotOrange,
          wsStatus === 'reconnecting' && s.dotOrange,
          wsStatus === 'failed' && s.dotRed,
          wsStatus === 'disconnected' && s.dotGray,
        ]} />
        <Text style={s.statusText}>
          {wsStatus === 'connected' ? 'Live'
            : wsStatus === 'grace' ? `Connection lost, retry in ${reconnectCountdown}s`
            : wsStatus === 'reconnecting'
              ? `Reconnecting${reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : ''}${reconnectCountdown > 0 ? ` in ${reconnectCountdown}s` : '...'}`
              : wsStatus === 'failed' ? 'Disconnected'
                : 'Offline'}
        </Text>
      </View>

      {connectionNotice && (
        <Animated.View
          style={[
            s.connectionNotice,
            connectionNotice.tone === 'success' && s.connectionNoticeSuccess,
            connectionNotice.tone === 'warning' && s.connectionNoticeWarning,
            {
              opacity: noticeOpacity,
              transform: [{ translateY: noticeTranslateY }],
            },
          ]}>
          <Text
            style={[
              s.connectionNoticeText,
              connectionNotice.tone === 'success' && s.connectionNoticeTextSuccess,
              connectionNotice.tone === 'warning' && s.connectionNoticeTextWarning,
            ]}>
            {connectionNotice.message}
          </Text>
        </Animated.View>
      )}

      {/* Error Banner */}
      {(locationError || wsError) && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{locationError || wsError}</Text>
        </View>
      )}

      {isLocationPaused && (
        <View style={s.pauseBanner}>
          <Text style={s.pauseText}>Location sharing paused. Resume to share your live position.</Text>
        </View>
      )}

      {peerLocationExpired && !isLocationPaused && (
        <View style={s.staleBanner}>
          <Text style={s.staleText}>Peer location is stale or expired. Pulling latest snapshot...</Text>
        </View>
      )}

      {showMeetingDetected && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              s.successHalo,
              { opacity: successRippleOpacity, transform: [{ scale: successRippleScale }] },
            ]}
          />
          <Animated.View style={[s.successBanner, { opacity: successOpacity, transform: [{ scale: successScale }] }]}> 
            <Text style={s.successTitle}>Meeting detected</Text>
            <Text style={s.successText}>Great timing. Closing session now.</Text>
          </Animated.View>
        </>
      )}

      {showInviteJoined && (
        <View style={s.inviteBanner}>
          <Text style={s.inviteBannerTitle}>Invite link accepted</Text>
          <Text style={s.inviteBannerText}>You joined this session from a shared invite.</Text>
        </View>
      )}

      {inviteTokenIssue && (
        <View style={s.inviteWarningBanner}>
          <Text style={s.inviteWarningTitle}>Invite token issue</Text>
          <Text style={s.inviteWarningText}>This invite link may be expired, but session access is still available.</Text>
        </View>
      )}

      {/* Bottom Panel */}
      <View style={s.bottomPanel}>
        <View style={s.panelHandle} />
        <View style={s.infoRow}>
          <View style={s.peerInfo}>
            <Text style={s.peerName}>{peerName}</Text>
            <Text style={[s.peerSub, peerIsStale && s.peerSubStale]}>
              {peerLocation
                ? `Last seen: ${peerLastSeenText}${peerLocationExpired ? ' (expired)' : peerIsStale ? ' (stale)' : ''}`
                : 'Waiting for location...'}
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

        <ModernDistanceBar distanceM={directDistanceM} colors={colors} />

        <View style={s.privacyRow}>
          <TouchableOpacity
            style={[s.privacyButton, isLocationPaused && s.privacyButtonActive]}
            onPress={handleToggleSharing}>
            <Text style={[s.privacyButtonText, isLocationPaused && s.privacyButtonTextActive]}>
              {isLocationPaused ? 'Resume Sharing' : 'Pause Sharing'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.privacyButtonSecondary, isRefreshingSnapshot && s.buttonDisabled]}
            onPress={handleRefreshSnapshot}
            disabled={isRefreshingSnapshot}>
            <Text style={s.privacyButtonSecondaryText}>{isRefreshingSnapshot ? 'Refreshing...' : 'Refresh Snapshot'}</Text>
          </TouchableOpacity>
        </View>

        {iAmHereWaiting && (
          <View style={s.waitingBanner}>
            <Text style={s.waitingBannerText}>Arrival confirmed. Waiting for your peer...</Text>
          </View>
        )}

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
                  <ActivityIndicator size="small" color={colors.textSecondary} style={s.modeLoadingSpinner} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.shareButton, isSharingInvite && s.buttonDisabled]}
            onPress={handleShareInvite}
            disabled={isSharingInvite}>
            <Text style={s.shareButtonText}>{isSharingInvite ? 'Sharing...' : 'Share'}</Text>
          </TouchableOpacity>

          <Animated.View style={[s.iAmHereAnimatedWrap, { transform: [{ scale: iAmHerePulse }] }]}> 
            <TouchableOpacity
              style={[
                s.iAmHereButton,
                !canConfirmArrival && s.iAmHereButtonDisabled,
                iAmHereWaiting && s.iAmHereButtonWaiting,
              ]}
              onPress={handleIAmHere}
              disabled={!canConfirmArrival || iAmHereWaiting}>
              <Text style={[s.iAmHereText, !canConfirmArrival && s.iAmHereTextDisabled]}>
                {iAmHereWaiting ? 'Waiting for peer...' : "I'm Here"}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[s.endSessionButton, isStopping && s.buttonDisabled]}
            onPress={handleEndSession} disabled={isStopping}>
            <Text style={s.endSessionText}>{isStopping ? 'Ending...' : 'End Session'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={isIAmHereOpen} transparent animationType="fade" onRequestClose={() => setIsIAmHereOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Confirm Arrival</Text>
            <Text style={s.modalBody}>Keep this open and tap confirm after the countdown.</Text>
            <Text style={s.modalCountdown}>{iAmHereCountdown}s</Text>

            <TouchableOpacity
              style={[s.modalConfirm, isSubmittingIAmHere && s.buttonDisabled]}
              onPress={() => submitImHere('manual')}
              disabled={isSubmittingIAmHere}>
              <Text style={s.modalConfirmText}>{isSubmittingIAmHere ? 'Submitting...' : 'Confirm Now'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setIsIAmHereOpen(false)}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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

  statusBadge: {
    position: 'absolute', top: 16, left: 16,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.cardBg, borderWidth: 1, borderColor: c.border,
    shadowColor: c.textPrimary,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  statusConnected: {},
  statusGrace: { borderColor: c.warning },
  statusReconnecting: { borderColor: c.warning },
  statusFailed: { borderColor: c.accent },
  statusDisconnected: {},
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  dotGreen: { backgroundColor: c.online },
  dotOrange: { backgroundColor: c.warning },
  dotRed: { backgroundColor: c.accent },
  dotGray: { backgroundColor: c.textMuted },
  statusText: { fontSize: 12, fontWeight: '600', color: c.textPrimary },

  connectionNotice: {
    position: 'absolute',
    top: 62,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceGlass,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: c.textPrimary,
    shadowOpacity: 0.09,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  connectionNoticeSuccess: {
    borderColor: c.online,
    backgroundColor: c.onlineBg,
  },
  connectionNoticeWarning: {
    borderColor: c.warning,
    backgroundColor: c.warningBg,
  },
  connectionNoticeText: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  connectionNoticeTextSuccess: {
    color: c.online,
  },
  connectionNoticeTextWarning: {
    color: c.warning,
  },

  errorBanner: {
    position: 'absolute', bottom: 130, left: 16, right: 16,
    backgroundColor: c.accentBg, padding: 12, borderRadius: Radius.sm,
    borderColor: c.accent, borderWidth: 1,
  },
  errorText: { color: c.accentLight, fontSize: 13, fontWeight: '500' },

  pauseBanner: {
    position: 'absolute', bottom: 182, left: 16, right: 16,
    backgroundColor: c.warningBg, padding: 12, borderRadius: Radius.sm,
    borderColor: c.warning, borderWidth: 1,
  },
  pauseText: { color: c.warning, fontSize: 13, fontWeight: '600' },
  staleBanner: {
    position: 'absolute',
    bottom: 230,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: c.warning,
    backgroundColor: c.warningBg,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  staleText: {
    color: c.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  successBanner: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: c.online,
    backgroundColor: c.onlineBg,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  successHalo: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    width: 180,
    height: 70,
    borderRadius: 35,
    backgroundColor: c.onlineBg,
    borderWidth: 1,
    borderColor: c.online,
  },
  successTitle: {
    color: c.online,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  successText: {
    marginTop: 4,
    color: c.online,
    fontSize: 12,
    fontWeight: '600',
  },
  inviteBanner: {
    position: 'absolute',
    top: 124,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceGlass,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: c.textPrimary,
    shadowOpacity: 0.09,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
  },
  inviteBannerTitle: {
    color: c.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inviteBannerText: {
    marginTop: 3,
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  inviteWarningBanner: {
    position: 'absolute',
    top: 188,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderColor: c.warning,
    backgroundColor: c.warningBg,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inviteWarningTitle: {
    color: c.warning,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inviteWarningText: {
    marginTop: 2,
    color: c.warning,
    fontSize: 11,
    fontWeight: '600',
  },

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
  peerSubStale: { color: c.warning, fontWeight: '700' },
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
  modeLoadingSpinner: { marginLeft: 4 },

  mapLoading: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center',
    alignItems: 'center', backgroundColor: c.bg,
  },
  endSessionButton: {
    borderWidth: 1, borderColor: c.accent,
    borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    flex: 1,
    marginLeft: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iAmHereButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.online,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.onlineBg,
    marginRight: 8,
  },
  iAmHereAnimatedWrap: {
    flex: 1,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceElevated,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  shareButtonText: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iAmHereButtonDisabled: {
    borderColor: c.borderLight,
    backgroundColor: c.surfaceElevated,
  },
  iAmHereButtonWaiting: {
    borderColor: c.warning,
    backgroundColor: c.warningBg,
  },
  iAmHereText: {
    color: c.online,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  iAmHereTextDisabled: {
    color: c.textMuted,
  },
  waitingBanner: {
    borderWidth: 1,
    borderColor: c.warning,
    backgroundColor: c.warningBg,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: c.warning,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
    marginBottom: Spacing.md,

  ambientOrbTop: {
    position: 'absolute',
    top: 78,
    right: -46,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: c.accentBg,
    opacity: 0.45,
  },
  ambientOrbBottom: {
    position: 'absolute',
    bottom: 140,
    left: -52,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: c.surfaceGlass,
    opacity: 0.45,
  },
  },
  waitingBannerText: {
    backgroundColor: c.surface,
    fontSize: 12,
    fontWeight: '600',
  },
    shadowColor: c.textPrimary,
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 16,
    elevation: 8,
  privacyRow: {
  panelHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderLight,
    marginBottom: 10,
  },
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  privacyButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.sm,
    backgroundColor: c.surfaceElevated,
    paddingVertical: 11,
    alignItems: 'center',
    marginRight: 8,
  },
  privacyButtonActive: {
    borderColor: c.warning,
    backgroundColor: c.warningBg,
  },
  privacyButtonText: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  privacyButtonTextActive: {
    color: c.warning,
  },
  privacyButtonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.sm,
    backgroundColor: c.surface,
    paddingVertical: 11,
    alignItems: 'center',
  },
  privacyButtonSecondaryText: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  modalTitle: {
    ...Font.subtitle,
    color: c.textPrimary,
  },
  modalBody: {
    ...Font.body,
    color: c.textSecondary,
    marginTop: 6,
  },
  modalCountdown: {
    ...Font.display,
    color: c.textPrimary,
    textAlign: 'center',
    marginVertical: 16,
  },
  modalConfirm: {
    borderWidth: 1,
    borderColor: c.online,
    borderRadius: Radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: c.onlineBg,
    marginBottom: 8,
  },
  modalConfirmText: {
    ...Font.body,
    color: c.online,
    fontWeight: '700',
  },
  modalCancel: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    ...Font.body,
    color: c.textPrimary,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.5 },
  endSessionText: { color: c.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});

export default ActiveSessionScreen;
