import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
    ScrollView, Animated, Dimensions, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation, route }) => {
    const { colors } = useTheme();
    const [activeTab, setActiveTab] = useState('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [focused, setFocused] = useState(null);
    const { signInWithEmail, signInWithPhone, verifyPhoneOTP, loading } = useAuth();

    // Entrance animations
    const logoScale = useRef(new Animated.Value(0.7)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const cardY = useRef(new Animated.Value(40)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const footerOpacity = useRef(new Animated.Value(0)).current;
    const btnScale = useRef(new Animated.Value(1)).current;
    const tabIndicator = useRef(new Animated.Value(0)).current;
    const ambient = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 60 }),
                Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 80, delay: 100 }),
                Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            ]),
            Animated.timing(footerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
    }, []);

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
        Animated.spring(tabIndicator, {
            toValue: activeTab === 'email' ? 0 : 1,
            useNativeDriver: true, tension: 120, friction: 12,
        }).start();
    }, [activeTab]);

    const handleEmailLogin = async () => {
        if (!email.trim() || !password) { Alert.alert('Missing fields', 'Enter your email and password'); return; }
        try {
            const data = await signInWithEmail(email.trim(), password);
            try {
                const name = route?.params?.pendingName || data?.user?.user_metadata?.display_name || email.split('@')[0];
                await client.post('/users/profile', { display_name: name });
            } catch (_) { }
        } catch (error) {
            let msg = error.message;
            if (msg.includes('Email not confirmed')) msg = 'Please confirm your email. Check your inbox.';
            else if (msg.includes('Invalid login credentials')) msg = 'Incorrect email or password.';
            Alert.alert('Sign in failed', msg);
        }
    };

    const handlePhoneLogin = async () => {
        if (!phone.trim()) { Alert.alert('Missing field', 'Enter your phone number'); return; }
        try { await signInWithPhone(phone.trim()); setOtpSent(true); }
        catch (e) { Alert.alert('Error', e.message); }
    };

    const handleVerifyOtp = async () => {
        if (!otp.trim()) { Alert.alert('Missing field', 'Enter the OTP'); return; }
        try { await verifyPhoneOTP(phone.trim(), otp.trim()); }
        catch (e) { Alert.alert('Invalid code', e.message); }
    };

    const s = makeStyles(colors);
    const tabTranslateX = tabIndicator.interpolate({ inputRange: [0, 1], outputRange: [0, (width - Spacing.lg * 2 - Spacing.lg * 2 - 6) / 2] });
    const ambientUp = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
    const ambientDown = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.root, { backgroundColor: colors.bg }]}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 220,
                    height: 220,
                    borderRadius: 110,
                    top: -80,
                    right: -70,
                    backgroundColor: colors.accentBg,
                    opacity: 0.95,
                    transform: [{ translateY: ambientUp }],
                }}
            />
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 180,
                    height: 180,
                    borderRadius: 90,
                    bottom: 60,
                    left: -70,
                    backgroundColor: colors.surfaceGlass,
                    opacity: 0.7,
                    transform: [{ translateY: ambientDown }],
                }}
            />

            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Logo */}
                <Animated.View style={[s.logoArea, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
                    <View style={[s.logoMark, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                        <Image source={require('../../assets/Meet up logo.png')} style={s.logoImage} resizeMode="contain" />
                    </View>
                    <Text style={[Font.display, { color: colors.textPrimary, letterSpacing: -0.8 }]}>MeetUp</Text>
                    <Text style={[Font.body, { color: colors.textSecondary, marginTop: 6, textAlign: 'center', fontWeight: '600' }]}> 
                        Sync your world in seconds.
                    </Text>
                </Animated.View>

                {/* Card */}
                <Animated.View style={[s.card, {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: cardOpacity,
                    transform: [{ translateY: cardY }],
                    shadowColor: colors.textPrimary,
                    shadowOpacity: 0.08,
                    shadowOffset: { width: 0, height: 10 },
                    shadowRadius: 16,
                    elevation: 5,
                }]}> 
                    <Text style={[Font.title, { color: colors.textPrimary, marginBottom: 6 }]}>Welcome back</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginBottom: Spacing.lg }]}>SIGN IN TO CONTINUE</Text>

                    {/* Tab switcher */}
                    <View style={[s.tabRow, { backgroundColor: colors.surfaceElevated }]}> 
                        <Animated.View style={[s.tabSlider, { backgroundColor: colors.borderLight, transform: [{ translateX: tabTranslateX }] }]} />
                        {['email', 'phone'].map(tab => (
                            <TouchableOpacity key={tab} style={s.tab} onPress={() => { setActiveTab(tab); setOtpSent(false); }}>
                                <Text style={[Font.caption, { color: activeTab === tab ? colors.textPrimary : colors.textMuted, fontWeight: activeTab === tab ? '700' : '500' }]}>
                                    {tab === 'email' ? 'Email' : 'Phone'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {activeTab === 'email' ? (
                        <>
                            <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com"
                                keyboardType="email-address" autoCapitalize="none" colors={colors} focused={focused === 'email'}
                                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
                            <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••"
                                secureTextEntry colors={colors} focused={focused === 'pass'}
                                onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
                                right={<TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}><Text style={[Font.caption, { color: colors.textPrimary }]}>Forgot?</Text></TouchableOpacity>} />
                            <AnimBtn label="Sign In" loading={loading} onPress={handleEmailLogin} colors={colors} scale={btnScale} />
                        </>
                    ) : !otpSent ? (
                        <>
                            <Field label="PHONE" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210"
                                keyboardType="phone-pad" colors={colors} focused={focused === 'phone'}
                                onFocus={() => setFocused('phone')} onBlur={() => setFocused(null)} />
                            <AnimBtn label="Send Code" loading={loading} onPress={handlePhoneLogin} colors={colors} scale={btnScale} />
                        </>
                    ) : (
                        <>
                            <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md }]}>Code sent to {phone}</Text>
                            <Field label="CODE" value={otp} onChangeText={setOtp} placeholder="000000"
                                keyboardType="number-pad" colors={colors} focused={focused === 'otp'}
                                onFocus={() => setFocused('otp')} onBlur={() => setFocused(null)} />
                            <AnimBtn label="Verify & Sign In" loading={loading} onPress={handleVerifyOtp} colors={colors} scale={btnScale} />
                        </>
                    )}
                </Animated.View>

                <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
                    <Text style={[Font.body, { color: colors.textSecondary }]}>Don't have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                        <Text style={[Font.body, { color: colors.textPrimary, fontWeight: '700' }]}>Create one</Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

/* ---- Shared sub-components ---- */

const Field = ({ label, right, focused, colors, ...props }) => (
    <View style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[Font.label, { color: colors.textMuted }]}>{label}</Text>
            {right}
        </View>
            <TextInput
            style={{
                backgroundColor: colors.surfaceSoft || colors.inputBg, borderWidth: 1,
                borderColor: focused ? colors.textMuted : colors.border,
                borderRadius: Radius.md, padding: 14, color: colors.textPrimary, fontSize: 15,
            }}
            placeholderTextColor={colors.textMuted} {...props}
        />
    </View>
);

