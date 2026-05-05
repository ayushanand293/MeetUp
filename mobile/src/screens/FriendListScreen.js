import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Share,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';

import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const normalizePhoneE164 = input => {
  if (!input) return '';
  let value = input.trim();
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('+')) {
    value = `+${value.slice(1).replace(/\D/g, '')}`;
  } else {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) {
      value = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      value = `+${digits}`;
    } else {
      return '';
    }
  }
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return '';
  return value;
};

const displayPhoneNumber = input => (input || '').trim();

const contactKeyFor = (contactId, phone, fallbackIndex) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return `${contactId || 'contact'}:${digits || fallbackIndex}`;
};

const digestPhone = async (version, phone) => {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `v${version}:${phone}`
  );
};

const ContactRow = ({ item, colors, actionLabel, onPress, index = 0 }) => {
  const scale = React.useRef(new Animated.Value(1)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(15)).current;
  
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: Math.min(index, 20) * 40, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay: Math.min(index, 20) * 40, useNativeDriver: true }),
    ]).start();
  }, []);
  
  return (
    <Animated.View style={{ opacity, transform: [{ scale }, { translateY }] }}>
      <TouchableWithoutFeedback
        onPressIn={() => anim.pressIn(scale)}
        onPressOut={() => anim.pressOut(scale)}
        onPress={onPress}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          padding: Spacing.md,
          marginBottom: Spacing.sm,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.textPrimary,
          shadowOpacity: 0.05,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
          elevation: 2,
        }}>
          <View style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 14,
          }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 18 }}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 16 }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.phone}</Text>
          </View>

          <View style={{
            backgroundColor: actionLabel === '...' ? colors.surfaceElevated : colors.textPrimary,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: Radius.pill,
            borderWidth: 1,
            borderColor: actionLabel === '...' ? colors.border : colors.textPrimary,
          }}>
            <Text style={{ 
              color: actionLabel === '...' ? colors.textMuted : colors.bg, 
              fontWeight: '800', 
              fontSize: 13 
            }}>
              {actionLabel}
            </Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
};

const FriendListScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [busyContact, setBusyContact] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const permission = await Contacts.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Contacts permission required', 'Allow contacts access to find friends already using MeetUp.');
          setMatched([]);
          setUnmatched([]);
          return;
        }

        const hashConfig = await client.get('/contacts/hash_config');
        const version = hashConfig?.data?.version || 1;

        const contactsResult = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });

        const contacts = [];
        let fallbackIndex = 0;
        for (const c of contactsResult.data || []) {
          const displayName = c.name || 'Unknown';
          const numbers = c.phoneNumbers || [];
          for (const n of numbers) {
            const rawPhone = displayPhoneNumber(n?.number || '');
            if (!rawPhone) continue;

            const e164 = normalizePhoneE164(rawPhone);
            contacts.push({
              key: contactKeyFor(c.id, rawPhone, fallbackIndex++),
              name: displayName,
              phone: e164 || rawPhone,
              displayPhone: rawPhone,
              e164,
            });
          }
        }

        const dedupedMap = new Map();
        contacts.forEach(item => {
          const dedupeKey = item.e164 || `${item.name}:${String(item.displayPhone).replace(/\D/g, '')}`;
          if (!dedupedMap.has(dedupeKey)) {
            dedupedMap.set(dedupeKey, item);
          }
        });
        const deduped = Array.from(dedupedMap.values())
          .filter(item => !item.e164 || item.e164 !== user?.phone_e164)
          .slice(0, 500);

        const digests = [];
        const contactDigestByKey = new Map();
        const matchableContacts = deduped.filter(item => item.e164);
        for (const item of matchableContacts) {
          const digest = await digestPhone(version, item.e164);
          digests.push(digest);
          contactDigestByKey.set(item.key, digest);
        }

        const matchResponse = await client.post('/contacts/match', {
          version,
          digests,
        });

        const byDigest = new Map();
        (matchResponse?.data || [])
          .filter(u => String(u.user_id || '') !== String(user?.id || ''))
          .forEach(u => {
            if (u.matched_digest) {
              byDigest.set(String(u.matched_digest).toLowerCase(), u);
            }
          });

        const matchedContacts = [];
        const unmatchedContacts = [];

        for (const item of deduped) {
          const match = byDigest.get(String(contactDigestByKey.get(item.key) || '').toLowerCase());
          if (match) {
            matchedContacts.push({
              ...item,
              phone: item.e164,
              userId: match.user_id,
              appName: match.display_name,
            });
          } else {
            unmatchedContacts.push(item);
          }
        }

        setMatched(matchedContacts);
        setUnmatched(unmatchedContacts);
      } catch (error) {
        Alert.alert('Could not load contacts', error?.response?.data?.detail || 'Please try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id, user?.phone_e164]);

  const filteredMatched = useMemo(() => {
    if (!query.trim()) return matched;
    const q = query.toLowerCase();
    return matched.filter(item => item.name.toLowerCase().includes(q) || item.phone.includes(q) || item.displayPhone.includes(q));
  }, [matched, query]);

  const filteredUnmatched = useMemo(() => {
    if (!query.trim()) return unmatched;
    const q = query.toLowerCase();
    return unmatched.filter(item => item.name.toLowerCase().includes(q) || item.phone.includes(q) || item.displayPhone.includes(q));
  }, [unmatched, query]);

  const handleMatchedMeet = item => {
    navigation.navigate('Request', {
      friend: {
        id: item.userId,
        display_name: item.appName || item.name,
      },
    });
  };

  const handleUnmatchedInvite = async item => {
    try {
      setBusyContact(item.key);
      const response = await client.post('/invites', {
        recipient: item.e164 || item.displayPhone || item.phone,
      });

      const inviteUrl = response?.data?.url || `${Linking.createURL('invite')}?token=${encodeURIComponent(response?.data?.token || '')}`;
      const shareText = `Join me on MeetUp to share live location for our meetup: ${inviteUrl}`;
      await Share.share({
        message: shareText,
        title: 'MeetUp invite',
      });
    } catch (error) {
      Alert.alert('Could not create invite', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyContact('');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: Spacing.lg }}>
      <Text style={[Font.title, { color: colors.textPrimary }]}>Find Friends</Text>
      <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>Contacts are matched using local SHA256 digests. Raw phone numbers are not uploaded.</Text>

      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Radius.pill,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 16,
      }}>
        <Text style={{ color: colors.textMuted, fontWeight: '900', fontSize: 16, marginRight: 8 }}>⌕</Text>
        <TextInput
          style={{
            flex: 1,
            color: colors.textPrimary,
            paddingVertical: 14,
            fontSize: 15,
          }}
          placeholder="Search contacts"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.textMuted} />
          <Text style={[Font.caption, { color: colors.textMuted, marginTop: 8 }]}>Loading contacts</Text>
        </View>
      ) : (
        <FlatList
          data={[
            { section: 'On MeetUp', items: filteredMatched, action: 'Meet' },
            { section: 'Invite', items: filteredUnmatched, action: 'Invite' },
          ]}
          keyExtractor={item => item.section}
          renderItem={({ item }) => (
            <View style={{ marginBottom: Spacing.lg }}>
              <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: Spacing.sm }]}>{item.section}</Text>
              {item.items.length === 0 ? (
                <Text style={[Font.caption, { color: colors.textMuted }]}>No contacts</Text>
              ) : (
                item.items.map((contact, index) => (
                  <View key={contact.key}>
                    <ContactRow
                      index={index}
                      item={contact}
                      colors={colors}
                      actionLabel={busyContact === contact.key ? '...' : item.action}
                      onPress={() => {
                        if (busyContact) return;
                        if (item.section === 'On MeetUp') {
                          handleMatchedMeet(contact);
                        } else {
                          handleUnmatchedInvite(contact);
                        }
                      }}
                    />
                  </View>
                ))
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

export default FriendListScreen;
