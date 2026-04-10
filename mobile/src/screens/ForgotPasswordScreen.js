import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(1);
  const { resetPasswordForEmail, updateUserPassword, loading } = useAuth();
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;

    const handleRequestReset = async () => {
        if (!email.trim()) {
            Alert.alert('Email Required', 'Please enter your email address.');
            return;
        }

        try {
            await resetPasswordForEmail(email.trim());
            Alert.alert(
                'Check your email',
                'If an account exists for this email, we have sent a reset link.',
                [{ text: 'OK' }]
            );
            // In a real flow with OTP, we would navigate to step 2.
            // But Supabase typically uses links. If using OTP/UpdateUser:
            // setStep(2); 
        } catch (error) {
            Alert.alert('Could Not Send Reset Link', 'Please check your email and try again.');
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            Alert.alert('Password Too Short', 'Use at least 6 characters.');
            return;
        }

        try {
            await updateUserPassword(newPassword);
            Alert.alert(
                'Success',
                'Your password has been updated. You can now log in.',
                [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
            );
        } catch (error) {
            Alert.alert('Could Not Update Password', 'Please try again in a moment.');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>
                        {step === 1 ? 'Forgot Password' : 'Reset Password'}
                    </Text>
                    <Text style={styles.subtitle}>
                        {step === 1
                            ? "Enter your email to receive a reset link"
                            : "Enter your new password below"
                        }
                    </Text>
                </View>

                <View style={styles.form}>
                    {step === 1 ? (
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

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleRequestReset}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.buttonText}>Send Reset Link</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>New Password</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter new password"
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleUpdatePassword}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.buttonText}>Update Password</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}

                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.navigate('Login')}
                        disabled={loading}
                    >
                        <Text style={styles.backButtonText}>Back to Login</Text>
                    </TouchableOpacity>
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
        textAlign: 'center',
    },
    form: {
        width: '100%',
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        marginLeft: 4,
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
    backButton: {
        marginTop: 24,
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
});

export default ForgotPasswordScreen;
