import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Spacing, Radius, Font } from '../theme';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9 ._'-]{1,39}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const normalizePhoneE164 = (input) => {
  if (!input) return '';

  let value = input.trim();
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  value = value.replace(/(?!^\+)\D/g, '');

  if (!value.startsWith('+')) return '';
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return '';
  return value;
};

const getNameError = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Name is required.';
  if (!NAME_REGEX.test(trimmed)) {
    return "Use 2-40 chars. Allowed: letters, numbers, spaces, apostrophes, dashes, periods.";
  }
  return '';
};

const getEmailError = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Enter a valid email address.';
  return '';
};

const getPhoneError = (value) => {
  if (!value.trim()) return '';
  if (!normalizePhoneE164(value)) return 'Use E.164 format, for example +919876543210.';
  return '';
};

const getPasswordError = (value) => {
  if (!value) return 'Password is required.';
  if (!PASSWORD_REGEX.test(value)) {
    return 'Use 8+ chars with uppercase, lowercase, number, and special character.';
  }
  return '';
};

const StatusChip = ({ colors, tone, text }) => {
  const chipStyle = tone === 'ok'
    ? { borderColor: '#6B6B6B', bg: '#EFEFEF', text: '#2D2D2D' }
    : tone === 'pending'
      ? { borderColor: '#8A8A8A', bg: '#F3F3F3', text: '#535353' }
      : { borderColor: colors.border, bg: colors.surfaceElevated, text: colors.textMuted };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: chipStyle.borderColor,
        backgroundColor: chipStyle.bg,
        borderRadius: Radius.pill,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: chipStyle.text, letterSpacing: 0.5 }}>{text}</Text>
    </View>
  );
};

const SectionCard = ({ colors, title, subtitle, expanded, onToggle, children, actionLabel = 'Edit' }) => (
  <View
    style={{
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      marginBottom: Spacing.md,
      overflow: 'hidden',
    }}>
    <TouchableOpacity
      onPress={onToggle}
      style={{
        paddingHorizontal: Spacing.lg,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[Font.subtitle, { color: colors.textPrimary }]}>{title}</Text>
        {!!subtitle && <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      <Text style={[Font.caption, { color: colors.textSecondary, fontSize: 11 }]}>{expanded ? 'DONE' : actionLabel.toUpperCase()}</Text>
    </TouchableOpacity>

    {expanded && <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg }}>{children}</View>}
  </View>
);

