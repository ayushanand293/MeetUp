/**
 * MeetUp Design System — shared tokens
 * Colors come from ThemeContext (dark/light aware)
 */

export { useTheme, ThemeProvider } from './context/ThemeContext';

export const Spacing = {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const Radius = {
    sm: 8, md: 14, lg: 20, xl: 28, pill: 999,
};

export const Font = {
    display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    subtitle: { fontSize: 17, fontWeight: '600' },
    body: { fontSize: 15, fontWeight: '400' },
    caption: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    mono: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 1 },
};

/** Reusable `Animated` helpers — call inside components */
export const anim = {
    /** Spring press-in / press-out pair */
    pressIn: (v) => {
        const { Animated } = require('react-native');
        Animated.spring(v, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
    },
    pressOut: (v) => {
        const { Animated } = require('react-native');
        Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
    },
    /** Stagger entrance: returns { opacity, translateY } animated values + trigger fn */
    entrance: (delay = 0) => {
        const { Animated } = require('react-native');
        const opacity = new Animated.Value(0);
        const translateY = new Animated.Value(24);
        const run = () => Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, tension: 80 }),
        ]).start();
        return { opacity, translateY, run };
    },
};
