import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredCountries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CALLING_CODES;
    return COUNTRY_CALLING_CODES.filter(country => (
      country.name.toLowerCase().includes(q)
      || country.iso2.toLowerCase().includes(q)
      || country.dialCode.includes(q)
    ));
  }, [query]);

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
          onPress={() => editable && setOpen(true)}
          disabled={!editable}>
          <Text style={[styles.codeText, { color: colors.textPrimary }]}>{countryCode.iso2}</Text>
          <Text style={[Font.caption, { color: colors.textMuted }]}>{countryCode.dialCode}</Text>
        </TouchableOpacity>

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
          onChangeText={onLocalNumberChange}
          keyboardType="phone-pad"
          autoCapitalize="none"
          editable={editable}
        />
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalRoot, { backgroundColor: colors.bg }]}>
          <View style={styles.modalHeader}>
            <Text style={[Font.title, { color: colors.textPrimary, fontSize: 24 }]}>Country code</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.search,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            placeholder="Search country or code"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />

          <FlatList
            keyboardShouldPersistTaps="handled"
            data={filteredCountries}
            keyExtractor={(item, index) => `${item.iso2}-${item.dialCode}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryRow, { borderColor: colors.border }]}
                onPress={() => {
                  onCountryCodeChange(item);
                  setOpen(false);
                }}>
                <View style={{ flex: 1 }}>
                  <Text style={[Font.subtitle, { color: colors.textPrimary }]}>{item.name}</Text>
                  <Text style={[Font.caption, { color: colors.textMuted }]}>{item.iso2}</Text>
                </View>
                <Text style={[styles.dialCode, { color: colors.textPrimary }]}>{item.dialCode}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
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
    width: 92,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
  },
  modalRoot: {
    flex: 1,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '800',
  },
  search: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: Spacing.md,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  dialCode: {
    fontSize: 15,
    fontWeight: '800',
  },
});

export default PhoneNumberInput;
