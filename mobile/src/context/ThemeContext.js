import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@meetup_theme';

const darkColors = {
    bg: '#0A0A0A',
    surface: '#141414',
    surfaceElevated: '#1E1E1E',
    surfaceSoft: '#191919',
    surfaceGlass: 'rgba(30,30,30,0.75)',
    border: '#2A2A2A',
    borderLight: '#333333',
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#555555',
    accent: '#F0F0F0',
    accentLight: '#FFFFFF',
    accentBg: 'rgba(255,255,255,0.10)',
    accentGlass: 'rgba(255,255,255,0.16)',
    online: '#D9D9D9',
    onlineBg: 'rgba(217,217,217,0.12)',
    warning: '#BDBDBD',
    warningBg: 'rgba(189,189,189,0.12)',
    successBg: 'rgba(217,217,217,0.12)',
    successText: '#E4E4E4',
    inputBg: '#1E1E1E',
    cardBg: 'rgba(20,20,20,0.85)',
    shimmer: '#222222',
    mapTile: 'dark_all',
    myMarker: '#FFFFFF',
    peerMarker: '#B0B0B0',
    routeLine: '#FFFFFF',
};

const lightColors = {
    bg: '#F6F6F6',
    surface: '#FFFFFF',
    surfaceElevated: '#F0F0F0',
    surfaceSoft: '#F8F8F8',
    surfaceGlass: 'rgba(255,255,255,0.8)',
    border: '#E5E5E5',
    borderLight: '#D4D4D4',
    textPrimary: '#1A1A1A',
    textSecondary: '#666666',
    textMuted: '#999999',
    accent: '#111111',
    accentLight: '#2A2A2A',
    accentBg: 'rgba(0,0,0,0.08)',
    accentGlass: 'rgba(0,0,0,0.12)',
    online: '#4A4A4A',
    onlineBg: 'rgba(74,74,74,0.10)',
    warning: '#5E5E5E',
    warningBg: 'rgba(94,94,94,0.08)',
    successBg: 'rgba(74,74,74,0.10)',
    successText: '#1F1F1F',
    inputBg: '#F0F0F0',
    cardBg: 'rgba(255,255,255,0.9)',
    shimmer: '#E8E8E8',
    mapTile: 'light_all',
    myMarker: '#1A1A1A',
    peerMarker: '#6E6E6E',
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

    const toggle = useCallback(async () => {
        const next = !isDark;
        setIsDark(next);
        await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    }, [isDark]);

    const value = useMemo(() => ({
        isDark,
        colors: isDark ? darkColors : lightColors,
        toggle,
    }), [isDark, toggle]);

    if (!ready) return null;
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