const SettingsScreen = () => {
  const { colors, isDark, toggle } = useTheme();
  const { user, signOut, updateAccountDetails } = useAuth();

  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.display_name || user?.email?.split('@')?.[0] || ''
  );
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [banner, setBanner] = useState(null);
  const [activeSection, setActiveSection] = useState('profile');
  const [touched, setTouched] = useState({
    displayName: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
  });

  const email = user?.email || '';
  const phone = user?.phone || '';
  const isEmailVerified = !!user?.email_confirmed_at;
  const isPhoneVerified = !!user?.phone_confirmed_at;

  useEffect(() => {
    setDisplayName(user?.user_metadata?.display_name || user?.email?.split('@')?.[0] || '');
    setEmailInput(user?.email || '');
    setPhoneInput(user?.phone || '');
  }, [user?.email, user?.phone, user?.user_metadata?.display_name]);

  const initials = useMemo(() => {
    const src = (displayName || email || '?').trim();
    return src ? src[0].toUpperCase() : '?';
  }, [displayName, email]);

  const showBanner = (type, message) => {
    setBanner({ type, message });
  };

  const toggleSection = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveSection((prev) => (prev === key ? '' : key));
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const sectionSubtitle = useMemo(() => {
    return {
      profile: displayName || 'Set your display name',
      contact: `${emailInput || 'No email'}${phoneInput ? ` • ${phoneInput}` : ''}`,
      password: 'Use a strong password with mixed characters',
      appearance: isDark ? 'Dark mode enabled' : 'Light mode enabled',
    };
  }, [displayName, emailInput, phoneInput, isDark]);

  const displayNameError = touched.displayName ? getNameError(displayName) : '';
  const emailError = touched.email ? getEmailError(emailInput) : '';
  const phoneError = touched.phone ? getPhoneError(phoneInput) : '';
  const passwordError = touched.password ? getPasswordError(newPassword) : '';
  const confirmPasswordError = touched.confirmPassword && newPassword !== confirmPassword
    ? 'Passwords do not match.'
    : '';

  const handleSaveProfile = async () => {
    setTouched((prev) => ({ ...prev, displayName: true }));
    const nextName = displayName.trim();
    const validationError = getNameError(nextName);
    if (validationError) {
      showBanner('error', validationError);
      return;
    }

    try {
      setSavingName(true);
      await client.post('/users/profile', { display_name: nextName });
      await updateAccountDetails({ data: { display_name: nextName } });
      showBanner('success', 'Display name updated successfully.');
    } catch (error) {
      showBanner('error', error?.response?.data?.detail || 'Could not update profile right now.');
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdateEmail = async () => {
    setTouched((prev) => ({ ...prev, email: true }));
    const nextEmail = emailInput.trim();
    const validationError = getEmailError(nextEmail);
    if (validationError) {
      showBanner('error', validationError);
      return;
    }
    if (nextEmail === email) {
      showBanner('info', 'This is already your current email.');
      return;
    }

    try {
      setSavingEmail(true);
      await updateAccountDetails({ email: nextEmail });
      showBanner('success', 'Email update requested. Please confirm from your inbox.');
    } catch (error) {
      showBanner('error', error?.message || 'Could not update email right now.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePhone = async () => {
    setTouched((prev) => ({ ...prev, phone: true }));
    const phoneValidation = getPhoneError(phoneInput);
    if (phoneValidation) {
      showBanner('error', phoneValidation);
      return;
    }

    const normalizedPhone = normalizePhoneE164(phoneInput);
    if (!normalizedPhone && phoneInput.trim()) return;
    if (!normalizedPhone && !phoneInput.trim()) {
      showBanner('info', 'Phone field is empty. Add a number to enable OTP verification.');
      return;
    }
    if (normalizedPhone === (user?.phone || '')) {
      showBanner('info', 'This is already your current phone number.');
      return;
    }

    try {
      setSavingPhone(true);
      await updateAccountDetails({ phone: normalizedPhone });
      setPhoneInput(normalizedPhone);
      showBanner('success', 'Phone update requested. Complete OTP verification if prompted.');
    } catch (error) {
      showBanner('error', error?.message || 'Could not update phone right now.');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleUpdatePassword = async () => {
    setTouched((prev) => ({ ...prev, password: true, confirmPassword: true }));
    const validationError = getPasswordError(newPassword);
    if (validationError) {
      showBanner('error', validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      showBanner('error', 'New password and confirmation do not match.');
      return;
    }

    try {
      setSavingPassword(true);
      await updateAccountDetails({ password: newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setTouched((prev) => ({ ...prev, password: false, confirmPassword: false }));
      showBanner('success', 'Password updated successfully.');
    } catch (error) {
      showBanner('error', error?.message || 'Could not update password right now.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
    } catch {
      showBanner('error', 'Sign out failed. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const bannerStyle = useMemo(() => {
    if (!banner) return null;
    if (banner.type === 'success') {
      return {
        border: colors.borderLight,
        bg: colors.successBg || colors.surfaceElevated,
        text: colors.successText || colors.textPrimary,
      };
    }
    if (banner.type === 'info') {
      return {
        border: colors.accent,
        bg: colors.accentBg,
        text: colors.accent,
      };
    }
    return {
      border: colors.accent,
      bg: colors.accentBg,
      text: colors.accent,
    };
  }, [banner, colors.accent, colors.accentBg, colors.successBg, colors.successText]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>

        <View style={{ marginBottom: Spacing.lg }}>
          <Text style={[Font.title, { color: colors.textPrimary }]}>Settings</Text>
          <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>Manage your account and preferences</Text>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.lg,
            backgroundColor: colors.surface,
            padding: Spacing.lg,
            marginBottom: Spacing.md,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[Font.subtitle, { color: colors.textPrimary }]}>{displayName || 'Your Name'}</Text>
              <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{email || 'No email set'}</Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <StatusChip colors={colors} tone={isEmailVerified ? 'ok' : 'pending'} text={isEmailVerified ? 'EMAIL VERIFIED' : 'EMAIL PENDING'} />
                <View style={{ width: 8 }} />
                <StatusChip
                  colors={colors}
                  tone={phone ? (isPhoneVerified ? 'ok' : 'pending') : 'neutral'}
                  text={phone ? (isPhoneVerified ? 'PHONE VERIFIED' : 'PHONE PENDING') : 'PHONE MISSING'}
                />
              </View>
            </View>
          </View>
        </View>

        {!!banner && !!bannerStyle && (
          <View
            style={{
              borderWidth: 1,
              borderColor: bannerStyle.border,
              borderRadius: Radius.md,
              backgroundColor: bannerStyle.bg,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: Spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
            <Text style={{ flex: 1, color: bannerStyle.text, fontWeight: '600', fontSize: 13 }}>{banner.message}</Text>
            <TouchableOpacity onPress={() => setBanner(null)} style={{ marginLeft: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: bannerStyle.text, fontWeight: '800', fontSize: 12 }}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        )}

        <SectionCard
          colors={colors}
          title="Profile"
          subtitle={sectionSubtitle.profile}
          expanded={activeSection === 'profile'}
          onToggle={() => toggleSection('profile')}>
          <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>DISPLAY NAME</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (!touched.displayName) return;
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, displayName: true }))}
            editable={!savingName}
            placeholder="Your display name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            maxLength={40}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: Spacing.md,
            }}
          />
          {!!displayNameError && <Text style={[Font.caption, { color: colors.accent, marginTop: -8, marginBottom: 10 }]}>{displayNameError}</Text>}

          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={savingName}
            style={{
              borderWidth: 1,
              borderColor: colors.textPrimary,
              borderRadius: Radius.md,
              backgroundColor: colors.textPrimary,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: savingName ? 0.7 : 1,
            }}>
            {savingName ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontWeight: '800' }}>Save Profile</Text>}
          </TouchableOpacity>
        </SectionCard>

        <SectionCard
          colors={colors}
          title="Contact"
          subtitle={sectionSubtitle.contact}
          expanded={activeSection === 'contact'}
          onToggle={() => toggleSection('contact')}
          actionLabel="Edit">
          <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>EMAIL</Text>
          <View style={{ marginBottom: 8 }}>
            <StatusChip colors={colors} tone={isEmailVerified ? 'ok' : 'pending'} text={isEmailVerified ? 'Verified' : 'Pending verification'} />
          </View>
          <TextInput
            value={emailInput}
            onChangeText={setEmailInput}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            editable={!savingEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: Spacing.md,
            }}
          />
          {!!emailError && <Text style={[Font.caption, { color: colors.accent, marginTop: -8, marginBottom: 10 }]}>{emailError}</Text>}

          <TouchableOpacity
            onPress={handleUpdateEmail}
            disabled={savingEmail}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceElevated,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: savingEmail ? 0.7 : 1,
              marginBottom: Spacing.lg,
            }}>
            {savingEmail ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Save Email</Text>}
          </TouchableOpacity>

          <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>PHONE (E.164)</Text>
          <View style={{ marginBottom: 8 }}>
            <StatusChip
              colors={colors}
              tone={phone ? (isPhoneVerified ? 'ok' : 'pending') : 'neutral'}
              text={phone ? (isPhoneVerified ? 'Verified' : 'Pending verification') : 'Not set'}
            />
          </View>
          <TextInput
            value={phoneInput}
            onChangeText={setPhoneInput}
            onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
            editable={!savingPhone}
            placeholder="+919876543210"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: Spacing.md,
            }}
          />
          {!!phoneError && <Text style={[Font.caption, { color: colors.accent, marginTop: -8, marginBottom: 10 }]}>{phoneError}</Text>}

          <TouchableOpacity
            onPress={handleUpdatePhone}
            disabled={savingPhone}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceElevated,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: savingPhone ? 0.7 : 1,
            }}>
            {savingPhone ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Save Phone</Text>}
          </TouchableOpacity>
        </SectionCard>

        <SectionCard
          colors={colors}
          title="Password"
          subtitle={sectionSubtitle.password}
          expanded={activeSection === 'password'}
          onToggle={() => toggleSection('password')}
          actionLabel="Change">
          <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>NEW PASSWORD</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
            editable={!savingPassword}
            secureTextEntry
            placeholder="At least 8 chars with mixed symbols"
            placeholderTextColor={colors.textMuted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: Spacing.sm,
            }}
          />
          {!!passwordError && <Text style={[Font.caption, { color: colors.accent, marginTop: -4, marginBottom: 10 }]}>{passwordError}</Text>}

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
            editable={!savingPassword}
            secureTextEntry
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceSoft || colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 12,
              paddingVertical: 11,
              marginBottom: Spacing.md,
            }}
          />
          {!!confirmPasswordError && <Text style={[Font.caption, { color: colors.accent, marginTop: -8, marginBottom: 10 }]}>{confirmPasswordError}</Text>}
          <Text style={[Font.caption, { color: colors.textMuted, marginBottom: 10 }]}>For security, some providers may ask for recent re-authentication before this change is applied.</Text>

          <TouchableOpacity
            onPress={handleUpdatePassword}
            disabled={savingPassword}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.md,
              backgroundColor: colors.surfaceElevated,
              paddingVertical: 12,
              alignItems: 'center',
              opacity: savingPassword ? 0.7 : 1,
            }}>
            {savingPassword ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Change Password</Text>}
          </TouchableOpacity>
        </SectionCard>

        <SectionCard
          colors={colors}
          title="Appearance"
          subtitle={sectionSubtitle.appearance}
          expanded={activeSection === 'appearance'}
          onToggle={() => toggleSection('appearance')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[Font.body, { color: colors.textPrimary }]}>Theme mode</Text>
            <TouchableOpacity
              onPress={toggle}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: Radius.pill,
                backgroundColor: colors.surfaceElevated,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>
                {isDark ? 'Dark' : 'Light'}
              </Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        <TouchableOpacity
          onPress={handleSignOut}
          disabled={signingOut}
          style={{
            borderWidth: 1,
            borderColor: colors.accent,
            borderRadius: Radius.md,
            backgroundColor: colors.accentBg,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: signingOut ? 0.7 : 1,
            marginTop: Spacing.sm,
          }}>
          {signingOut ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.accent, fontWeight: '800' }}>Sign Out</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;
