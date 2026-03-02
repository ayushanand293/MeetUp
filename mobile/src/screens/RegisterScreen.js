import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
    ScrollView, Animated,
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

    useEffect(() => {
        Animated.parallel([
            Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 80 }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
    }, []);

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
                    backgroundColor: colors.inputBg, borderWidth: 1,
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
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
                    <TouchableOpacity style={{ alignSelf: 'flex-start', marginBottom: Spacing.md }} onPress={() => navigation.goBack()}>
                        <Text style={{ color: colors.textSecondary, fontSize: 28 }}>‹</Text>
                    </TouchableOpacity>
                    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent }} />
                    </View>
                    <Text style={[Font.title, { color: colors.textPrimary }]}>Create account</Text>
                    <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>Join MeetUp today</Text>
                </View>

                <Animated.View style={{ backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, opacity: cardOpacity, transform: [{ translateY: cardY }] }}>
                    <Field label="YOUR NAME" value={name} onChangeText={setName} placeholder="How should we call you?" autoCapitalize="words" />
                    <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                    <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Min. 6 characters" secureTextEntry />
                    <Field label="CONFIRM" value={confirm} onChangeText={setConfirm} placeholder="Repeat password" secureTextEntry />
                    <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                        <TouchableOpacity
                            style={{ backgroundColor: colors.textPrimary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.sm }}
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
