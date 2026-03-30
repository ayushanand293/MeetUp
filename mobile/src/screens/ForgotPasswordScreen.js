import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Animated,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Font } from '../theme';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const { resetPasswordForEmail, loading } = useAuth();
  const { colors } = useTheme();
    const ambient = useState(() => new Animated.Value(0))[0];

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setInterval(() => {
            setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(t);
    }, [cooldown]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(ambient, { toValue: 1, duration: 3000, useNativeDriver: true }),
                Animated.timing(ambient, { toValue: 0, duration: 3000, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [ambient]);

    const handleRequestReset = async () => {
        if (!email.trim()) {
            Alert.alert('Missing Email', 'Please enter your email address.');
            return;
        }
        if (cooldown > 0) return;

        try {
            await resetPasswordForEmail(email.trim());
            setSent(true);
            setCooldown(30);
            setStatusText('Reset link sent. Check your inbox and spam folder.');
        } catch (error) {
            setStatusText('Could not send reset link right now. Please try again.');
            Alert.alert('Reset Failed', error.message || 'Please try again.');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: colors.bg }}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 240,
                    height: 240,
                    borderRadius: 120,
                    top: -80,
                    right: -70,
                    backgroundColor: colors.surfaceElevated,
                    opacity: 0.5,
                    transform: [{ translateY: ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }],
                }}
            />
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' }}>
                <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
                    <Text style={[Font.display, { color: colors.textPrimary, textAlign: 'center' }]}>Reset Password</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 6 }]}>ACCOUNT RECOVERY</Text>
                    <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center' }]}>Enter your account email and we will send a secure reset link.</Text>
                </View>

                <View style={{
                    width: '100%',
                    backgroundColor: colors.surface,
                    borderRadius: Radius.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: Spacing.lg,
                    shadowColor: colors.textPrimary,
                    shadowOpacity: 0.07,
                    shadowOffset: { width: 0, height: 10 },
                    shadowRadius: 16,
                    elevation: 4,
                }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.2, marginBottom: 8 }}>EMAIL ADDRESS</Text>
                    <TextInput
                        style={{
                            width: '100%',
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: Radius.md,
                            backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
                            color: colors.textPrimary,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            fontSize: 15,
                            marginBottom: Spacing.md,
                        }}
                        placeholder="name@example.com"
                        placeholderTextColor={colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!loading}
                    />

                    {!!statusText && (
                        <View style={{
                            borderWidth: 1,
                            borderColor: colors.borderLight,
                            backgroundColor: colors.surfaceElevated,
                            borderRadius: Radius.sm,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            marginBottom: Spacing.md,
                        }}>
                            <Text style={{ color: sent ? colors.textPrimary : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{statusText}</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={{
                            borderWidth: 1,
                            borderColor: colors.textPrimary,
                            borderRadius: Radius.md,
                            backgroundColor: colors.textPrimary,
                            paddingVertical: 13,
                            alignItems: 'center',
                            opacity: loading || cooldown > 0 ? 0.65 : 1,
                            shadowColor: colors.textPrimary,
                            shadowOpacity: 0.08,
                            shadowOffset: { width: 0, height: 8 },
                            shadowRadius: 12,
                            elevation: 3,
                        }}
                        onPress={handleRequestReset}
                        disabled={loading || cooldown > 0}>
                        {loading ? (
                            <ActivityIndicator color={colors.bg} />
                        ) : (
                            <Text style={{ color: colors.bg, fontWeight: '800', fontSize: 14 }}>
                                {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Send Again' : 'Send Reset Link'}
                            </Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{ marginTop: Spacing.md, alignItems: 'center' }}
                        onPress={() => navigation.navigate('Login')}
                        disabled={loading}>
                        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Back to Login</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

export default ForgotPasswordScreen;
