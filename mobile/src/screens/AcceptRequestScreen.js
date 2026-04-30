import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    Alert, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import analyticsService from '../services/analyticsService';
import { useTheme, Spacing, Radius, Font } from '../theme';

const AcceptRequestScreen = ({ route, navigation }) => {
    const { colors } = useTheme();
    const { linkedRequestId, inviteToken, requesterName, fromInvite } = route.params || {};
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [acceptingId, setAcceptingId] = useState(null);
    const pollRef = useRef(null);
    const ambient = useRef(new Animated.Value(0)).current;

    const fetchRequests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await client.get('/requests/pending');
            setRequests(res.data || []);
            setLoadError('');
        }
        catch (err) {
            setLoadError('Could not refresh requests. Please retry.');
            if (!silent) Alert.alert('Could Not Load Requests', 'Please check your connection and try again.');
        }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    const prioritizedRequests = useMemo(() => {
        if (!linkedRequestId) return requests;
        return [...requests].sort((a, b) => {
            const aLinked = String(a.id) === String(linkedRequestId);
            const bLinked = String(b.id) === String(linkedRequestId);
            if (aLinked === bLinked) return 0;
            return aLinked ? -1 : 1;
        });
    }, [linkedRequestId, requests]);

    const linkedRequestFound = !linkedRequestId
        ? false
        : requests.some((req) => String(req.id) === String(linkedRequestId));

    useEffect(() => {
        fetchRequests();
        pollRef.current = setInterval(() => fetchRequests(true), 5000);
        return () => clearInterval(pollRef.current);
    }, [fetchRequests]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(ambient, { toValue: 1, duration: 2800, useNativeDriver: true }),
                Animated.timing(ambient, { toValue: 0, duration: 2800, useNativeDriver: true }),
            ])
        );

        loop.start();
        return () => loop.stop();
    }, [ambient]);

    useEffect(() => {
        if (!linkedRequestId || loading) return;
        analyticsService.track('linked_request_resolved', {
            requestId: linkedRequestId,
            found: linkedRequestFound,
            pendingCount: requests.length,
        });
    }, [linkedRequestFound, linkedRequestId, loading, requests.length]);

    const handleAccept = async (req) => {
        setAcceptingId(req.id);
        try {
            const res = await client.post(`/requests/${req.id}/accept`);
            const { session_id, peer_name, peer_id } = res.data;
            analyticsService.track('request_accepted', {
                requestId: req.id,
                viaLink: String(req.id) === String(linkedRequestId),
                sessionId: session_id,
            });
            clearInterval(pollRef.current);
            navigation.navigate('ActiveSession', { sessionId: session_id, friend: { id: peer_id, display_name: peer_name, name: peer_name } });
        } catch (err) {
            analyticsService.track('request_accept_failed', {
                requestId: req.id,
                status: err?.response?.status || null,
            });
            Alert.alert(
                err.response?.status === 410 ? 'Request Expired' : 'Could Not Accept Request',
                err.response?.status === 410
                    ? 'This request has expired. Ask them to send a new one.'
                    : 'Please try again in a moment.'
            );
        } finally { setAcceptingId(null); }
    };

    const handleDecline = async (req) => {
        try { await client.post(`/requests/${req.id}/decline`); setRequests(prev => prev.filter(r => r.id !== req.id)); }
        catch { Alert.alert('Could Not Decline Request', 'Please try again in a moment.'); }
    };

    const handleInviteAccept = async () => {
        if (!inviteToken) return;
        setAcceptingId('invite-token');
        try {
            const res = await client.post(`/invites/${encodeURIComponent(inviteToken)}/redeem`);
            const sessionId = res?.data?.session_id;
            if (!sessionId) {
                Alert.alert('Could Not Accept Invite', 'Invite redeemed but no active session was returned.');
                return;
            }
            clearInterval(pollRef.current);
            navigation.navigate('ActiveSession', {
                sessionId,
                friend: { name: requesterName || 'Friend', display_name: requesterName || 'Friend' },
            });
        } catch (err) {
            Alert.alert(
                err?.response?.status === 410 ? 'Invite Expired' : 'Could Not Accept Invite',
                err?.response?.status === 410 ? 'This invite has expired. Ask for a new link.' : 'Please try again.'
            );
        } finally {
            setAcceptingId(null);
        }
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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 220,
                    height: 220,
                    borderRadius: 110,
                    top: -60,
                    right: -50,
                    backgroundColor: colors.surfaceElevated,
                    opacity: 0.46,
                    transform: [{ translateY: ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }],
                }}
            />

            <View style={{ flex: 1, padding: Spacing.lg }}>
            <View style={{ marginBottom: Spacing.md, paddingTop: Spacing.md }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>Inbox</Text>
                <Text style={[Font.title, { color: colors.textPrimary }]}>Incoming Requests</Text>
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4, fontWeight: '600' }]}> 
                    {requests.length > 0 ? `${requests.length} pending` : 'No pending requests'}
                </Text>
            </View>

            <View style={{
                alignSelf: 'flex-start',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: Radius.pill,
                backgroundColor: colors.surfaceElevated,
                paddingHorizontal: 10,
                paddingVertical: 4,
                marginBottom: Spacing.md,
            }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                    {requests.length > 0 ? `${requests.length} pending` : 'Inbox clear'}
                </Text>
            </View>

            {!!loadError && (
                <View style={{
                    marginBottom: Spacing.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: Radius.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12, flex: 1 }}>{loadError}</Text>
                    <TouchableOpacity onPress={() => fetchRequests()}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 12 }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!!linkedRequestId && (
                <View style={{
                    marginBottom: Spacing.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: Radius.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                }}>
                    <Text style={{
                        color: colors.textPrimary,
                        fontWeight: '700',
                        fontSize: 12,
                    }}>
                        {linkedRequestFound
                            ? 'Invite request found. Accept to join quickly.'
                            : 'Invite request is missing or expired.'}
                    </Text>
                    {!!fromInvite && (
                        <Text style={{
                            color: colors.textSecondary,
                            fontSize: 11,
                            marginTop: 2,
                        }}>
                            Opened from shared link.
                        </Text>
                    )}
                </View>
            )}

            {!linkedRequestFound && !!inviteToken && (
                <View style={{
                    marginBottom: Spacing.md,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: Radius.sm,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
                        {requesterName ? `${requesterName} wants to meet.` : 'You have an invite to meet now.'}
                    </Text>
                    <TouchableOpacity
                        onPress={handleInviteAccept}
                        disabled={acceptingId === 'invite-token'}
                        style={{
                            marginTop: 10,
                            backgroundColor: colors.textPrimary,
                            borderRadius: Radius.md,
                            paddingVertical: 10,
                            alignItems: 'center',
                            opacity: acceptingId === 'invite-token' ? 0.7 : 1,
                        }}>
                        {acceptingId === 'invite-token' ? (
                            <ActivityIndicator size="small" color={colors.bg} />
                        ) : (
                            <Text style={{ color: colors.bg, fontWeight: '700' }}>Accept Invite</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {requests.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
                    <Text style={{ fontSize: 52, color: colors.textMuted, marginBottom: Spacing.md }}>◎</Text>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 6 }]}>All clear</Text>
                    <Text style={[Font.body, { color: colors.textSecondary }]}>No pending requests</Text>
                </View>
            ) : (
                <FlatList data={prioritizedRequests} keyExtractor={item => item.id} showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: Spacing.xxl }}
                    refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.textMuted} onRefresh={() => { setRefreshing(true); fetchRequests(true); }} />}
                    renderItem={({ item, index }) => (
                        <RequestCard item={item} index={index} colors={colors} accepting={acceptingId === item.id}
                            linked={String(item.id) === String(linkedRequestId)}
                            onAccept={() => handleAccept(item)} onDecline={() => handleDecline(item)} />
                    )} />
            )}
            </View>
        </SafeAreaView>
    );
};

