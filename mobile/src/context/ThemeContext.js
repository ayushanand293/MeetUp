import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@meetup_theme';

const darkColors = {
    bg: '#0D0F14',
    surface: '#171A21',
    surfaceElevated: '#222631',
    surfaceSoft: '#1B1F28',
    surfaceGlass: 'rgba(23,26,33,0.86)',
    border: '#313746',
    borderLight: '#444B5D',
    textPrimary: '#F7F8FA',
    textSecondary: '#C2C8D3',
    textMuted: '#7C8493',
    accent: '#F3F4F6',
    accentLight: '#FFFFFF',
    accentBg: 'rgba(255,255,255,0.10)',
    accentGlass: 'rgba(255,255,255,0.16)',
    online: '#34C759',
    onlineBg: 'rgba(52,199,89,0.16)',
    warning: '#FFB020',
    warningBg: 'rgba(255,176,32,0.14)',
    successBg: 'rgba(52,199,89,0.14)',
    successText: '#9BE7B1',
    inputBg: '#20242E',
    cardBg: 'rgba(23,26,33,0.92)',
    shimmer: '#2A2F3B',
    mapTile: 'dark_all',
    myMarker: '#FFFFFF',
    peerMarker: '#AAB2C0',
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