const AnimBtn = ({ label, loading: isLoading, onPress, colors, scale }) => (
    <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
            style={{
                backgroundColor: colors.textPrimary, borderRadius: Radius.md,
                paddingVertical: 15, alignItems: 'center', marginTop: Spacing.sm,
                shadowColor: colors.textPrimary,
                shadowOpacity: 0.08,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 12,
                elevation: 3,
            }}
            onPressIn={() => anim.pressIn(scale)} onPressOut={() => anim.pressOut(scale)}
            onPress={onPress} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>}
        </TouchableOpacity>
    </Animated.View>
);

const makeStyles = (c) => StyleSheet.create({
    root: { flex: 1 },
    scroll: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
    logoArea: { alignItems: 'center', marginBottom: Spacing.xl },
    logoMark: {
        width: 92, height: 92, borderRadius: 24, borderWidth: 1.5,
        justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md,
        shadowColor: c.textPrimary,
        shadowOpacity: 0.09,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
    },
    logoImage: { width: 72, height: 72 },
    card: { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1 },
    tabRow: {
        flexDirection: 'row', borderRadius: Radius.md, padding: 3,
        marginBottom: Spacing.lg, position: 'relative', overflow: 'hidden',
    },
    tabSlider: {
        position: 'absolute', top: 3, left: 3,
        width: '50%', height: '100%', borderRadius: Radius.sm,
    },
    tab: { flex: 1, paddingVertical: 9, alignItems: 'center', zIndex: 1 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
});

export default LoginScreen;