const RequestCard = ({ item, index, colors, accepting, onAccept, onDecline, linked }) => {
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
        <Animated.View style={{
            opacity,
            transform: [{ translateY }],
            backgroundColor: colors.surface,
            borderRadius: Radius.lg,
            padding: Spacing.md,
            marginBottom: Spacing.sm,
            borderWidth: 1,
            borderColor: linked ? colors.textPrimary : colors.border,
            shadowColor: colors.textPrimary,
            shadowOpacity: 0.06,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 10,
            elevation: 2,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 18 }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{item.requester_name}</Text>
                </View>
                {linked && (
                    <View style={{
                        backgroundColor: colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: colors.textPrimary,
                        borderRadius: Radius.sm,
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        marginRight: 6,
                    }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
                            LINKED
                        </Text>
                    </View>
                )}
                {item.expires_at && <ExpiryBadge expiresAt={item.expires_at} colors={colors} />}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' }} onPress={onDecline}>
                    <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 14 }}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{
                    flex: 2,
                    backgroundColor: colors.textPrimary,
                    borderRadius: Radius.md,
                    paddingVertical: 12,
                    alignItems: 'center',
                    opacity: accepting ? 0.6 : 1,
                    shadowColor: colors.textPrimary,
                    shadowOpacity: 0.08,
                    shadowOffset: { width: 0, height: 6 },
                    shadowRadius: 10,
                    elevation: 2,
                }} onPress={onAccept} disabled={accepting}>
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
