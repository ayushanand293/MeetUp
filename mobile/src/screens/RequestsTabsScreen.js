import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    Alert, ActivityIndicator, RefreshControl, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import analyticsService from '../services/analyticsService';
import { useTheme, Spacing, Radius, Font } from '../theme';

const RequestsTabsScreen = ({ route, navigation }) => {
    const { colors } = useTheme();
    const { linkedRequestId, fromInvite } = route.params || {};
    const [activeTab, setActiveTab] = useState(route.params?.activeTab || 'incoming'); // 'incoming' or 'outgoing'
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [acceptingId, setAcceptingId] = useState(null);
    const pollRef = useRef(null);
    const autoRoutedSessionRef = useRef(null);
    const ambient = useRef(new Animated.Value(0)).current;

    const fetchRequests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [incomingRes, outgoingRes] = await Promise.allSettled([
                client.get('/requests/pending'),
                client.get('/requests/outgoing'),
            ]);
            if (incomingRes.status === 'fulfilled') {
                setIncomingRequests(incomingRes.value.data || []);
            }
            if (outgoingRes.status === 'fulfilled') {
                setOutgoingRequests(outgoingRes.value.data || []);
            }

            if (incomingRes.status === 'rejected' && outgoingRes.status === 'rejected') {
                setLoadError('Could not refresh requests. Please retry.');
                if (!silent) Alert.alert('Could Not Load Requests', 'Please check your connection and try again.');
            } else {
                setLoadError('');
            }
        }
        catch (err) {
            setLoadError('Could not refresh requests. Please retry.');
            if (!silent) Alert.alert('Could Not Load Requests', 'Please check your connection and try again.');
        }
        finally { setLoading(false); setRefreshing(false); }
    }, []);

    const prioritizedIncomingRequests = useMemo(() => {
        if (!linkedRequestId) return incomingRequests;
        return [...incomingRequests].sort((a, b) => {
            const aLinked = String(a.id) === String(linkedRequestId);
            const bLinked = String(b.id) === String(linkedRequestId);
            if (aLinked === bLinked) return 0;
            return aLinked ? -1 : 1;
        });
    }, [linkedRequestId, incomingRequests]);

    const linkedRequestFound = !linkedRequestId
        ? false
        : incomingRequests.some((req) => String(req.id) === String(linkedRequestId));

    useEffect(() => {
        fetchRequests();
        pollRef.current = setInterval(() => fetchRequests(true), 5000);
        return () => clearInterval(pollRef.current);
    }, [fetchRequests]);

    useEffect(() => {
        const checkActiveSession = async () => {
            try {
                const res = await client.get('/sessions/active');
                const activeSessionId = res?.data?.session_id;
                if (activeSessionId && activeSessionId !== autoRoutedSessionRef.current) {
                    autoRoutedSessionRef.current = activeSessionId;
                    if (pollRef.current) clearInterval(pollRef.current);
                    navigation.navigate('ActiveSession', { sessionId: activeSessionId });
                }
            } catch (_) {
                // no active session yet
            }
        };

        checkActiveSession();
        const sessionPoll = setInterval(checkActiveSession, 2000);
        return () => clearInterval(sessionPoll);
    }, [navigation]);

    useEffect(() => {
        if (route.params?.activeTab) {
            setActiveTab(route.params.activeTab);
        }
    }, [route.params?.activeTab]);

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
            pendingCount: incomingRequests.length,
        });
    }, [linkedRequestFound, linkedRequestId, loading, incomingRequests.length]);

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
        try {
            await client.post(`/requests/${req.id}/decline`);
            setIncomingRequests(prev => prev.filter(r => r.id !== req.id));
        }
        catch { Alert.alert('Could Not Decline Request', 'Please try again in a moment.'); }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.textSecondary} />
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: Spacing.md }]}>Loading requests...</Text>
            </View>
        );
    }

    const requests = activeTab === 'incoming' ? prioritizedIncomingRequests : outgoingRequests;
    const totalCount = activeTab === 'incoming' ? incomingRequests.length : outgoingRequests.length;

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
                {/* Header */}
                <View style={{ marginBottom: Spacing.md, paddingTop: Spacing.md }}>
                    <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>Requests</Text>
                    <Text style={[Font.title, { color: colors.textPrimary }]}>
                        {activeTab === 'incoming' ? 'Incoming' : 'Waiting'} Requests
                    </Text>
                    <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4, fontWeight: '600' }]}>
                        {totalCount > 0 ? `${totalCount} pending` : 'No pending requests'}
                    </Text>
                </View>

                {/* Tab Switcher */}
                <View style={{ flexDirection: 'row', marginBottom: Spacing.md, gap: Spacing.sm }}>
                    <TouchableOpacity
                        onPress={() => setActiveTab('incoming')}
                        style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: Radius.md,
                            backgroundColor: activeTab === 'incoming' ? colors.textPrimary : colors.surface,
                            borderWidth: 1,
                            borderColor: activeTab === 'incoming' ? colors.textPrimary : colors.border,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: activeTab === 'incoming' ? colors.bg : colors.textPrimary,
                                textAlign: 'center',
                            }}
                        >
                            Incoming ({incomingRequests.length})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('outgoing')}
                        style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: Radius.md,
                            backgroundColor: activeTab === 'outgoing' ? colors.textPrimary : colors.surface,
                            borderWidth: 1,
                            borderColor: activeTab === 'outgoing' ? colors.textPrimary : colors.border,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: activeTab === 'outgoing' ? colors.bg : colors.textPrimary,
                                textAlign: 'center',
                            }}
                        >
                            Waiting ({outgoingRequests.length})
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Error Banner */}
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

                {/* Linked Request Banner (Incoming only) */}
                {activeTab === 'incoming' && !!linkedRequestId && (
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

                {/* Request List */}
                {requests.length === 0 ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
                        <Text style={{ fontSize: 52, color: colors.textMuted, marginBottom: Spacing.md }}>◎</Text>
                        <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 6 }]}>
                            {activeTab === 'incoming' ? 'All clear' : 'No pending requests'}
                        </Text>
                        <Text style={[Font.body, { color: colors.textSecondary }]}>
                            {activeTab === 'incoming' ? 'No incoming requests' : 'You haven\'t sent any requests yet'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={requests}
                        keyExtractor={item => item.id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
                        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.textMuted} onRefresh={() => { setRefreshing(true); fetchRequests(true); }} />}
                        renderItem={({ item, index }) =>
                            activeTab === 'incoming' ? (
                                <IncomingRequestCard
                                    item={item}
                                    index={index}
                                    colors={colors}
                                    accepting={acceptingId === item.id}
                                    linked={String(item.id) === String(linkedRequestId)}
                                    onAccept={() => handleAccept(item)}
                                    onDecline={() => handleDecline(item)}
                                />
                            ) : (
                                <OutgoingRequestCard
                                    item={item}
                                    index={index}
                                    colors={colors}
                                />
                            )
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
};

