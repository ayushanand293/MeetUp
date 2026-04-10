import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Alert,
    ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const RequestScreen = ({ route, navigation }) => {
    const { colors } = useTheme();
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [sentRequestId, setSentRequestId] = useState(null);
    const waitingPollRef = useRef(null);

    const cardY = useRef(new Animated.Value(40)).current;
    const cardOp = useRef(new Animated.Value(0)).current;
    const ringScale = useRef(new Animated.Value(0.8)).current;
    const btnScale = useRef(new Animated.Value(1)).current;
    const ambient = useRef(new Animated.Value(0)).current;

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
                // 1) Check if this specific outgoing request has been accepted
                const outgoingRes = await client.get('/requests/outgoing');
                const outgoing = outgoingRes?.data || [];
                const matched = outgoing.find((r) => {
                    if (sentRequestId && String(r.id) === String(sentRequestId)) return true;
                    return String(r.receiver_id) === String(friend?.id);
                });

                // Keep waiting until backend marks it accepted
                if (!matched || String(matched.status) !== 'ACCEPTED') {
                    return;
                }

                // 2) Once accepted, open active session immediately
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
        setLoading(true);
        try {
            const res = await client.post('/requests/', { to_user_id: friend.id });
            if (res?.data?.id) {
                setSentRequestId(res.data.id);
            }
            setRequestSent(true);
        }
        catch (e) {
            const status = e?.response?.status;
            if (status === 409) {
                Alert.alert(
                    'Request Already Being Discussed',
                    'A request is pending between you and this person. Accept or decline the existing request first.'
                );
            } else {
                Alert.alert('Could Not Send Request', 'Please try again in a moment.');
            }
        }
        finally { setLoading(false); }
    };

    const initials = (friend?.display_name || '?')[0].toUpperCase();
    const orbUp = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
    const orbDown = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

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

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg }}>
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
                <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center', fontSize: 13 }]}>{friend?.email}</Text>

                <View style={{ height: 1, backgroundColor: colors.border, width: '100%', marginVertical: Spacing.lg }} />

                {!requestSent ? (
                    <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl }]}> 
                        This person will receive your meet request.{"\n"}
                        They have <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>10 minutes</Text> to accept.
                    </Text>
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
                            backgroundColor: colors.textPrimary,
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
                        }}
                        onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                        onPress={requestSent ? () => navigation.navigate('Home') : handleSend}
                        disabled={loading}>
                        {loading ? <ActivityIndicator color={colors.bg} /> : (
                            <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>
                                {requestSent ? 'Go To Home' : 'Send Meet Request'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center', width: '100%' }} onPress={() => navigation.goBack()}>
                    <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
            </Animated.View>
            </View>
        </SafeAreaView>
    );
};

export default RequestScreen;
