import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, ScrollView, Animated,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const HomeScreen = ({ navigation }) => {
    const { colors, isDark, toggle } = useTheme();
    const { user, signOut } = useAuth();
    const [activeSession, setActiveSession] = useState(null);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const pollRef = useRef(null);
    const [now, setNow] = useState(Date.now());

    // Entrance
    const greetY = useRef(new Animated.Value(20)).current;
    const greetOp = useRef(new Animated.Value(0)).current;
    const cardsOp = useRef(new Animated.Value(0)).current;
    const cardsY = useRef(new Animated.Value(30)).current;
    const bannerSlide = useRef(new Animated.Value(-80)).current;
    const bannerOp = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.spring(greetY, { toValue: 0, useNativeDriver: true, tension: 80 }),
                Animated.timing(greetOp, { toValue: 1, duration: 350, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.spring(cardsY, { toValue: 0, useNativeDriver: true, tension: 80 }),
                Animated.timing(cardsOp, { toValue: 1, duration: 350, useNativeDriver: true }),
            ]),
        ]).start();
    }, []);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const [sRes, oRes] = await Promise.allSettled([
                client.get('/sessions/active'), client.get('/requests/outgoing'),
            ]);
            const session = sRes.status === 'fulfilled' && sRes.value.data?.session_id ? sRes.value.data : null;
            const prev = activeSession;
            setActiveSession(session);
            setOutgoingRequests(oRes.status === 'fulfilled' ? oRes.value.data : []);
            if (session && !prev) {
                Animated.parallel([
                    Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, tension: 80 }),
                    Animated.timing(bannerOp, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start();
            }
        } catch (_) { }
    }, [activeSession]);

    useFocusEffect(useCallback(() => {
        fetchData();
        pollRef.current = setInterval(fetchData, 5000);
        return () => clearInterval(pollRef.current);
    }, [fetchData]));

    const countdown = (exp) => {
        if (!exp) return null;
        const rem = Math.max(0, Math.floor((new Date(exp).getTime() - now) / 1000));
        if (rem === 0) return '00:00';
        return `${Math.floor(rem / 60)}:${(rem % 60).toString().padStart(2, '0')}`;
    };

    const pending = outgoingRequests.filter(r => r.status === 'PENDING');
    const displayName = user?.email?.split('@')[0] || 'You';

    return (
        <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>

            {/* Header row — greeting + theme toggle */}
            <Animated.View style={{ opacity: greetOp, transform: [{ translateY: greetY }], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl, marginTop: Spacing.xl }}>
                <View>
                    <Text style={[Font.body, { color: colors.textSecondary, fontSize: 16 }]}>Hello,</Text>
                    <Text style={[Font.display, { color: colors.textPrimary, marginTop: 2 }]}>{displayName}</Text>
                </View>
                <TouchableOpacity
                    onPress={toggle}
                    style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
                </TouchableOpacity>
            </Animated.View>

            {/* Active session banner */}
            {activeSession && (
                <Animated.View style={{ transform: [{ translateY: bannerSlide }], opacity: bannerOp, marginBottom: Spacing.lg }}>
                    <TouchableOpacity
                        style={{ backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.accent }}
                        onPress={() => { clearInterval(pollRef.current); navigation.navigate('ActiveSession', { sessionId: activeSession.session_id }); }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginRight: 6 }} />
                            <Text style={[Font.label, { color: colors.accent }]}>LIVE</Text>
                        </View>
                        <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 2 }]}>Active Session</Text>
                        <Text style={[Font.body, { color: colors.textSecondary, fontSize: 13 }]}>Tap to rejoin the map →</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Pending requests */}
            {pending.length > 0 && (
                <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.xl }}>
                    <Text style={[Font.label, { color: colors.textMuted, marginBottom: Spacing.sm }]}>PENDING REQUESTS</Text>
                    {pending.map(r => {
                        const cd = countdown(r.expires_at);
                        const expired = cd === '00:00';
                        return (
                            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border, opacity: expired ? 0.4 : 1 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{(r.receiver_name || '?')[0].toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{r.receiver_name}</Text>
                                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{expired ? 'Expired' : 'Waiting...'}</Text>
                                </View>
                                <Text style={[Font.mono, { color: expired ? colors.textMuted : colors.textPrimary }]}>{cd}</Text>
                            </View>
                        );
                    })}
                </Animated.View>
            )}

            {/* Actions */}
            <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.xl }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: Spacing.sm }]}>ACTIONS</Text>
                <ActionCard icon="⊕" title="Find a Friend" sub="Search by name, send a meet request" colors={colors}
                    onPress={() => navigation.navigate('FriendList')} />
                <ActionCard icon="◎" title="Incoming Requests" sub="Accept or decline meet requests" colors={colors}
                    onPress={() => navigation.navigate('AcceptRequest')} />
            </Animated.View>

            {/* Sign out */}
            <TouchableOpacity
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' }}
                onPress={async () => { try { await signOut(); } catch { Alert.alert('Error', 'Sign out failed'); } }}>
                <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};

const ActionCard = ({ icon, title, sub, colors, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border }}
                onPress={onPress} onPressIn={() => anim.pressIn(scale)} onPressOut={() => anim.pressOut(scale)}>
                <Text style={{ fontSize: 22, marginRight: 14, color: colors.textSecondary }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{title}</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 3 }]}>{sub}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 22 }}>›</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

export default HomeScreen;
