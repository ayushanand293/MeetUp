import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
    ScrollView, Animated, Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const RegisterScreen = ({ navigation }) => {
    const { colors } = useTheme();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [focused, setFocused] = useState(null);
    const { signUpWithEmail, loading } = useAuth();

    const cardY = useRef(new Animated.Value(40)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const btnScale = useRef(new Animated.Value(1)).current;
    const ambient = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 80 }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
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

    const handleRegister = async () => {
        if (!name.trim() || !email.trim() || !password || !confirm) { Alert.alert('Missing fields', 'Fill in all fields'); return; }
        if (password !== confirm) { Alert.alert('Error', 'Passwords do not match'); return; }
        if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
        try {
            await signUpWithEmail(email.trim(), password);
            Alert.alert('✓ Account Created', 'Check your email for a confirmation link, then sign in.',
                [{ text: 'Sign In', onPress: () => navigation.navigate('Login', { pendingName: name.trim() }) }]);
        } catch (e) { Alert.alert('Registration failed', e.message); }
    };

    const Field = ({ label, ...props }) => (
        <View style={{ marginBottom: Spacing.md }}>
            <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>{label}</Text>
            <TextInput
                style={{
                    backgroundColor: colors.surfaceSoft || colors.inputBg, borderWidth: 1,
                    borderColor: focused === label ? colors.textMuted : colors.border,
                    borderRadius: Radius.md, padding: 14, color: colors.textPrimary, fontSize: 15,
                }}
                placeholderTextColor={colors.textMuted}
                onFocus={() => setFocused(label)} onBlur={() => setFocused(null)} {...props}
            />
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: 210,
                    height: 210,
                    borderRadius: 105,
                    top: -70,
                    right: -50,
                    backgroundColor: colors.accentBg,
                    opacity: 0.95,
                    transform: [{ translateY: ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }],
                }}
            />
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
                    <TouchableOpacity style={{ alignSelf: 'flex-start', marginBottom: Spacing.md }} onPress={() => navigation.goBack()}>
                        <Text style={{ color: colors.textSecondary, fontSize: 28 }}>‹</Text>
                    </TouchableOpacity>
                    <View style={{ width: 92, height: 92, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md, shadowColor: colors.textPrimary, shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
                        <Image source={require('../../assets/Meet up logo.png')} style={{ width: 72, height: 72 }} resizeMode="contain" />
                    </View>
                    <Text style={[Font.title, { color: colors.textPrimary }]}>Create account</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 4, marginBottom: 6 }]}>START YOUR FIRST SESSION</Text>
                    <Text style={[Font.body, { color: colors.textSecondary }]}>Join MeetUp today</Text>
                </View>

                <Animated.View style={{
                    backgroundColor: colors.surface,
                    borderRadius: Radius.xl,
                    padding: Spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: cardOpacity,
                    transform: [{ translateY: cardY }],
                    shadowColor: colors.textPrimary,
                    shadowOpacity: 0.08,
                    shadowOffset: { width: 0, height: 10 },
                    shadowRadius: 16,
                    elevation: 5,
                }}>
                    <Field label="YOUR NAME" value={name} onChangeText={setName} placeholder="How should we call you?" autoCapitalize="words" />
                    <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                    <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Min. 6 characters" secureTextEntry />
                    <Field label="CONFIRM" value={confirm} onChangeText={setConfirm} placeholder="Repeat password" secureTextEntry />
                    <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                        <TouchableOpacity
                            style={{
                                backgroundColor: colors.textPrimary,
                                borderRadius: Radius.md,
                                paddingVertical: 15,
                                alignItems: 'center',
                                marginTop: Spacing.sm,
                                shadowColor: colors.textPrimary,
                                shadowOpacity: 0.08,
                                shadowOffset: { width: 0, height: 8 },
                                shadowRadius: 12,
                                elevation: 3,
                            }}
                            onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                            onPress={handleRegister} disabled={loading}>
                            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>Create Account</Text>}
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>

                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl }}>
                    <Text style={[Font.body, { color: colors.textSecondary }]}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                        <Text style={[Font.body, { color: colors.textPrimary, fontWeight: '700' }]}>Sign in</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

export default RegisterScreen;
