import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Animated,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  UIManager,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../context/AuthContext';
import PhoneNumberInput, { buildE164Phone, splitE164Phone } from '../components/PhoneNumberInput';
import OTPInput from '../components/OTPInput';
import ParticleBackground from '../components/ParticleBackground';
import { useTheme, Spacing, Radius, Font } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RESEND_COOLDOWN = 30;

/** Parse API errors into user-friendly messages */
const parseErrorMessage = (error) => {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status === 401) return 'Invalid code. Please check and try again.';
  if (status === 404) return 'Phone number not found. Please check your number.';
  if (status === 400) return detail || 'Invalid request. Please try again.';
  if (detail) return detail;
  if (error?.message?.includes('Network')) return 'No internet connection. Please check your network.';
  if (error?.message?.includes('timeout')) return 'Request timed out. Please try again.';
  return 'Something went wrong. Please try again.';
};

const RegisterScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const { session, user, signInWithPhone, verifyPhoneOTP, updateAccountDetails, loading } = useAuth();
  const initialPhone = splitE164Phone(user?.phone_e164 || '');

  const [countryCode, setCountryCode] = useState(initialPhone.countryCode);
  const [phone, setPhone] = useState(initialPhone.localNumber);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(Boolean(session));
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [resendTimer, setResendTimer] = useState(0);
  const [otpError, setOtpError] = useState('');

  const red = '#B1121B';
  const canSave = phoneVerified && displayName.trim().length > 0;

  /* ── refs ── */
  const particleRef = useRef(null);
  const otpRef = useRef(null);

  /* ── sync with auth state ── */
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

  /* ── entrance animations ── */
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(-16)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(heroTranslateY, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.spring(cardTranslateY, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, [heroOpacity, heroTranslateY, cardOpacity, cardTranslateY]);

  /* ── step 2 entrance ── */
  const step2Opacity = useRef(new Animated.Value(0)).current;
  const step2TranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (phoneVerified) {
      Animated.stagger(80, [
        Animated.timing(step2Opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(step2TranslateY, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
      ]).start();
    }
  }, [phoneVerified, step2Opacity, step2TranslateY]);

  /* ── resend countdown ── */
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  /* ── handlers ── */
  const handleSendOtp = async () => {
    if (!phoneE164) {
      Alert.alert('Missing field', 'Select a country code and enter your phone number.');
      return;
    }
    try {
      const result = await signInWithPhone(phoneE164);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOtpSent(true);
      setResendTimer(RESEND_COOLDOWN);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const devCodeMessage = result?.dev_otp_code ? `\n\nLocal dev code: ${result.dev_otp_code}` : '';
      Alert.alert('Code sent', `Enter the 6 digit OTP to continue.${devCodeMessage}`);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not send code', parseErrorMessage(error));
    }
  };

  const handleVerifyOtp = useCallback(
    async (code) => {
      const finalCode = code || otp;
      if (!finalCode.trim()) return;
      setOtpError('');
      try {
        await verifyPhoneOTP(phoneE164, finalCode.trim());
        LayoutAnimation.configureNext({
          duration: 300,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
        });
        setPhoneVerified(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        const msg = parseErrorMessage(error);
        setOtpError(msg);
        setOtp('');
        otpRef.current?.shake();
        setTimeout(() => otpRef.current?.focus(), 400);
      }
    },
    [otp, phoneE164, verifyPhoneOTP],
  );

  const handleResend = async () => {
    if (resendTimer > 0 || loading) return;
    try {
      const result = await signInWithPhone(phoneE164);
      setResendTimer(RESEND_COOLDOWN);
      setOtp('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const devCodeMessage = result?.dev_otp_code ? `\n\nLocal dev code: ${result.dev_otp_code}` : '';
      Alert.alert('Code resent', `A new OTP has been sent.${devCodeMessage}`);
    } catch (error) {
      Alert.alert('Could not resend', parseErrorMessage(error));
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
      await updateAccountDetails({ display_name: displayName.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Welcome!', 'Your account has been created.');
      navigation.navigate('Home');
    } catch (error) {
      Alert.alert('Could not save', error?.message || 'Please try again.');
    }
  };

  /* ── touch forwarding to particles ── */
  const handleTouch = (e) => particleRef.current?.scatter(e.nativeEvent.pageX, e.nativeEvent.pageY);
  const handleTouchEnd = () => particleRef.current?.release();

  return (
    <View
      style={[styles.root, { backgroundColor: isDark ? '#0A0A0A' : colors.bg }]}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      onTouchEnd={handleTouchEnd}
    >
      <ParticleBackground
        ref={particleRef}
        count={38}
        dotColor={isDark ? 'rgba(177,18,27,0.40)' : 'rgba(177,18,27,0.35)'}
        dotColorAlt={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(100,100,100,0.25)'}
        lineColor={isDark ? 'rgba(177,18,27,0.10)' : 'rgba(177,18,27,0.06)'}
      />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.safe}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.inner}>

                {/* ── Hero ── */}
                <Animated.View
                  style={[
                    styles.heroArea,
                    { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] },
                  ]}
                >
                  <Text style={[styles.brandName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}>
                    Meet<Text style={{ color: red }}>Up</Text>
                  </Text>
                  <Text style={[styles.heroTitle, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}>
                    Create account
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: isDark ? 'rgba(255,255,255,0.55)' : colors.textSecondary }]}>
                    Two quick steps to get started
                  </Text>
                </Animated.View>

                {/* ── Step 1 Card: Phone verification ── */}
                <Animated.View
                  style={[
                    styles.cardWrap,
                    { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
                  ]}
                >
                  <View style={[styles.card, {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.06)',
                  }]}>
                    <View style={styles.stepHeader}>
                      <View style={[styles.stepBadge, {
                        backgroundColor: phoneVerified ? red : (isDark ? '#222' : colors.surfaceElevated),
                      }]}>
                        <Text style={[styles.stepBadgeText, {
                          color: phoneVerified ? '#FFF' : colors.textPrimary,
                        }]}>
                          {phoneVerified ? '✓' : '1'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                          Phone verification
                        </Text>
                        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                          {phoneVerified
                            ? `Verified · ${countryCode.dialCode} ${phone}`
                            : otpSent
                            ? `Code sent to ${countryCode.dialCode} ${phone}`
                            : 'We\'ll send you a verification code'}
                        </Text>
                      </View>
                    </View>

                    {!phoneVerified && !otpSent && (
                      <>
                        <PhoneNumberInput
                          countryCode={countryCode}
                          localNumber={phone}
                          onCountryCodeChange={(next) => {
                            setCountryCode(next);
                            setPhoneVerified(false);
                            setOtpSent(false);
                            setOtp('');
                          }}
                          onLocalNumberChange={(text) => {
                            setPhone(text);
                            setPhoneVerified(false);
                            setOtpSent(false);
                            setOtp('');
                          }}
                          editable={!loading}
                        />

                        <TouchableOpacity
                          style={[styles.primaryButton, {
                            backgroundColor: red,
                            opacity: loading ? 0.65 : 1,
                          }]}
                          onPress={handleSendOtp}
                          disabled={loading}
                          activeOpacity={0.8}
                        >
                          {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <Text style={styles.primaryButtonLabel}>Continue</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}

                    {!phoneVerified && otpSent && (
                      <>
                        <OTPInput
                          ref={otpRef}
                          value={otp}
                          onChangeText={(text) => {
                            setOtp(text);
                            if (otpError) setOtpError('');
                          }}
                          onComplete={handleVerifyOtp}
                          editable={!loading}
                          error={otpError}
                        />

                        {loading && (
                          <View style={styles.verifyingRow}>
                            <ActivityIndicator color={red} size="small" />
                            <Text style={[Font.caption, { color: colors.textMuted, marginLeft: 8 }]}>
                              Verifying…
                            </Text>
                          </View>
                        )}

                        <View style={styles.otpActions}>
                          <TouchableOpacity
                            onPress={handleResend}
                            disabled={resendTimer > 0 || loading}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.actionText, {
                              color: resendTimer > 0 ? colors.textMuted : red,
                            }]}>
                              {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setOtpSent(false);
                              setOtp('');
                              setResendTimer(0);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                              Change number
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </Animated.View>

                {/* ── Step 2 Card ── */}
                {!phoneVerified ? (
                  <Animated.View style={[styles.cardWrap, { marginTop: Spacing.sm, opacity: cardOpacity }]}>
                    <View style={[styles.collapsedCard, {
                      backgroundColor: isDark ? colors.surfaceSoft : colors.surfaceElevated,
                      borderColor: colors.border,
                    }]}>
                      <View style={[styles.stepBadge, {
                        backgroundColor: isDark ? '#222' : colors.surface,
                        opacity: 0.5,
                      }]}>
                        <Text style={[styles.stepBadgeText, { color: colors.textMuted }]}>2</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.collapsedTitle, { color: colors.textMuted }]}>
                          Profile
                        </Text>
                        <Text style={[styles.collapsedSubtitle, { color: colors.textMuted }]}>
                          Complete step 1 first
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                ) : (
                  <Animated.View
                    style={[
                      styles.cardWrap,
                      {
                        marginTop: Spacing.sm,
                        opacity: step2Opacity,
                        transform: [{ translateY: step2TranslateY }],
                      },
                    ]}
                  >
                    <View style={[styles.card, {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.06)',
                    }]}>
                      <View style={styles.stepHeader}>
                        <View style={[styles.stepBadge, { backgroundColor: red }]}>
                          <Text style={[styles.stepBadgeText, { color: '#FFF' }]}>2</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                            Profile
                          </Text>
                          <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                            This will be visible on your profile
                          </Text>
                        </View>
                      </View>

                      <Text style={[Font.label, { color: colors.textMuted, marginTop: Spacing.md }]}>
                        DISPLAY NAME
                      </Text>
                      <TextInput
                        style={[styles.input, {
                          color: colors.textPrimary,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceElevated,
                        }]}
                        placeholder="Enter your name"
                        placeholderTextColor={colors.textMuted}
                        value={displayName}
                        onChangeText={setDisplayName}
                        editable={!loading}
                        autoFocus
                      />

                      <TouchableOpacity
                        style={[styles.primaryButton, {
                          backgroundColor: canSave ? red : (isDark ? '#222' : colors.surfaceElevated),
                          opacity: loading ? 0.65 : 1,
                          shadowOpacity: canSave ? 0.25 : 0,
                        }]}
                        onPress={handleSave}
                        disabled={loading || !canSave}
                        activeOpacity={0.8}
                      >
                        {loading ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={[styles.primaryButtonLabel, {
                            color: canSave ? '#FFFFFF' : colors.textMuted,
                          }]}>
                            Create account
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}

                {/* ── Back link ── */}
                {!session && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Login')}
                    style={styles.backLink}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.backLinkText, { color: red }]}>
                      ← Back to login
                    </Text>
                  </TouchableOpacity>
                )}

              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  /* Hero */
  heroArea: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 21,
  },

  /* Cards */
  cardWrap: {},
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.lg,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 6,
  },
  collapsedCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.6,
  },
  collapsedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  collapsedSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  /* Step header */
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  stepBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },

  /* Typography */
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },

  /* Input */
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
  },

  /* Buttons */
  primaryButton: {
    marginTop: Spacing.lg,
    borderRadius: Radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#B1121B',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  /* OTP */
  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  otpActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Back link */
  backLink: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default RegisterScreen;
