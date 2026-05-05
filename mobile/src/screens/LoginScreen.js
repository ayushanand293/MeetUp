import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../context/AuthContext';
import PhoneNumberInput, {
  buildE164Phone,
  DEFAULT_COUNTRY_CODE,
} from '../components/PhoneNumberInput';
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

const LoginScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
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
  const [resendTimer, setResendTimer] = useState(0);
  const [otpError, setOtpError] = useState('');

  const phoneE164 = buildE164Phone(countryCode, phone);
  const red = '#B1121B';

  /* ── refs ── */
  const particleRef = useRef(null);
  const otpRef = useRef(null);

  /* ── entrance animations ── */
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(-16)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(32)).current;

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
  const handlePhoneLogin = async () => {
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

  const handleChangeNumber = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOtpSent(false);
    setOtp('');
    setResendTimer(0);
  };
  /* ── session invalidation — show inline notice, don't block ── */
  const [sessionNotice, setSessionNotice] = useState('');

  useEffect(() => {
    if (sessionInvalidatedElsewhere) {
      setSessionNotice('You were signed out because your account was accessed from another device.');
      clearSessionInvalidatedFlag();
    }
  }, [sessionInvalidatedElsewhere, clearSessionInvalidatedFlag]);

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
        count={40}
        dotColor={isDark ? 'rgba(177,18,27,0.40)' : 'rgba(177,18,27,0.35)'}
        dotColorAlt={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(100,100,100,0.25)'}
        lineColor={isDark ? 'rgba(177,18,27,0.10)' : 'rgba(177,18,27,0.06)'}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
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
                <View style={styles.heroRow}>
                  <Text style={[styles.brandName, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}>
                    Meet<Text style={{ color: red }}>Up</Text>
                  </Text>
                </View>
                <Text style={[styles.heroTitle, { color: isDark ? '#FFFFFF' : colors.textPrimary }]}>
                  Login
                </Text>
                <Text style={[styles.heroSubtitle, { color: isDark ? 'rgba(255,255,255,0.55)' : colors.textSecondary }]}>
                  Enter your phone number to continue
                </Text>
              </Animated.View>

              {/* ── Session notice banner ── */}
              {sessionNotice !== '' && (
                <View style={[styles.noticeBanner, {
                  backgroundColor: isDark ? 'rgba(177,18,27,0.12)' : 'rgba(177,18,27,0.06)',
                  borderColor: isDark ? 'rgba(177,18,27,0.25)' : 'rgba(177,18,27,0.15)',
                }]}>
                  <Text style={[styles.noticeText, { color: isDark ? '#FF8A8A' : '#8B0000' }]}>
                    {sessionNotice}
                  </Text>
                  <TouchableOpacity onPress={() => setSessionNotice('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={{ color: isDark ? '#FF8A8A' : '#8B0000', fontSize: 16, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Card ── */}
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

                  {!otpSent ? (
                    <>
                      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                        Phone number
                      </Text>
                      <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                        Select country code and enter your number
                      </Text>

                      <PhoneNumberInput
                        countryCode={countryCode}
                        localNumber={phone}
                        onCountryCodeChange={setCountryCode}
                        onLocalNumberChange={(text) => {
                          setPhone(text);
                          setOtpSent(false);
                          setOtp('');
                        }}
                        editable={!loading}
                      />

                      <TouchableOpacity
                        style={[styles.primaryButton, { backgroundColor: red, opacity: loading ? 0.65 : 1 }]}
                        onPress={handlePhoneLogin}
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
                  ) : (
                    <>
                      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                        Verification code
                      </Text>
                      <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                        Sent to {countryCode.dialCode} {phone}
                      </Text>

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

                        <TouchableOpacity onPress={handleChangeNumber} activeOpacity={0.7}>
                          <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                            Change number
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>

                {/* ── Bottom CTA ── */}
                {!otpSent && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Register')}
                    style={styles.bottomCta}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bottomCtaText, { color: colors.textMuted }]}>
                      New here?{' '}
                      <Text style={{ color: red, fontWeight: '700' }}>
                        Create your account
                      </Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>

            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  keyboardView: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },

  /* Hero */
  heroArea: {
    marginBottom: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
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

  /* Session notice */
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: Spacing.md,
    gap: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },

  /* Card */
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
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 3,
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },

  /* Primary button */
  primaryButton: {
    marginTop: Spacing.lg,
    borderRadius: Radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#B1121B',
    shadowOpacity: 0.25,
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

  /* Bottom CTA */
  bottomCta: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  bottomCtaText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default LoginScreen;
