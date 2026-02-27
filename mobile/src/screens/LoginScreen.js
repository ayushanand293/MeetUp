import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const LoginScreen = ({ navigation, route }) => {
    const [activeTab, setActiveTab] = useState('email'); // 'email' or 'phone'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    const {
        signInWithEmail,
        signInWithPhone,
        verifyPhoneOTP,
        loading
    } = useAuth();

    const handleEmailLogin = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        try {
            const data = await signInWithEmail(email.trim(), password);
            // Upsert user profile into Postgres (required for name search to work)
            // The display_name will be empty until the user sets it via profile
            try {
                const name = route?.params?.pendingName || data?.user?.user_metadata?.display_name || email.split('@')[0];
                await client.post('/users/profile', { display_name: name });
            } catch (profileErr) {
                // Non-fatal: user is still logged in
                console.warn('Profile upsert failed:', profileErr.message);
            }
            // Session state will automatically trigger navigation to MainStack
        } catch (error) {
            let message = error.message;
            if (message.includes('Email not confirmed')) {
                message = 'Please confirm your email address before signing in. Check your inbox (and spam) for a confirmation link.';
            } else if (message.includes('Invalid login credentials')) {
                message = 'Invalid email or password. If you just signed up, make sure you clicked the confirmation link in your email.';
            }
            Alert.alert('Login Error', message);
        }
    };

    const handleSendOTP = async () => {
        if (!phone.trim()) {
            Alert.alert('Error', 'Please enter your phone number');
            return;
        }

        try {
            await signInWithPhone(phone.trim());
            setOtpSent(true);
            Alert.alert('OTP Sent', 'Please check your phone for the verification code.');
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleVerifyOTP = async () => {
        if (!otp.trim()) {
            Alert.alert('Error', 'Please enter the 6-digit OTP');
            return;
        }

        try {
            await verifyPhoneOTP(phone.trim(), otp.trim());
            // Auth state change will handle navigation
        } catch (error) {
            Alert.alert('Verification Error', error.message);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Sign in to your account</Text>
                </View>

                {/* Tab Switcher */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'email' && styles.activeTab]}
                        onPress={() => {
                            setActiveTab('email');
                            setOtpSent(false);
                        }}
                    >
                        <Text style={[styles.tabText, activeTab === 'email' && styles.activeTabText]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'phone' && styles.activeTab]}
                        onPress={() => setActiveTab('phone')}
                    >
                        <Text style={[styles.tabText, activeTab === 'phone' && styles.activeTabText]}>Phone</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.form}>
                    {activeTab === 'email' ? (
                        <>
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Email Address</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your email"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <View style={styles.inputContainer}>
                                <View style={styles.labelRow}>
                                    <Text style={styles.label}>Password</Text>
                                    <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                                        <Text style={styles.forgotText}>Forgot?</Text>
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleEmailLogin}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.buttonText}>Sign In</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Phone Number</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="+1 234 567 8900"
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                    editable={!otpSent}
                                />
                            </View>

                            {otpSent && (
                                <View style={styles.inputContainer}>
                                    <Text style={styles.label}>Verification Code</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="6-digit code"
                                        value={otp}
                                        onChangeText={setOtp}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                    />
                                </View>
                            )}

                            <TouchableOpacity
                                style={styles.button}
                                onPress={otpSent ? handleVerifyOTP : handleSendOTP}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.buttonText}>
                                        {otpSent ? 'Verify & Sign In' : 'Send Verification Code'}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            {otpSent && (
                                <TouchableOpacity
                                    style={styles.resendButton}
                                    onPress={() => setOtpSent(false)}
                                >
                                    <Text style={styles.resendText}>Change Phone Number</Text>
                                </TouchableOpacity>
                            )}
                        </>
                    )}

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                            <Text style={styles.link}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 40,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 4,
        marginBottom: 32,
    },
    tab: {
        flex: 1,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    activeTabText: {
        color: '#007AFF',
    },
    form: {
        width: '100%',
    },
    inputContainer: {
        marginBottom: 20,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        marginLeft: 4,
    },
    forgotText: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '600',
    },
    input: {
        width: '100%',
        height: 56,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#eee',
    },
    button: {
        width: '100%',
        height: 56,
        backgroundColor: '#007AFF',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 20,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    resendButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    resendText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 32,
    },
    footerText: {
        fontSize: 14,
        color: '#666',
    },
    link: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#007AFF',
    },
});

export default LoginScreen;
