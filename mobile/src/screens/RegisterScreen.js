import React, { useEffect, useState } from 'react';
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
import PhoneNumberInput, { buildE164Phone, splitE164Phone } from '../components/PhoneNumberInput';
import { useTheme, Spacing, Radius, Font } from '../theme';

const RegisterScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const { session, user, signInWithPhone, verifyPhoneOTP, updateAccountDetails, loading } = useAuth();
  const initialPhone = splitE164Phone(user?.phone_e164 || '');

  const [countryCode, setCountryCode] = useState(initialPhone.countryCode);
  const [phone, setPhone] = useState(initialPhone.localNumber);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(Boolean(session));
  const [displayName, setDisplayName] = useState(user?.display_name || '');

  useEffect(() => {
    if (!session) return;
    setPhoneVerified(true);
    setOtpSent(false);
    setOtp('');
    if (user?.phone_e164) {
      const nextPhone = splitE164Phone(user.phone_e164);
      setCountryCode(nextPhone.countryCode);
      setPhone(nextPhone.localNumber);
    }
    if (user?.display_name) setDisplayName(user.display_name);
  }, [session, user]);

  const phoneE164 = buildE164Phone(countryCode, phone);

  const handleSendOtp = async () => {
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
      Alert.alert('Could not send code', error?.response?.data?.detail || error?.message || 'Please check your number and try again.');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert('Missing field', 'Enter the OTP code.');
      return;
    }

    try {
      await verifyPhoneOTP(phoneE164, otp.trim());
      setPhoneVerified(true);
      Alert.alert('Phone verified', 'Finish your profile to continue.');
    } catch (error) {
      Alert.alert('Invalid code', error?.response?.data?.detail || error?.message || 'Please check the code and try again.');
    }
  };

  const handleSave = async () => {
    if (!phoneVerified && !session) {
      Alert.alert('Phone OTP required', 'Verify your phone number before saving your profile.');
      return;
    }
    if (!displayName.trim()) {
      Alert.alert('Missing field', 'Display name is required.');
      return;
    }

    try {
      await updateAccountDetails({
        display_name: displayName.trim(),
      });
      Alert.alert('Saved', 'Profile updated successfully.');
      navigation.navigate('Home');
    } catch (error) {
      Alert.alert('Could not save', error?.message || 'Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[Font.title, { color: colors.textPrimary }]}>Create account</Text>
          <Text style={[Font.body, { color: colors.textSecondary, marginTop: 6 }]}>Verify your phone first, then add your display name.</Text>

          <PhoneNumberInput
            countryCode={countryCode}
            localNumber={phone}
            onCountryCodeChange={nextCountryCode => {
              setCountryCode(nextCountryCode);
              setPhoneVerified(false);
              setOtpSent(false);
              setOtp('');
            }}
            onLocalNumberChange={text => {
              setPhone(text);
              setPhoneVerified(false);
              setOtpSent(false);
              setOtp('');
            }}
            editable={!phoneVerified && !loading}
          />

          {otpSent && !phoneVerified && (
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
            style={[
              styles.secondaryButton,
              { borderColor: colors.border, backgroundColor: colors.surfaceElevated, opacity: loading || phoneVerified ? 0.65 : 1 },
            ]}
            onPress={otpSent ? handleVerifyOtp : handleSendOtp}
            disabled={loading || phoneVerified}>
            {loading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={[styles.secondaryButtonLabel, { color: colors.textPrimary }]}>
                {phoneVerified ? 'Phone Verified' : otpSent ? 'Verify Phone' : 'Send OTP'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[Font.label, { color: colors.textMuted, marginTop: Spacing.lg }]}>DISPLAY NAME</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
            editable={phoneVerified && !loading}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.textPrimary, opacity: loading || !phoneVerified ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={loading || !phoneVerified}>
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={[styles.buttonLabel, { color: colors.bg }]}>Save Profile</Text>}
          </TouchableOpacity>

          {!session && (
            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.md }}>
              <Text style={[Font.caption, { color: colors.textMuted }]}>Back to OTP login</Text>
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
  secondaryButton: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default RegisterScreen;
