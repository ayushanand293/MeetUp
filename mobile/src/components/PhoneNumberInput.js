import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import COUNTRY_CALLING_CODES from '../constants/countryCallingCodes';
import { useTheme, Spacing, Radius, Font } from '../theme';

export const DEFAULT_COUNTRY_CODE = COUNTRY_CALLING_CODES[0];

export const buildE164Phone = (countryCode, localNumber) => {
  const value = String(localNumber || '').trim();
  if (!value) return '';
  if (value.startsWith('+')) {
    return `+${value.slice(1).replace(/\D/g, '')}`;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode.dialCode}${digits}`;
};

export const splitE164Phone = phone => {
  const value = String(phone || '').trim();
  if (!value.startsWith('+')) {
    return { countryCode: DEFAULT_COUNTRY_CODE, localNumber: value };
  }

  const matches = COUNTRY_CALLING_CODES
    .filter(country => value.startsWith(country.dialCode))
    .sort((a, b) => b.dialCode.length - a.dialCode.length);
  const countryCode = matches[0] || DEFAULT_COUNTRY_CODE;
  return {
    countryCode,
    localNumber: value.slice(countryCode.dialCode.length),
  };
};

const PhoneNumberInput = ({
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  editable = true,
  label = 'PHONE NUMBER',
  placeholder = 'Phone number',
  useNativeKeyboard = true,
  isInputActive = false,
  onInputPress,
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedKey = `${countryCode.iso2}-${countryCode.dialCode}`;

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CALLING_CODES;
    return COUNTRY_CALLING_CODES.filter(country => (
      country.name.toLowerCase().includes(q)
      || country.iso2.toLowerCase().includes(q)
      || country.dialCode.includes(q)
    ));
  }, [query]);

  const handleLocalNumberChange = text => {
    onLocalNumberChange(String(text || '').replace(/\D/g, ''));
  };

  return (
    <View>
      <Text style={[Font.label, { color: colors.textMuted, marginTop: Spacing.lg }]}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.codeButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              opacity: editable ? 1 : 0.65,
            },
          ]}
          onPress={() => {
            if (!editable) return;
            Haptics.selectionAsync().catch(() => {});
            setOpen(true);
          }}
          disabled={!editable}>
          <Text style={[styles.codeText, { color: colors.textPrimary }]}>
            {countryCode.iso2}{' '}
            <Text style={[styles.dialCode, { color: colors.textMuted }]}>{countryCode.dialCode}</Text>
            <Text style={[styles.chevron, { color: colors.textMuted }]}> ▾</Text>
          </Text>
        </TouchableOpacity>

        {useNativeKeyboard ? (
          <TextInput
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={localNumber}
            onChangeText={handleLocalNumberChange}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="telephoneNumber"
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={15}
            editable={editable}
          />
        ) : (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => {
              if (!editable) return;
              Haptics.selectionAsync().catch(() => {});
              onInputPress?.();
            }}
            style={[
              styles.input,
              styles.fakeInput,
              {
                borderColor: isInputActive ? colors.textPrimary : colors.border,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
            disabled={!editable}
          >
            <Text
              style={[
                styles.fakeInputText,
                { color: localNumber ? colors.textPrimary : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {localNumber || placeholder}
            </Text>
            {isInputActive && <View style={[styles.fakeCaret, { backgroundColor: colors.textPrimary }]} />}
          </TouchableOpacity>
        )}
      </View>
      {localNumber ? (
        <Text style={[Font.caption, { color: colors.textMuted, marginTop: 8 }]}>
          {`${countryCode.dialCode} ${localNumber}`}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={[styles.modalRoot, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.grabberWrap}>
              <View style={[styles.grabber, { backgroundColor: colors.borderLight }]} />
            </View>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[Font.title, { color: colors.textPrimary, fontSize: 24 }]}>Country code</Text>
                <Text style={[Font.caption, { color: colors.textMuted, marginTop: 3 }]}>Search by country, ISO code, or dial code.</Text>
              </View>
              <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setOpen(false);
              }}
              style={[styles.closeButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
                <Text style={[styles.closeText, { color: colors.textPrimary }]}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.searchIcon, { color: colors.textMuted }]}>⌕</Text>
              <TextInput
                style={[styles.search, { color: colors.textPrimary }]}
                placeholder="Search country or code"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="search"
              />
            </View>

            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filteredCountries}
              keyExtractor={(item, index) => `${item.iso2}-${item.dialCode}-${index}`}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = `${item.iso2}-${item.dialCode}` === selectedKey;
                return (
                  <TouchableOpacity
                    style={[
                      styles.countryRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: isSelected ? colors.surfaceElevated : colors.bg,
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      onCountryCodeChange(item);
                      setQuery('');
                      setOpen(false);
                    }}>
                    <View style={[styles.isoBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                      <Text style={[styles.isoText, { color: colors.textPrimary }]}>{item.iso2}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.dialCode}</Text>
                    </View>
                    {isSelected && <Text style={[styles.selectedMark, { color: colors.textPrimary }]}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={(
                <View style={styles.emptyState}>
                  <Text style={[Font.subtitle, { color: colors.textPrimary }]}>No matches</Text>
                  <Text style={[Font.caption, { color: colors.textMuted, marginTop: 4 }]}>Try a country name or dial code.</Text>
                </View>
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  codeButton: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  codeText: {
    fontSize: 15,
    fontWeight: '700',
  },
  dialCode: {
    fontSize: 14,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  modalRoot: {
    maxHeight: '86%',
    padding: Spacing.lg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  grabberWrap: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fakeInputText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  fakeCaret: {
    width: 2,
    height: 24,
    borderRadius: 1,
    marginLeft: 4,
  },
  closeText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 22,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    fontSize: 16,
    fontWeight: '900',
    marginRight: 8,
  },
  search: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  isoBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  isoText: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedMark: {
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
});

export default PhoneNumberInput;
