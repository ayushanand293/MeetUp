import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    Alert, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const AcceptRequestScreen = ({ navigation }) => {
    const { colors } = useTheme();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [acceptingId, setAcceptingId] = useState(null);
    const pollRef = useRef(null);

    const fetchRequests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try { const res = await client.get('/requests/pending'); setRequests(res.data || []); }
        catch (err) { if (!silent) Alert.alert('Error', 'Could not load requests.'); }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    useEffect(() => {
        fetchRequests();
        pollRef.current = setInterval(() => fetchRequests(true), 5000);
        return () => clearInterval(pollRef.current);
    }, [fetchRequests]);

    const handleAccept = async (req) => {
        setAcceptingId(req.id);
        try {
            const res = await client.post(`/requests/${req.id}/accept`);
            const { session_id, peer_name, peer_id } = res.data;
            clearInterval(pollRef.current);
            navigation.navigate('ActiveSession', { sessionId: session_id, friend: { id: peer_id, display_name: peer_name, name: peer_name } });
        } catch (err) {
            Alert.alert('Error', err.response?.status === 410 ? 'Request expired.' : 'Failed to accept.');
        } finally { setAcceptingId(null); }
    };

    const handleDecline = async (req) => {
        try { await client.post(`/requests/${req.id}/decline`); setRequests(prev => prev.filter(r => r.id !== req.id)); }
        catch { Alert.alert('Error', 'Could not decline.'); }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.textSecondary} />
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: Spacing.md }]}>Loading requests...</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: Spacing.lg }}>
            <View style={{ marginBottom: Spacing.lg, paddingTop: Spacing.md }}>
                <Text style={[Font.title, { color: colors.textPrimary }]}>Incoming Requests</Text>
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>
                    {requests.length > 0 ? `${requests.length} pending` : 'No pending requests'}
                </Text>
            </View>

            {requests.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
                    <Text style={{ fontSize: 52, color: colors.textMuted, marginBottom: Spacing.md }}>◎</Text>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 6 }]}>All clear</Text>
                    <Text style={[Font.body, { color: colors.textSecondary }]}>No pending requests</Text>
                </View>
            ) : (
                <FlatList data={requests} keyExtractor={item => item.id} showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: Spacing.xxl }}
                    refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.textMuted} onRefresh={() => { setRefreshing(true); fetchRequests(true); }} />}
                    renderItem={({ item, index }) => (
                        <RequestCard item={item} index={index} colors={colors} accepting={acceptingId === item.id}
                            onAccept={() => handleAccept(item)} onDecline={() => handleDecline(item)} />
                    )} />
            )}
        </View>
    );
};

const RequestCard = ({ item, index, colors, accepting, onAccept, onDecline }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, delay: index * 60, useNativeDriver: true, tension: 80 }),
        ]).start();
    }, []);

    const initials = (item.requester_name || '?')[0].toUpperCase();

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }], backgroundColor: colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 18 }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{item.requester_name}</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.requester_email}</Text>
                </View>
                {item.expires_at && <ExpiryBadge expiresAt={item.expires_at} colors={colors} />}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' }} onPress={onDecline}>
                    <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 14 }}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 2, backgroundColor: colors.textPrimary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', opacity: accepting ? 0.6 : 1 }} onPress={onAccept} disabled={accepting}>
                    {accepting ? <ActivityIndicator size="small" color={colors.bg} /> : <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 14 }}>Accept</Text>}
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const ExpiryBadge = ({ expiresAt, colors }) => {
    const [rem, setRem] = useState('');
    useEffect(() => {
        const update = () => {
            const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
            setRem(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`);
        };
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, [expiresAt]);
    return (
        <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontWeight: '700', color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>{rem}</Text>
        </View>
    );
};

export default AcceptRequestScreen;
