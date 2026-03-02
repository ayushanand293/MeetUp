import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, Alert,
    ActivityIndicator, Animated,
} from 'react-native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const RequestScreen = ({ route, navigation }) => {
    const { colors } = useTheme();
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(false);

    const cardY = useRef(new Animated.Value(40)).current;
    const cardOp = useRef(new Animated.Value(0)).current;
    const ringScale = useRef(new Animated.Value(0.8)).current;
    const btnScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 60 }),
            Animated.timing(cardOp, { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.spring(ringScale, { toValue: 1, useNativeDriver: true, tension: 40, delay: 200 }),
        ]).start();
    }, []);

    const handleSend = async () => {
        if (!friend) return;
        setLoading(true);
        try { await client.post('/requests/', { to_user_id: friend.id }); navigation.navigate('Home'); }
        catch (e) { Alert.alert('Error', e.response?.data?.detail || 'Failed to send.'); }
        finally { setLoading(false); }
    };

    const initials = (friend?.display_name || '?')[0].toUpperCase();

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg }}>
            <Animated.View style={{ width: '100%', backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: 'center', opacity: cardOp, transform: [{ translateY: cardY }] }}>

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

                <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl }]}>
                    This person will receive your meet request.{'\n'}
                    They have <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>10 minutes</Text> to accept.
                </Text>

                <Animated.View style={{ transform: [{ scale: btnScale }], width: '100%' }}>
                    <TouchableOpacity
                        style={{ backgroundColor: colors.textPrimary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center', width: '100%', marginBottom: Spacing.sm }}
                        onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                        onPress={handleSend} disabled={loading}>
                        {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>Send Meet Request</Text>}
                    </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center', width: '100%' }} onPress={() => navigation.goBack()}>
                    <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
};

export default RequestScreen;
