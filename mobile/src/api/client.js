import axios from 'axios';
import { supabase } from './supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Helper to get the correct backend URL dynamically
const getBaseUrl = () => {
    // 1. If valid host URI (physical device or LAN), use that IP
    // derived from the Expo packager host. Works for both iOS and Android physical devices.
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
    if (debuggerHost) {
        const ip = debuggerHost.split(':')[0];
        return `http://${ip}:8000/api/v1`;
    }

    // 2. Fallback for Android Emulator standard IP
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000/api/v1';

    // 3. Ultimate fallback (iOS Simulator / Local dev)
    return 'http://localhost:8000/api/v1';
};

const BASE_URL = getBaseUrl();

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
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default client;
