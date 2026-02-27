import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';

const HomeScreen = ({ navigation }) => {
    const { user, signOut } = useAuth();
    const [activeSession, setActiveSession] = useState(null);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef(null);
    const [now, setNow] = useState(Date.now());

    // Tick every second for countdown
    useEffect(() => {
        const ticker = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(ticker);
    }, []);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [sessionRes, outgoingRes] = await Promise.allSettled([
                client.get('/sessions/active'),
                client.get('/requests/outgoing'),
            ]);

            setActiveSession(
                sessionRes.status === 'fulfilled' && sessionRes.value.data?.session_id
                    ? sessionRes.value.data
                    : null
            );
            setOutgoingRequests(
                outgoingRes.status === 'fulfilled' ? outgoingRes.value.data : []
            );
        } catch (_) { }
        finally { setLoading(false); }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchData();
            pollRef.current = setInterval(() => fetchData(true), 5000);
            return () => clearInterval(pollRef.current);
        }, [fetchData])
    );

    const handleSignOut = async () => {
        try { await signOut(); }
        catch { Alert.alert('Error', 'Failed to sign out.'); }
    };

    const handleJoinSession = () => {
        clearInterval(pollRef.current);
        navigation.navigate('ActiveSession', { sessionId: activeSession.session_id });
    };

    const getCountdown = (expiresAt) => {
        if (!expiresAt) return null;
        const exp = new Date(expiresAt).getTime();
        const remaining = Math.max(0, Math.floor((exp - now) / 1000));
        if (remaining === 0) return '⏰ Expired';
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const pendingRequests = outgoingRequests.filter(r => r.status === 'PENDING');
    const acceptedRequests = outgoingRequests.filter(r => r.status === 'ACCEPTED');

    return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
            {/* Active Session Banner */}
            {activeSession && (
                <TouchableOpacity style={styles.sessionBanner} onPress={handleJoinSession}>
                    <View style={styles.sessionBannerInner}>
                        <View style={styles.liveDot} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.bannerTitle}>🗺️ Active Session</Text>
                            <Text style={styles.bannerSub}>Tap to join the live map</Text>
                        </View>
                        <Text style={styles.bannerArrow}>›</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Accepted but not yet joined */}
            {!activeSession && acceptedRequests.map(r => (
                <TouchableOpacity
                    key={r.id}
                    style={styles.sessionBanner}
                    onPress={() => fetchData()}
                >
                    <View style={styles.sessionBannerInner}>
                        <Text style={styles.bannerTitle}>✅ {r.receiver_name} accepted!</Text>
                        <Text style={styles.bannerSub}>Checking for session…</Text>
                    </View>
                </TouchableOpacity>
            ))}

            {/* Pending Outgoing Request Cards */}
            {pendingRequests.map(r => {
                const countdown = getCountdown(r.expires_at);
                const expired = countdown === '⏰ Expired';
                return (
                    <View key={r.id} style={[styles.requestCard, expired && styles.requestCardExpired]}>
                        <View style={styles.requestCardLeft}>
                            <View style={styles.reqAvatar}>
                                <Text style={styles.reqAvatarText}>
                                    {(r.receiver_name || '?')[0].toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.requestCardBody}>
                            <Text style={styles.reqName}>{r.receiver_name}</Text>
                            <Text style={styles.reqStatus}>
                                {expired ? '⏰ Request expired' : '⏳ Waiting for them to accept...'}
                            </Text>
                        </View>
                        <View style={styles.requestCardRight}>
                            <Text style={[styles.countdown, expired && styles.countdownExpired]}>
                                {countdown}
                            </Text>
                        </View>
                    </View>
                );
            })}

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>👋 MeetUp</Text>
                <Text style={styles.sub}>Welcome, {user?.email?.split('@')[0] || 'User'}!</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={[styles.button, styles.findBtn]}
                    onPress={() => navigation.navigate('FriendList')}>
                    <Text style={styles.btnIcon}>🔍</Text>
                    <View>
                        <Text style={styles.btnTitle}>Find a Friend</Text>
                        <Text style={styles.btnSub}>Search & send meet requests</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, styles.inboxBtn]}
                    onPress={() => navigation.navigate('AcceptRequest')}>
                    <Text style={styles.btnIcon}>📬</Text>
                    <View>
                        <Text style={styles.btnTitle}>Incoming Requests</Text>
                        <Text style={styles.btnSub}>Accept or decline meet requests</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <Text style={styles.refreshNote}>Auto-refreshes every 5 seconds</Text>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scroll: { flex: 1, backgroundColor: '#f5f5f5' },
    container: { padding: 20, paddingBottom: 40 },
    sessionBanner: {
        backgroundColor: '#34C759', borderRadius: 16, padding: 16,
        marginBottom: 12,
        shadowColor: '#34C759', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
    },
    sessionBannerInner: { flexDirection: 'row', alignItems: 'center' },
    liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', marginRight: 12 },
    bannerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
    bannerArrow: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    requestCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 14,
        padding: 14, marginBottom: 10,
        borderLeftWidth: 4, borderLeftColor: '#007AFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
    },
    requestCardExpired: { borderLeftColor: '#ccc', opacity: 0.7 },
    requestCardLeft: { marginRight: 12 },
    reqAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    },
    reqAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    requestCardBody: { flex: 1 },
    reqName: { fontSize: 16, fontWeight: '700', color: '#333' },
    reqStatus: { fontSize: 12, color: '#888', marginTop: 2 },
    requestCardRight: { alignItems: 'flex-end' },
    countdown: { fontSize: 20, fontWeight: 'bold', color: '#007AFF', fontVariant: ['tabular-nums'] },
    countdownExpired: { color: '#ccc', fontSize: 14 },
    header: { alignItems: 'center', marginVertical: 28 },
    title: { fontSize: 30, fontWeight: 'bold', color: '#333' },
    sub: { fontSize: 15, color: '#888', marginTop: 6 },
    buttonContainer: { marginBottom: 24 },
    button: {
        flexDirection: 'row', alignItems: 'center',
        padding: 18, borderRadius: 14, marginBottom: 12,
        backgroundColor: '#fff',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
    },
    findBtn: { borderLeftWidth: 4, borderLeftColor: '#007AFF' },
    inboxBtn: { borderLeftWidth: 4, borderLeftColor: '#34C759' },
    btnIcon: { fontSize: 28, marginRight: 14 },
    btnTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
    btnSub: { fontSize: 12, color: '#999', marginTop: 2 },
    signOutBtn: {
        alignItems: 'center', padding: 14, borderRadius: 12,
        borderWidth: 1, borderColor: '#FF3B30', backgroundColor: '#fff',
    },
    signOutText: { color: '#FF3B30', fontWeight: '600', fontSize: 15 },
    refreshNote: { textAlign: 'center', color: '#ccc', fontSize: 11, marginTop: 14 },
});

export default HomeScreen;
