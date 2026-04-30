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
import PhoneNumberInput, { buildE164Phone, DEFAULT_COUNTRY_CODE } from '../components/PhoneNumberInput';
import { useTheme, Spacing, Radius, Font } from '../theme';

const LoginScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const {
    signInWithPhone,
    verifyPhoneOTP,
    loading,
    sessionInvalidatedElsewhere,
    clearSessionInvalidatedFlag,
  } = useAuth();

  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const phoneE164 = buildE164Phone(countryCode, phone);

  const handlePhoneLogin = async () => {
    if (!phoneE164) {
      Alert.alert('Missing field', 'Select a country code and enter your phone number.');
      return;
    }

    try {
      const result = await signInWithPhone(phoneE164);
      setOtpSent(true);
      const devCodeMessage = result?.dev_otp_code
        ? `\n\nLocal dev code: ${result.dev_otp_code}`
        : '';
      Alert.alert('Code sent', `Enter the 6 digit OTP to continue.${devCodeMessage}`);
    } catch (error) {
      Alert.alert('Could not send code', error?.message || 'Please check your number and try again.');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Missing field', 'Enter the OTP code.');
      return;
    }

    try {
      await verifyPhoneOTP(phoneE164, otp.trim());
    } catch (error) {
      Alert.alert('Invalid code', error?.message || 'Please check the code and try again.');
    }
  };

  if (sessionInvalidatedElsewhere) {
    Alert.alert(
      'Logged In Elsewhere',
      'You have logged in on another device. Please verify OTP again.',
      [{ text: 'OK', onPress: clearSessionInvalidatedFlag }]
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[Font.title, { color: colors.textPrimary }]}>Sign in with phone</Text>
          <Text style={[Font.body, { color: colors.textSecondary, marginTop: 6 }]}>Use your phone number to sign in or create an account.</Text>

          <PhoneNumberInput
            countryCode={countryCode}
            localNumber={phone}
            onCountryCodeChange={setCountryCode}
            onLocalNumberChange={text => {
              setPhone(text);
              setOtpSent(false);
              setOtp('');
            }}
            editable={!loading && !otpSent}
          />

          {otpSent && (
            <>
              <Text style={[Font.label, { color: colors.textMuted, marginTop: Spacing.md }]}>OTP CODE</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={6}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.textPrimary, opacity: loading ? 0.6 : 1 }]}
            onPress={otpSent ? handleVerifyOtp : handlePhoneLogin}
            disabled={loading}>
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={[styles.buttonLabel, { color: colors.bg }]}>{otpSent ? 'Verify OTP' : 'Send OTP'}</Text>}
          </TouchableOpacity>

          {!otpSent && (
            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: Spacing.md }}>
              <Text style={[Font.caption, { color: colors.textMuted }]}>New user? Continue to profile setup</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
    marginTop: 6,
  },
  button: {
    marginTop: Spacing.lg,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default LoginScreen;
