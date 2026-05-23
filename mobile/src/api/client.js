import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authStorage } from './authStorage';

// Simple custom event emitter for auth events
class SimpleEventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }

    emit(event, ...args) {
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                listener(...args);
            });
        }
    }

    off(event, listenerToRemove) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(listener => listener !== listenerToRemove);
        }
    }
}

// Create a global event emitter for auth events
export const authEventEmitter = new SimpleEventEmitter();

// Helper to get the correct backend URL dynamically
const resolveApiBaseUrl = () => {
    const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (configuredBaseUrl && /^https?:\/\//.test(configuredBaseUrl)) {
        return configuredBaseUrl.replace(/\/$/, '');
    }

    if (__DEV__) {
        console.warn('⚠️ No EXPO_PUBLIC_API_BASE_URL provided. Using __DEV__ localhost fallbacks.');
        // 1. If valid host URI (physical device or LAN), use that IP
        const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
        if (debuggerHost) {
            const ip = debuggerHost.split(':')[0];
            return `http://${ip}:8000/api/v1`;
        }
        // 2. Fallback for Android Emulator standard IP
        if (Platform.OS === 'android') return 'http://10.0.2.2:8000/api/v1';
        // 3. Ultimate fallback (iOS Simulator / Local dev)
        return 'http://localhost:8000/api/v1';
    }

    // In production, hard error if missing
    throw new Error('CRITICAL: EXPO_PUBLIC_API_BASE_URL is not set for production build.');
};

export const BASE_URL = resolveApiBaseUrl();

console.log('API Client initialized with Base URL:', BASE_URL);

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add the Supabase JWT to every request
client.interceptors.request.use(
    async (config) => {
        const token = await authStorage.getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle 401 (session invalidated)
client.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error?.response?.status === 401 && !error?.config?.skipSessionInvalidation) {
            // Session has been invalidated (likely logged in elsewhere)
            // Emit event so AuthContext can handle this
            authEventEmitter.emit('SESSION_INVALIDATED');
            await authStorage.clearSession();
        }
        return Promise.reject(error);
    }
);

export default client;
