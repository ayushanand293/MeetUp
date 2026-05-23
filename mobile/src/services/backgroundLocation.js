import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authStorage } from '../api/authStorage';
import { BASE_URL } from '../api/client';
import analyticsService from './analyticsService';

const TASK_NAME = 'MEETUP_BACKGROUND_LOCATION';
const BACKGROUND_THROTTLE_MS = 15000;
const BACKGROUND_TIME_INTERVAL_MS = 20000;
const BACKGROUND_DISTANCE_INTERVAL_M = 35;
const ACTIVE_BG_SESSION_KEY = 'meetup_active_background_session_id';

let activeSessionId = null;
let lastSentAt = 0;

const getActiveBackgroundSessionId = async () => {
  if (activeSessionId) return activeSessionId;
  activeSessionId = await AsyncStorage.getItem(ACTIVE_BG_SESSION_KEY);
  return activeSessionId;
};

const sendBackgroundLocation = async (sessionId, location) => {
  const now = Date.now();
  if (!sessionId || now - lastSentAt < BACKGROUND_THROTTLE_MS) return false;

  const token = await authStorage.getAccessToken();
  if (!token) return false;

  const { latitude, longitude, accuracy } = location.coords || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;

  const response = await fetch(`${BASE_URL}/sessions/${encodeURIComponent(sessionId)}/location`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lat: latitude,
      lon: longitude,
      accuracy_m: accuracy || 10,
      timestamp: new Date(location.timestamp || now).toISOString(),
      client_ts_ms: now,
    }),
  });

  if (response.status === 401 || response.status === 403 || response.status === 409 || response.status === 404) {
    await backgroundLocation.stopBackgroundSharing(sessionId);
    return false;
  }

  if (!response.ok) return false;

  lastSentAt = now;
  analyticsService.track('bg_location_update_sent', { source: 'background' });
  return true;
};

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  const sessionId = await getActiveBackgroundSessionId();
  if (error || !sessionId) return;

  const locations = data?.locations || [];
  const latest = locations[locations.length - 1];
  if (!latest) return;

  try {
    await sendBackgroundLocation(sessionId, latest);
  } catch (_) {
    // Best effort only. Foreground session and server-side state remain authoritative.
  }
});

const ensureBackgroundPermission = async () => {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    const requestedForeground = await Location.requestForegroundPermissionsAsync();
    if (requestedForeground.status !== 'granted') return false;
  }

  const background = await Location.getBackgroundPermissionsAsync();
  if (background.status === 'granted') return true;

  const requestedBackground = await Location.requestBackgroundPermissionsAsync();
  return requestedBackground.status === 'granted';
};

const backgroundLocation = {
  async startBackgroundSharing(sessionId) {
    if (!sessionId) return { started: false, reason: 'missing_session' };

    const granted = await ensureBackgroundPermission();
    if (!granted) return { started: false, reason: 'permission_denied' };

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    activeSessionId = activeSessionId || (await AsyncStorage.getItem(ACTIVE_BG_SESSION_KEY));
    if (alreadyStarted && activeSessionId === sessionId) {
      return { started: true, alreadyStarted: true };
    }
    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }

    activeSessionId = sessionId;
    lastSentAt = 0;
    await AsyncStorage.setItem(ACTIVE_BG_SESSION_KEY, sessionId);

    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: BACKGROUND_TIME_INTERVAL_MS,
      distanceInterval: BACKGROUND_DISTANCE_INTERVAL_M,
      deferredUpdatesInterval: BACKGROUND_TIME_INTERVAL_MS,
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'MeetUp is sharing your location',
        notificationBody: 'Active meetup in progress',
        notificationColor: '#111111',
      },
    });

    return { started: true };
  },

  async stopBackgroundSharing(sessionId = null) {
    if (sessionId && activeSessionId && sessionId !== activeSessionId) return;

    activeSessionId = null;
    lastSentAt = 0;
    await AsyncStorage.removeItem(ACTIVE_BG_SESSION_KEY);

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
  },

  async isBackgroundSharingActive() {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    const sessionId = await getActiveBackgroundSessionId();
    return started && Boolean(sessionId);
  },
};

export { TASK_NAME as BACKGROUND_LOCATION_TASK_NAME };
export default backgroundLocation;