// Incoming Request Card (from AcceptRequestScreen)
const IncomingRequestCard = ({ item, index, colors, accepting, onAccept, onDecline, linked }) => {
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
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.requester_email}</Text>
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

// Outgoing Request Card (shows waiting time + expiry)
const OutgoingRequestCard = ({ item, index, colors }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(24)).current;
    const [waitingTime, setWaitingTime] = useState('');

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, delay: index * 60, useNativeDriver: true, tension: 80 }),
        ]).start();
    }, []);

    // Calculate waiting time from created_at
    useEffect(() => {
        const update = () => {
            const createdAt = new Date(item.created_at);
            const now = new Date();
            const diffMs = now - createdAt;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) {
                setWaitingTime(`${diffDays}d ago`);
            } else if (diffHours > 0) {
                setWaitingTime(`${diffHours}h ago`);
            } else if (diffMins > 0) {
                setWaitingTime(`${diffMins}m ago`);
            } else {
                setWaitingTime('Just now');
            }
        };
        update();
        const t = setInterval(update, 30000); // update every 30s
        return () => clearInterval(t);
    }, [item.created_at]);

    const initials = (item.receiver_name || '?')[0].toUpperCase();
    const statusText = item.status === 'ACCEPTED' ? 'Accepted' : 'Waiting...';
    const statusColor = item.status === 'ACCEPTED' ? '#10B981' : colors.textMuted;

    return (
        <Animated.View style={{
            opacity,
            transform: [{ translateY }],
            backgroundColor: colors.surface,
            borderRadius: Radius.lg,
            padding: Spacing.md,
            marginBottom: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
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
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{item.receiver_name}</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>
                        {statusText}
                    </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700', color: statusColor, fontSize: 12 }}>
                            {statusText === 'Accepted' ? '✓' : '⧗'}
                        </Text>
                    </View>
                    <Text style={[Font.caption, { color: colors.textMuted }]}>
                        {waitingTime}
                    </Text>
                </View>
            </View>

            {/* Expiry countdown */}
            {item.expires_at && (
                <View style={{ marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={[Font.caption, { color: colors.textMuted }]}>
                        Expires
                    </Text>
                    <ExpiryBadge expiresAt={item.expires_at} colors={colors} />
                </View>
            )}
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
        <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, marginTop: 4 }}>
            <Text style={{ fontWeight: '700', color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>{rem}</Text>
        </View>
    );
};

export default RequestsTabsScreen;
