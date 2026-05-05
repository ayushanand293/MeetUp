import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Switch,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, Spacing, Radius, Font, anim } from '../theme';
import { useAuth } from '../context/AuthContext';

const SettingsScreen = () => {
  const { colors, isDark, toggle } = useTheme();
  const { user, updateAccountDetails, signOut } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');

  const phone = user?.phone_e164 || 'Not available';

  const initials = useMemo(() => {
    const src = (displayName || phone || '?').trim();
    return src ? src[0].toUpperCase() : '?';
  }, [displayName, phone]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setMessage('Display name is required.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      await updateAccountDetails({
        display_name: displayName.trim(),
      });
      setMessage('Profile updated.');
    } catch (error) {
      setMessage(error?.message || 'Could not update profile right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const saveScale = React.useRef(new Animated.Value(1)).current;
  const signoutScale = React.useRef(new Animated.Value(1)).current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <Text style={[Font.title, { color: colors.textPrimary }]}>Settings</Text>
        <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>Your account uses phone OTP.</Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.lg,
            backgroundColor: colors.surface,
            padding: Spacing.lg,
            marginTop: Spacing.lg,
            shadowColor: colors.textPrimary,
            shadowOpacity: 0.05,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 8,
            elevation: 2,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '900' }}>
                {isDark ? '◐' : '☼'}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[Font.subtitle, { color: colors.textPrimary }]}>Appearance</Text>
              <Text style={[Font.caption, { color: colors.textMuted, marginTop: 3 }]}>
                {isDark ? 'Dark mode' : 'Light mode'}
              </Text>
            </View>

            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: colors.borderLight, true: colors.accentGlass }}
              thumbColor={isDark ? colors.textPrimary : colors.surface}
              ios_backgroundColor={colors.borderLight}
            />
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.lg,
            backgroundColor: colors.surface,
            padding: Spacing.lg,
            marginTop: Spacing.lg,
            shadowColor: colors.textPrimary,
            shadowOpacity: 0.05,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 8,
            elevation: 2,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg }}>
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
              <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{phone}</Text>
            </View>
          </View>

          <Text style={[Font.label, { color: colors.textMuted }]}>DISPLAY NAME</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            editable={!saving}
            placeholder="Your display name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            maxLength={40}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: Radius.pill,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginTop: 6,
              marginBottom: 12,
            }}
          />

          {!!message && (
            <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 12 }}>{message}</Text>
          )}

          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <TouchableWithoutFeedback
              onPressIn={() => anim.pressIn(saveScale)}
              onPressOut={() => anim.pressOut(saveScale)}
              onPress={handleSave}
              disabled={saving}
            >
              <View style={{
                marginTop: Spacing.lg,
                backgroundColor: colors.textPrimary,
                borderRadius: Radius.pill,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: saving ? 0.7 : 1,
                shadowColor: colors.textPrimary,
                shadowOpacity: 0.1,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 8,
                elevation: 3,
              }}>
                {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 14 }}>Save</Text>}
              </View>
            </TouchableWithoutFeedback>
          </Animated.View>

          <Animated.View style={{ transform: [{ scale: signoutScale }] }}>
            <TouchableWithoutFeedback
              onPressIn={() => anim.pressIn(signoutScale)}
              onPressOut={() => anim.pressOut(signoutScale)}
              onPress={handleSignOut}
              disabled={signingOut}
            >
              <View style={{
                marginTop: Spacing.sm,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: Radius.pill,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: signingOut ? 0.7 : 1,
              }}>
                {signingOut ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Sign out</Text>}
              </View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;
