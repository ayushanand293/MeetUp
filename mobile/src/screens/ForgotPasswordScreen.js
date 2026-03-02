import React, { useState, useRef, useEffect } from 'react';
import {
<<<<<<< Updated upstream
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
=======
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated,
>>>>>>> Stashed changes
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const ForgotPasswordScreen = ({ navigation }) => {
<<<<<<< Updated upstream
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [step, setStep] = useState(1); // 1: Request, 2: Reset
    const { resetPasswordForEmail, updateUserPassword, loading } = useAuth();

    const handleRequestReset = async () => {
        if (!email.trim()) {
            Alert.alert('Error', 'Please enter your email address');
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
            Alert.alert('Error', error.message);
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters');
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
            Alert.alert('Error', error.message);
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

=======
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, _setStep] = useState(1);
  const [focused, setFocused] = useState(null);
  const { resetPasswordForEmail, updateUserPassword, loading } = useAuth();

  const cardY = useRef(new Animated.Value(30)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardY, { toValue: 0, useNativeDriver: true, tension: 80 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleRequestReset = async () => {
    if (!email.trim()) { Alert.alert('Error', 'Enter your email'); return; }
    try {
      await resetPasswordForEmail(email.trim());
      Alert.alert('Check your email', 'If an account exists, we sent a reset link.', [{ text: 'OK' }]);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) { Alert.alert('Error', 'Min. 6 characters'); return; }
    try {
      await updateUserPassword(newPassword);
      Alert.alert('Success', 'Password updated.', [{ text: 'OK', onPress: () => navigation.navigate('Login') }]);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">

        <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
          <Text style={[Font.title, { color: colors.textPrimary }]}>{step === 1 ? 'Forgot Password' : 'Reset Password'}</Text>
          <Text style={[Font.body, { color: colors.textSecondary, marginTop: 6, textAlign: 'center' }]}>
            {step === 1 ? 'Enter your email to receive a reset link' : 'Enter your new password'}
          </Text>
        </View>

        <Animated.View style={{ backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, opacity: cardOpacity, transform: [{ translateY: cardY }] }}>
          {step === 1 ? (
            <>
              <View style={{ marginBottom: Spacing.md }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>EMAIL</Text>
                <TextInput
                  style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: focused === 'email' ? colors.textMuted : colors.border, borderRadius: Radius.md, padding: 14, color: colors.textPrimary, fontSize: 15 }}
                  placeholder="you@example.com" placeholderTextColor={colors.textMuted}
                  value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                />
              </View>
              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <TouchableOpacity style={{ backgroundColor: colors.textPrimary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center' }}
                  onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                  onPress={handleRequestReset} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>Send Reset Link</Text>}
                </TouchableOpacity>
              </Animated.View>
            </>
          ) : (
            <>
              <View style={{ marginBottom: Spacing.md }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>NEW PASSWORD</Text>
                <TextInput
                  style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: focused === 'pass' ? colors.textMuted : colors.border, borderRadius: Radius.md, padding: 14, color: colors.textPrimary, fontSize: 15 }}
                  placeholder="Min. 6 characters" placeholderTextColor={colors.textMuted}
                  value={newPassword} onChangeText={setNewPassword} secureTextEntry
                  onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
                />
              </View>
              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <TouchableOpacity style={{ backgroundColor: colors.textPrimary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center' }}
                  onPressIn={() => anim.pressIn(btnScale)} onPressOut={() => anim.pressOut(btnScale)}
                  onPress={handleUpdatePassword} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontSize: 15, fontWeight: '700' }}>Update Password</Text>}
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          <TouchableOpacity style={{ marginTop: Spacing.lg, alignItems: 'center' }} onPress={() => navigation.navigate('Login')}>
            <Text style={[Font.body, { color: colors.textSecondary }]}>Back to sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

>>>>>>> Stashed changes
export default ForgotPasswordScreen;
