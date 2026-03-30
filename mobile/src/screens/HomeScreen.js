import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, TouchableOpacity,
    ScrollView, Animated, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const MOCK_HISTORY = [
    {
        session_id: 'mock-session-1',
        co_participant_id: 'mock-user-sarah',
        co_participant_name: 'Sarah',
        co_participant_email: 'sarah@test.com',
        ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
        session_id: 'mock-session-2',
        co_participant_id: 'mock-user-marcus',
        co_participant_name: 'Marcus',
        co_participant_email: 'marcus@test.com',
        ended_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    },
    {
        session_id: 'mock-session-3',
        co_participant_id: 'mock-user-jordan',
        co_participant_name: 'Jordan',
        co_participant_email: 'jordan@test.com',
        ended_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIMELINE_ITEM_WIDTH = Math.max(132, Math.floor((SCREEN_WIDTH - 92) / 2));

const HomeScreen = ({ navigation }) => {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [activeSession, setActiveSession] = useState(null);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [homeError, setHomeError] = useState('');
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [history, setHistory] = useState([]);
    const pollRef = useRef(null);
    const activeSessionIdRef = useRef(null);
    const [now, setNow] = useState(Date.now());

    // Entrance
    const greetY = useRef(new Animated.Value(20)).current;
    const greetOp = useRef(new Animated.Value(0)).current;
    const cardsOp = useRef(new Animated.Value(0)).current;
    const cardsY = useRef(new Animated.Value(30)).current;
    const bannerSlide = useRef(new Animated.Value(-80)).current;
    const bannerOp = useRef(new Animated.Value(0)).current;
    const ambientFloat = useRef(new Animated.Value(0)).current;

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
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(ambientFloat, {
                    toValue: 1,
                    duration: 2600,
                    useNativeDriver: true,
                }),
                Animated.timing(ambientFloat, {
                    toValue: 0,
                    duration: 2600,
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();
        return () => loop.stop();
    }, [ambientFloat]);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setIsRefreshing(true);
        try {
            const [sRes, oRes] = await Promise.allSettled([
                client.get('/sessions/active'), client.get('/requests/outgoing'),
            ]);

            if (sRes.status === 'rejected' && oRes.status === 'rejected') {
                setHomeError('Could not refresh home data. Pull to retry.');
            } else {
                setHomeError('');
            }

            const session = sRes.status === 'fulfilled' && sRes.value.data?.session_id ? sRes.value.data : null;
            const nextSessionId = session?.session_id || null;
            const prevSessionId = activeSessionIdRef.current;

            // Avoid state churn when session identity is unchanged.
            if (nextSessionId !== prevSessionId) {
                setActiveSession(session);
                activeSessionIdRef.current = nextSessionId;
            }

            setOutgoingRequests(oRes.status === 'fulfilled' ? oRes.value.data : []);

            if (nextSessionId && !prevSessionId) {
                Animated.parallel([
                    Animated.spring(bannerSlide, { toValue: 0, useNativeDriver: true, tension: 80 }),
                    Animated.timing(bannerOp, { toValue: 1, duration: 300, useNativeDriver: true }),
                ]).start();
            }
        } catch (_) {
            setHomeError('Could not refresh home data. Pull to retry.');
        } finally {
            setIsRefreshing(false);
            setHasLoadedOnce(true);
        }
    }, [bannerOp, bannerSlide]);

    useFocusEffect(useCallback(() => {
        fetchData();
        pollRef.current = setInterval(() => fetchData(true), 5000);
        return () => clearInterval(pollRef.current);
    }, [fetchData]));

    const countdown = (exp) => {
        if (!exp) return null;
        const rem = Math.max(0, Math.floor((new Date(exp).getTime() - now) / 1000));
        if (rem === 0) return '00:00';
        return `${Math.floor(rem / 60)}:${(rem % 60).toString().padStart(2, '0')}`;
    };

    const pending = outgoingRequests.filter(r => r.status === 'PENDING');
    const expiredCount = pending.filter(r => countdown(r.expires_at) === '00:00').length;
    const displayName = user?.email?.split('@')[0] || 'You';
    const ambientUp = ambientFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
    const ambientDown = ambientFloat.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

    // Fetch session history
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await client.get('/sessions/history');
                const historyItems = res.data?.history || [];
                setHistory(historyItems.length ? historyItems : MOCK_HISTORY);
            } catch (err) {
                console.log('Could not fetch history', err);
                setHistory(MOCK_HISTORY);
            }
        };
        fetchHistory();
    }, []);

    const timelineStories = useMemo(() => {
        return history.filter((item) => !!item.co_participant_name).slice(0, 16);
    }, [history]);

    const timelineDisplay = useMemo(() => {
        return [
            {
                session_id: 'timeline-cta-find-friend',
                kind: 'cta',
                label: 'START',
                title: 'Meet a friend',
                subtitle: 'Tap to start a new meetup',
            },
            ...timelineStories,
        ];
    }, [timelineStories]);

    const getTimelineMeta = (endedAt) => {
        if (!endedAt) {
            return { monthDay: 'RECENT', ago: 'Just now' };
        }
        const date = new Date(endedAt);
        const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const day = String(date.getDate()).padStart(2, '0');
        const prettyMonth = date.toLocaleString('en-US', { month: 'short' });

        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let ago = '';
        if (diffMins < 1) ago = 'Just now';
        else if (diffMins < 60) ago = `${diffMins}m ago`;
        else if (diffHours < 24) ago = `${diffHours}h ago`;
        else if (diffDays < 7) ago = `${diffDays}d ago`;
        else ago = `${prettyMonth} ${date.getDate()}`;

        return {
            monthDay: `${month} - ${day}`,
            ago,
        };
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 240,
                    height: 240,
                    borderRadius: 120,
                    top: -85,
                    right: -70,
                    backgroundColor: colors.surfaceElevated,
                    opacity: 0.56,
                    transform: [{ translateY: ambientUp }],
                }}
            />
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 190,
                    height: 190,
                    borderRadius: 95,
                    bottom: 120,
                    left: -70,
                    backgroundColor: colors.surfaceGlass,
                    opacity: 0.4,
                    transform: [{ translateY: ambientDown }],
                }}
            />

            <ScrollView
                style={{ flex: 1, backgroundColor: colors.bg }}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchData()} tintColor={colors.textMuted} />}>

            {/* Header row */}
            <Animated.View style={{ opacity: greetOp, transform: [{ translateY: greetY }], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg }}>
                <View>
                    <Text style={[Font.body, { color: colors.textSecondary, fontSize: 16, marginBottom: 2 }]}>Welcome back</Text>
                    <Text style={[Font.display, { color: colors.textPrimary, marginTop: 1 }]}>{displayName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: '600' }}>Ready for next meetup?</Text>
                </View>
                <TouchableOpacity
                    onPress={() => navigation.navigate('Settings')}
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: 'center',
                        alignItems: 'center',
                        shadowColor: colors.textPrimary,
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 7 },
                        elevation: 4,
                    }}>
                    <Text style={{ fontSize: 20, color: colors.textPrimary }}>⌘</Text>
                </TouchableOpacity>
            </Animated.View>

            {!!homeError && (
                <View style={{
                    marginBottom: Spacing.md,
                    borderWidth: 1,
                    borderColor: colors.warning,
                    backgroundColor: colors.warningBg,
                    borderRadius: Radius.sm,
                    padding: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700', flex: 1 }}>{homeError}</Text>
                    <TouchableOpacity onPress={() => fetchData()}>
                        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Active session banner */}
            {activeSession && (
                <Animated.View style={{ transform: [{ translateY: bannerSlide }], opacity: bannerOp, marginBottom: Spacing.lg }}>
                    <TouchableOpacity
                        style={{
                            backgroundColor: colors.surface,
                            borderRadius: Radius.lg,
                            padding: Spacing.lg,
                            borderWidth: 1,
                            borderColor: colors.border,
                            shadowColor: colors.textPrimary,
                            shadowOpacity: 0.1,
                            shadowOffset: { width: 0, height: 10 },
                            shadowRadius: 18,
                            elevation: 5,
                        }}
                        onPress={() => { clearInterval(pollRef.current); navigation.navigate('ActiveSession', { sessionId: activeSession.session_id }); }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textPrimary, marginRight: 8 }} />
                                <Text style={[Font.label, { color: colors.textPrimary }]}>LIVE</Text>
                            </View>
                            <View style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                backgroundColor: colors.surfaceElevated,
                                borderRadius: Radius.pill,
                                paddingHorizontal: 9,
                                paddingVertical: 4,
                            }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 }}>ACTIVE</Text>
                            </View>
                        </View>
                        <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 2 }]}>Active Session</Text>
                        <Text style={[Font.body, { color: colors.textSecondary, fontSize: 13 }]}>Tap to rejoin the map</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Pending requests */}
            {pending.length > 0 && (
                <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.xl }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted, marginRight: 6 }} />
                            <Text style={[Font.label, { color: colors.textMuted }]}>PENDING REQUESTS</Text>
                        </View>
                        {expiredCount > 0 && (
                            <TouchableOpacity
                                onPress={() => {
                                    setOutgoingRequests((prev) => prev.filter((r) => {
                                        if (r.status !== 'PENDING') return true;
                                        const exp = r.expires_at ? new Date(r.expires_at).getTime() : null;
                                        return exp == null || exp > Date.now();
                                    }));
                                }}>
                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>Clear expired</Text>
                            </TouchableOpacity>
                        )}
                    </View>
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

            {hasLoadedOnce && !activeSession && pending.length === 0 && (
                <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.lg }}>
                    <View style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: Radius.md,
                        padding: Spacing.md,
                    }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: 4 }}>You are all caught up</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Start by finding a friend or wait for an incoming request.</Text>
                    </View>
                </Animated.View>
            )}

            {/* Actions */}
            <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.xl }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted, marginRight: 6 }} />
                    <Text style={[Font.label, { color: colors.textMuted }]}>ACTIONS</Text>
                </View>
                <ActionCard icon="↺" title="Quick Friends" sub="Meet previous friends in one tap" colors={colors}
                    onPress={() => navigation.navigate('QuickFriends')} />
                <ActionCard icon="+" title="Find a Friend" sub="Search by name, send a meet request" colors={colors}
                    onPress={() => navigation.navigate('FriendList')} />
                <ActionCard icon="○" title="Incoming Requests" sub="Accept or decline meet requests" colors={colors}
                    onPress={() => navigation.navigate('AcceptRequest')} />
            </Animated.View>

            {timelineDisplay.length > 0 && (
                <Animated.View style={{ opacity: cardsOp, transform: [{ translateY: cardsY }], marginBottom: Spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted, marginRight: 6 }} />
                            <Text style={[Font.label, { color: colors.textMuted }]}>YOUR MEETUP STORY</Text>
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate('QuickFriends')}>
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>Quick Friends</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: Radius.md,
                        paddingTop: 18,
                        paddingBottom: 2,
                        overflow: 'hidden',
                    }}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            decelerationRate="fast"
                            contentContainerStyle={{ paddingLeft: Spacing.md, paddingRight: Spacing.xl, paddingBottom: 2 }}>
                            <View style={{
                                position: 'relative',
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                minHeight: 112,
                            }}>
                                <View style={{
                                    position: 'absolute',
                                    left: 14,
                                    top: 41,
                                    width: timelineDisplay.length * TIMELINE_ITEM_WIDTH - 28,
                                    borderTopWidth: 1,
                                    borderColor: colors.border,
                                    borderStyle: 'dashed',
                                }} />

                                {timelineDisplay.map((item, idx) => {
                                    const meta = getTimelineMeta(item.ended_at);
                                    const leadIndex = timelineDisplay[0]?.kind === 'cta' ? 1 : 0;
                                    const isLead = idx === leadIndex;
                                    return (
                                        <TimelineStoryItem
                                            key={item.session_id}
                                            item={item}
                                            index={idx}
                                            meta={meta}
                                            isLead={isLead}
                                            colors={colors}
                                            navigation={navigation}
                                        />
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </Animated.View>
            )}
            </ScrollView>
        </SafeAreaView>
    );
};

    const TimelineStoryItem = ({ item, index, meta, isLead, colors, navigation }) => {
        const opacity = useRef(new Animated.Value(0)).current;
        const rise = useRef(new Animated.Value(8)).current;

        useEffect(() => {
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 260,
                    delay: index * 90,
                    useNativeDriver: true,
                }),
                Animated.timing(rise, {
                    toValue: 0,
                    duration: 260,
                    delay: index * 90,
                    useNativeDriver: true,
                }),
            ]).start();
        }, [index, opacity, rise]);

        return (
            <Animated.View style={{ width: TIMELINE_ITEM_WIDTH, paddingRight: 12, opacity, transform: [{ translateY: rise }] }}>
                <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', marginBottom: 8 }}>{item.kind === 'cta' ? item.label : meta.monthDay}</Text>

                <View style={{ alignItems: 'center', width: 28, marginBottom: 10 }}>
                    <View style={{ width: 1, height: 14, backgroundColor: colors.border }} />
                    <View style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        borderWidth: 1,
                        borderColor: item.kind === 'cta' ? colors.textSecondary : (isLead ? colors.textPrimary : colors.textMuted),
                        backgroundColor: item.kind === 'cta' ? colors.surface : (isLead ? colors.textPrimary : colors.surfaceElevated),
                    }} />
                </View>

                {item.kind === 'cta' ? (
                    <>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('FriendList')}
                            style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: Radius.pill,
                                paddingHorizontal: 9,
                                paddingVertical: 4,
                                alignSelf: 'flex-start',
                                marginBottom: 4,
                                backgroundColor: colors.surfaceElevated,
                            }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 9, fontWeight: '800' }}>Meet Friend</Text>
                        </TouchableOpacity>
                        <Text numberOfLines={1} style={[Font.caption, { color: colors.textSecondary, fontSize: 10 }]}>{item.subtitle}</Text>
                    </>
                ) : (
                    <>
                        <Text
                            numberOfLines={1}
                            style={[Font.subtitle, { color: colors.textPrimary, fontSize: 12, marginBottom: 1, fontWeight: isLead ? '800' : '700' }]}>
                            Met {item.co_participant_name}
                        </Text>
                        <Text style={[Font.caption, { color: isLead ? colors.textPrimary : colors.textSecondary, fontSize: 10 }]}>{meta.ago}</Text>
                    </>
                )}
            </Animated.View>
        );
    };




const ActionCard = ({ icon, title, sub, colors, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.surface,
                    borderRadius: Radius.lg,
                    padding: Spacing.md,
                    marginBottom: Spacing.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    shadowColor: colors.textPrimary,
                    shadowOpacity: 0.07,
                    shadowOffset: { width: 0, height: 8 },
                    shadowRadius: 12,
                    elevation: 3,
                }}
                onPress={onPress} onPressIn={() => anim.pressIn(scale)} onPressOut={() => anim.pressOut(scale)}>
                <View style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                }}>
                    <Text style={{ fontSize: 20, color: colors.textPrimary, fontWeight: '700' }}>{icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 16 }]}>{title}</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 4, fontSize: 13 }]}>{sub}</Text>
                </View>
                <View style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: colors.border,
                }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>›</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

export default HomeScreen;
