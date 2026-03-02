import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@meetup_theme';

const darkColors = {
    bg: '#0A0A0A',
    surface: '#141414',
    surfaceElevated: '#1E1E1E',
    surfaceGlass: 'rgba(30,30,30,0.75)',
    border: '#2A2A2A',
    borderLight: '#333333',
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#555555',
    accent: '#B71C1C',
    accentLight: '#E53935',
    accentBg: 'rgba(183,28,28,0.12)',
    online: '#4CAF50',
    onlineBg: 'rgba(76,175,80,0.12)',
    warning: '#FF9800',
    warningBg: 'rgba(255,152,0,0.12)',
    inputBg: '#1E1E1E',
    cardBg: 'rgba(20,20,20,0.85)',
    shimmer: '#222222',
    mapTile: 'dark_all',
    myMarker: '#FFFFFF',
    peerMarker: '#B71C1C',
    routeLine: '#FFFFFF',
};

const lightColors = {
    bg: '#F6F6F6',
    surface: '#FFFFFF',
    surfaceElevated: '#F0F0F0',
    surfaceGlass: 'rgba(255,255,255,0.8)',
    border: '#E5E5E5',
    borderLight: '#D4D4D4',
    textPrimary: '#1A1A1A',
    textSecondary: '#666666',
    textMuted: '#999999',
    accent: '#B71C1C',
    accentLight: '#E53935',
    accentBg: 'rgba(183,28,28,0.08)',
    online: '#2E7D32',
    onlineBg: 'rgba(46,125,50,0.1)',
    warning: '#E65100',
    warningBg: 'rgba(230,81,0,0.08)',
    inputBg: '#F0F0F0',
    cardBg: 'rgba(255,255,255,0.9)',
    shimmer: '#E8E8E8',
    mapTile: 'light_all',
    myMarker: '#1A1A1A',
    peerMarker: '#B71C1C',
    routeLine: '#1A1A1A',
};

const ThemeContext = createContext();

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};

export const ThemeProvider = ({ children }) => {
    const [isDark, setIsDark] = useState(true);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem(THEME_KEY).then(val => {
            if (val === 'light') setIsDark(false);
            setReady(true);
        }).catch(() => setReady(true));
    }, []);

    const toggle = async () => {
        const next = !isDark;
        setIsDark(next);
        await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    };

    const value = useMemo(() => ({
        isDark,
        colors: isDark ? darkColors : lightColors,
        toggle,
    }), [isDark]);

    if (!ready) return null;
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
