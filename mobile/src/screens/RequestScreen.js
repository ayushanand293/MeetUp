import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Alert,
    ActivityIndicator, Animated,
    TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const RequestScreen = ({ route, navigation }) => {
    const { colors } = useTheme();
    const { friend } = route.params || {};
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [sentRequestId, setSentRequestId] = useState(null);
    const [activeSession, setActiveSession] = useState(null);
    const [placeQuery, setPlaceQuery] = useState('');
    const [placeResults, setPlaceResults] = useState([]);
    const [selectedDestination, setSelectedDestination] = useState(null);
    const [placeLoading, setPlaceLoading] = useState(false);
    const [placeError, setPlaceError] = useState('');
    const [deviceCoords, setDeviceCoords] = useState(null);
    const waitingPollRef = useRef(null);
    const outgoingPendingCountRef = useRef(0);
    const lastKnownOutgoingRequestIdRef = useRef(null);

    const cardY = useRef(new Animated.Value(40)).current;
    const cardOp = useRef(new Animated.Value(0)).current;
    const ringScale = useRef(new Animated.Value(0.8)).current;
    const btnScale = useRef(new Animated.Value(1)).current;
    const ambient = useRef(new Animated.Value(0)).current;

    // Check for active session on mount
    useEffect(() => {
        const checkActiveSession = async () => {
            try {
                const res = await client.get('/sessions/active');
                if (res?.data?.session_id) {
                    setActiveSession(res.data);
                }
            } catch (_) {
                // No active session
            }
        };
        checkActiveSession();
    }, []);

    useEffect(() => {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then((loc) => setDeviceCoords({
                lat: loc.coords.latitude,
                lon: loc.coords.longitude,
            }))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const q = placeQuery.trim();
        if (q.length < 2) {
            setPlaceResults([]);
            setPlaceError('');
            setPlaceLoading(false);
            return;
        }

        let cancelled = false;
        setPlaceLoading(true);
        setPlaceError('');
        const timer = setTimeout(async () => {
            try {
                const params = { q, limit: 10 };
                if (deviceCoords) {
                    params.lat = deviceCoords.lat;
                    params.lon = deviceCoords.lon;
                }
                const res = await client.get('/places/search', { params });
                if (!cancelled) setPlaceResults(res?.data || []);
            } catch (_) {
                if (!cancelled) {
                    setPlaceResults([]);
                    setPlaceError('Search failed — retry');
                }
            } finally {
                if (!cancelled) setPlaceLoading(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [placeQuery, deviceCoords]);

    useEffect(() => {
        Animated.parallel([
            Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 60 }),
            Animated.timing(cardOp, { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.spring(ringScale, { toValue: 1, useNativeDriver: true, tension: 40, delay: 200 }),
        ]).start();
    }, []);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(ambient, { toValue: 1, duration: 2600, useNativeDriver: true }),
                Animated.timing(ambient, { toValue: 0, duration: 2600, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [ambient]);

    useEffect(() => {
        if (!requestSent) return;

        const checkAcceptanceAndSession = async () => {
            try {
                // Auto-open active session as soon as backend creates it.
                // Keep this isolated so fallback can still run if this endpoint errors.
                try {
                    const res = await client.get('/sessions/active');
                    const activeSessionId = res?.data?.session_id;
                    if (activeSessionId) {
                        if (waitingPollRef.current) clearInterval(waitingPollRef.current);
                        navigation.reset({
                            index: 1,
                            routes: [
                                { name: 'Home' },
                                { name: 'ActiveSession', params: { sessionId: activeSessionId, friend } },
                            ],
                        });
                        return;
                    }
                } catch (_) {
                    // Ignore /sessions/active errors and continue with deterministic recovery.
                }

                // Detect acceptance by observing outgoing pending list transition.
                const outgoingRes = await client.get('/requests/outgoing');
                const outgoing = outgoingRes?.data || [];
                const pendingToFriend = outgoing.filter((r) => String(r?.receiver_id) === String(friend?.id));

                if (pendingToFriend.length > 0) {
                    // Capture id from server list as a fallback in case initial send response missed it.
                    lastKnownOutgoingRequestIdRef.current = pendingToFriend[0]?.id || lastKnownOutgoingRequestIdRef.current;
                }

                const previousPending = outgoingPendingCountRef.current;
                const currentPending = pendingToFriend.length;
                outgoingPendingCountRef.current = currentPending;

                // Deterministic recovery: once we have a request id, keep attempting until accepted.
                const requestIdForRecovery = sentRequestId || lastKnownOutgoingRequestIdRef.current;
                if (requestIdForRecovery) {
                    try {
                        const recoverRes = await client.post(`/sessions/from-request/${requestIdForRecovery}`);
                        const recoveredSessionId = recoverRes?.data?.session_id;
                        if (recoveredSessionId) {
                            if (waitingPollRef.current) clearInterval(waitingPollRef.current);
                            navigation.reset({
                                index: 1,
                                routes: [
                                    { name: 'Home' },
                                    { name: 'ActiveSession', params: { sessionId: recoveredSessionId, friend } },
                                ],
                            });
                            return;
                        }
                    } catch {
                        // Request may still be pending; continue polling silently.
                    }
                }
            } catch (_) {
                // keep polling silently while waiting
            }
        };

        checkAcceptanceAndSession();
        waitingPollRef.current = setInterval(checkAcceptanceAndSession, 2000);

        return () => {
            if (waitingPollRef.current) clearInterval(waitingPollRef.current);
        };
    }, [requestSent, sentRequestId, navigation, friend]);

    const handleSend = async () => {
        if (!friend) return;

        // Prevent requesting while in active session
        if (activeSession?.session_id) {
            Alert.alert(
                'Active Session In Progress',
                'You are currently in an active session. End the session before starting a new request.'
            );
            return;
        }

        // Prevent requesting to the same person you're in a session with (shouldn't happen but safety check)
        if (activeSession?.participants?.some(p => p.user_id === friend.id)) {
            Alert.alert(
                'Already in Session',
                'You are already meeting with this person.'
            );
            return;
        }

        setLoading(true);
        try {
            const payload = { to_user_id: friend.id };
            if (selectedDestination) {
                payload.destination = {
                    name: selectedDestination.name,
                    address: selectedDestination.address,
                    lat: selectedDestination.lat,
                    lon: selectedDestination.lon,
                    provider: selectedDestination.provider,
                    place_id: selectedDestination.place_id,
                };
            }
            const res = await client.post('/requests/', payload);
            if (res?.data?.id) {
                setSentRequestId(res.data.id);
            }
            setRequestSent(true);
        }
        catch (e) {
            const status = e?.response?.status;
            const detail = String(e?.response?.data?.detail || '').toLowerCase();
            if (status === 409) {
                if (detail.includes('active session')) {
                    Alert.alert(
                        'Active Session In Progress',
                        'You are currently in an active session. End it before sending a new request.'
                    );
                } else {
                    Alert.alert(
                        'Request Already Being Discussed',
                        'A request is pending between you and this person. Accept or decline the existing request first.'
                    );
                }
            } else {
                Alert.alert('Could Not Send Request', 'Please try again in a moment.');
            }
        }
        finally { setLoading(false); }
    };

    const initials = (friend?.display_name || '?')[0].toUpperCase();
    const orbUp = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
    const orbDown = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
    const canSend = !activeSession?.session_id;
    const placeHint = placeQuery.trim().length < 2
        ? 'Type to search'
        : placeLoading
            ? 'Searching...'
            : placeError || (placeResults.length === 0 ? 'No results' : '');

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 240,
                    height: 240,
                    borderRadius: 120,
                    top: -90,
                    right: -70,
                    backgroundColor: colors.surfaceElevated,
                    opacity: 0.52,
                    transform: [{ translateY: orbUp }],
                }}
            />
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 180,
                    height: 180,
                    borderRadius: 90,
                    bottom: 120,
                    left: -60,
                    backgroundColor: colors.surfaceGlass,
                    opacity: 0.36,
                    transform: [{ translateY: orbDown }],
                }}
            />

            {/* Warning banner if in active session */}
            {activeSession?.session_id && (
                <View style={{
                    backgroundColor: colors.accentBg,
                    borderColor: colors.accent,
                    borderWidth: 1,
                    borderRadius: Radius.sm,
                    padding: Spacing.md,
                    marginHorizontal: Spacing.lg,
                    marginTop: Spacing.lg,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}>
                    <Text style={{
                        color: colors.accentLight,
                        fontSize: 13,
                        fontWeight: '600',
                        flex: 1,
                    }}>You cannot send new requests while in an active session. End the session first.</Text>
                </View>
            )}

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg }}
                keyboardShouldPersistTaps="handled"
            >
            <Animated.View style={{
                width: '100%',
                backgroundColor: colors.surface,
                borderRadius: Radius.xl,
                padding: Spacing.xl,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                opacity: cardOp,
                transform: [{ translateY: cardY }],
                shadowColor: colors.textPrimary,
                shadowOpacity: 0.08,
                shadowOffset: { width: 0, height: 10 },
                shadowRadius: 16,
                elevation: 4,
            }}>

                {/* Avatar */}
                <View style={{ position: 'relative', marginBottom: Spacing.lg }}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceElevated, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 32 }}>{initials}</Text>
                    </View>
                    <Animated.View style={{ position: 'absolute', top: -4, left: -4, width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', transform: [{ scale: ringScale }] }} />
                </View>

                <Text style={[Font.title, { color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }]}>{friend?.display_name || 'Unknown'}</Text>

                <View style={{ height: 1, backgroundColor: colors.border, width: '100%', marginVertical: Spacing.lg }} />

                {!requestSent ? (
                    <>
                        <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg }]}>
                            This person will receive your meet request.{"\n"}
                            They have <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>10 minutes</Text> to accept.
                        </Text>

                        <View style={{ width: '100%', marginBottom: Spacing.xl }}>
                            <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 14, marginBottom: 6 }]}>Meeting place (optional)</Text>
                            {selectedDestination ? (
                                <View style={{
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    backgroundColor: colors.surfaceElevated,
                                    borderRadius: Radius.md,
                                    padding: 12,
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{selectedDestination.name}</Text>
                                            {!!selectedDestination.address && (
                                                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }} numberOfLines={1}>{selectedDestination.address}</Text>
                                            )}
                                        </View>
                                        <TouchableOpacity onPress={() => setSelectedDestination(null)} style={{ paddingLeft: 10, paddingVertical: 6 }}>
                                            <Text style={{ color: colors.textMuted, fontWeight: '800' }}>Clear</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <>
                                    <TextInput
                                        style={{
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            borderRadius: Radius.md,
                                            backgroundColor: colors.surfaceElevated,
                                            color: colors.textPrimary,
                                            paddingHorizontal: 12,
                                            paddingVertical: 12,
                                        }}
                                        placeholder="Search restaurants, cafes..."
                                        placeholderTextColor={colors.textMuted}
                                        value={placeQuery}
                                        onChangeText={setPlaceQuery}
                                        autoCorrect={false}
                                    />
                                    {!!placeHint && (
                                        <Text style={{ color: placeError ? colors.accent : colors.textMuted, fontSize: 12, marginTop: 8 }}>{placeHint}</Text>
                                    )}
                                    {placeResults.slice(0, 5).map((place) => (
                                        <TouchableOpacity
                                            key={`${place.provider}:${place.place_id || place.name}`}
                                            onPress={() => {
                                                setSelectedDestination(place);
                                                setPlaceQuery('');
                                                setPlaceResults([]);
                                            }}
                                            style={{
                                                paddingVertical: 10,
                                                borderBottomWidth: 1,
                                                borderBottomColor: colors.borderLight,
                                            }}
                                        >
                                            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{place.name}</Text>
                                            {!!place.address && (
                                                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{place.address}</Text>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </>
                            )}
                        </View>
                    </>
                ) : (
                    <View style={{
                        width: '100%',
                        borderWidth: 1,
                        borderColor: colors.borderLight,
                        backgroundColor: colors.surfaceElevated,
                        borderRadius: Radius.md,
                        padding: 12,
                        marginBottom: Spacing.xl,
                    }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Request sent successfully</Text>
                        <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>Waiting for acceptance. This screen will auto-open the live session instantly.</Text>
                    </View>
                )}

                <Animated.View style={{ transform: [{ scale: btnScale }], width: '100%' }}>
                    <TouchableOpacity
                        style={{
                            backgroundColor: activeSession?.session_id ? colors.textMuted : colors.textPrimary,
                            borderRadius: Radius.md,
                            paddingVertical: 15,
                            alignItems: 'center',
                            width: '100%',
                            marginBottom: Spacing.sm,
                            shadowColor: colors.textPrimary,
                            shadowOpacity: 0.09,
                            shadowOffset: { width: 0, height: 8 },
                            shadowRadius: 12,
                            elevation: 3,
                            opacity: (loading || activeSession?.session_id) ? 0.6 : 1,
                        }}
                        onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                        onPress={requestSent ? () => navigation.navigate('Home', {
                            watchOutgoingRequestId: sentRequestId,
                            watchOutgoingAcceptance: true,
                        }) : handleSend}
                        disabled={loading || Boolean(activeSession?.session_id)}>
                        {loading ? <ActivityIndicator color={colors.bg} /> : (
                            <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>
                                {requestSent ? 'Go To Home' : activeSession?.session_id ? 'End Session To Request' : 'Send Meet Request'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center', width: '100%' }} onPress={() => navigation.goBack()}>
                    <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
            </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default RequestScreen;
