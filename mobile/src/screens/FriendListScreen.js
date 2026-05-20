import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';

import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const CONTACT_ROW_HEIGHT = 84;
const CONTACT_HEADER_HEIGHT = 42;
const CONTACT_EMPTY_HEIGHT = 106;
const ALPHA_RAIL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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

const alphaForContact = item => {
  const first = (item?.name || '').trim()[0]?.toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
};

const sortContactsByName = items => [...items].sort((a, b) => {
  const nameCompare = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  if (nameCompare !== 0) return nameCompare;
  return String(a.displayPhone || a.phone || '').localeCompare(String(b.displayPhone || b.phone || ''));
});

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
  
  return (
    <Animated.View style={{ height: CONTACT_ROW_HEIGHT, transform: [{ scale }] }}>
      <TouchableWithoutFeedback
        onPressIn={() => anim.pressIn(scale)}
        onPressOut={() => anim.pressOut(scale)}
        onPress={onPress}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 22,
          padding: Spacing.md,
          minHeight: 74,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.textPrimary,
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 16,
          elevation: 4,
        }}>
          <View style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: actionLabel === 'Meet' ? colors.textPrimary : colors.surfaceElevated,
            borderWidth: 1,
            borderColor: actionLabel === 'Meet' ? colors.textPrimary : colors.border,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 14,
          }}>
            <Text style={{ color: actionLabel === 'Meet' ? colors.bg : colors.textPrimary, fontWeight: '900', fontSize: 18 }}>
              {(item.name || '?')[0].toUpperCase()}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 16 }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[Font.caption, { color: colors.textMuted, marginTop: 3 }]}>{actionLabel === 'Meet' ? 'On MeetUp' : item.phone}</Text>
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
  const listRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [busyContact, setBusyContact] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [activeAlpha, setActiveAlpha] = useState('');

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

  const sortedMatched = useMemo(() => sortContactsByName(filteredMatched), [filteredMatched]);
  const sortedUnmatched = useMemo(() => sortContactsByName(filteredUnmatched), [filteredUnmatched]);

  const contactRows = useMemo(() => {
    const buildSection = (section, items, action) => [
      {
        key: `header-${section}`,
        type: 'header',
        height: CONTACT_HEADER_HEIGHT,
        section,
        count: items.length,
      },
      ...(items.length
        ? items.map((contact, index) => ({
            key: contact.key,
            type: 'contact',
            height: CONTACT_ROW_HEIGHT,
            section,
            action,
            contact,
            index,
          }))
        : [{
            key: `empty-${section}`,
            type: 'empty',
            height: CONTACT_EMPTY_HEIGHT,
            section,
          }]),
    ];

    if (contactFilter === 'meetup') {
      return buildSection('On MeetUp', sortedMatched, 'Meet');
    }
    if (contactFilter === 'invite') {
      return buildSection('Invite', sortedUnmatched, 'Invite');
    }
    return [
      ...buildSection('On MeetUp', sortedMatched, 'Meet'),
      ...buildSection('Invite', sortedUnmatched, 'Invite'),
    ];
  }, [contactFilter, sortedMatched, sortedUnmatched]);

  const visibleContactCount = filteredMatched.length + filteredUnmatched.length;
  const stickyHeaderIndices = useMemo(
    () => contactRows
      .map((item, index) => (item.type === 'header' ? index : null))
      .filter(index => index !== null),
    [contactRows]
  );
  const rowOffsets = useMemo(() => {
    const offsets = [];
    let currentOffset = 0;
    contactRows.forEach((item, index) => {
      offsets[index] = currentOffset;
      currentOffset += item.height;
    });
    return offsets;
  }, [contactRows]);
  const alphaIndexMap = useMemo(() => {
    const indexes = new Map();
    contactRows.forEach((item, index) => {
      if (item.type !== 'contact') return;
      const alpha = alphaForContact(item.contact);
      if (!indexes.has(alpha)) {
        indexes.set(alpha, index);
      }
    });
    return indexes;
  }, [contactRows]);
  const alphaLetters = useMemo(() => {
    if (!visibleContactCount) return [];
    return alphaIndexMap.has('#') ? [...ALPHA_RAIL, '#'] : ALPHA_RAIL;
  }, [alphaIndexMap, visibleContactCount]);

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

  const jumpToAlpha = letter => {
    const index = alphaIndexMap.get(letter);
    if (index === undefined) return;
    setActiveAlpha(letter);
    Haptics.selectionAsync().catch(() => {});
    listRef.current?.scrollToIndex({
      index,
      animated: false,
      viewPosition: 0,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: Spacing.lg }}>
      <Text style={[Font.title, { color: colors.textPrimary }]}>Find Friends</Text>
      <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>Find people already on MeetUp, or invite someone new.</Text>

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
        {!!query && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
              marginLeft: 8,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '900', fontSize: 18 }}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {!loading && (
        <View style={{ marginBottom: Spacing.md }}>
          <View style={{
            flexDirection: 'row',
            gap: Spacing.sm,
            marginBottom: Spacing.sm,
          }}>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>ON MEETUP</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 }}>{matched.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }}>INVITABLE</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 }}>{unmatched.length}</Text>
            </View>
          </View>

          <View style={{
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 20,
            padding: 4,
          }}>
            {[
              { id: 'all', label: 'All', count: visibleContactCount },
              { id: 'meetup', label: 'On MeetUp', count: filteredMatched.length },
              { id: 'invite', label: 'Invite', count: filteredUnmatched.length },
            ].map((filter) => {
              const active = contactFilter === filter.id;
              return (
                <TouchableOpacity
                  key={filter.id}
                  onPress={() => setContactFilter(filter.id)}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.textPrimary : colors.surface,
                    paddingHorizontal: 6,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: active ? colors.bg : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: '900',
                    }}
                  >
                    {filter.label} {filter.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.textMuted} />
          <Text style={[Font.caption, { color: colors.textMuted, marginTop: 8 }]}>Loading contacts</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={contactRows}
            keyExtractor={item => item.key}
            stickyHeaderIndices={stickyHeaderIndices}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.xl, paddingRight: alphaLetters.length ? 24 : 0 }}
            getItemLayout={(_, index) => ({
              length: contactRows[index]?.height || CONTACT_ROW_HEIGHT,
              offset: rowOffsets[index] || 0,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: rowOffsets[info.index] || 0,
                animated: false,
              });
            }}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={{
                    height: CONTACT_HEADER_HEIGHT,
                    backgroundColor: colors.bg,
                    paddingTop: Spacing.sm,
                    paddingBottom: Spacing.xs,
                  }}>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <Text style={[Font.subtitle, { color: colors.textPrimary }]}>{item.section}</Text>
                      <Text style={[Font.caption, { color: colors.textMuted, fontWeight: '900' }]}>
                        {item.count}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (item.type === 'empty') {
                return (
                  <View style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  borderRadius: 18,
                  padding: 16,
                  height: CONTACT_EMPTY_HEIGHT,
                  justifyContent: 'center',
                }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15 }}>
                      {query.trim() ? 'No matches here' : `No ${item.section.toLowerCase()} contacts yet`}
                    </Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 4 }]}>
                      {query.trim() ? 'Try a different name or phone number.' : 'Pull in more contacts or switch filters.'}
                    </Text>
                  </View>
                );
              }

              return (
                <ContactRow
                  index={item.index}
                  item={item.contact}
                  colors={colors}
                  actionLabel={busyContact === item.contact.key ? '...' : item.action}
                  onPress={() => {
                    if (busyContact) return;
                    if (item.section === 'On MeetUp') {
                      handleMatchedMeet(item.contact);
                    } else {
                      handleUnmatchedInvite(item.contact);
                    }
                  }}
                />
              );
            }}
          />

          {!!alphaLetters.length && (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                right: -6,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
              }}
            >
              <View style={{
                backgroundColor: colors.surfaceGlass || colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: Radius.pill,
                paddingVertical: 7,
                paddingHorizontal: 2,
                shadowColor: colors.textPrimary,
                shadowOpacity: 0.04,
                shadowOffset: { width: 0, height: 6 },
                shadowRadius: 12,
                elevation: 2,
              }}>
                {alphaLetters.map(letter => {
                  const active = activeAlpha === letter;
                  const available = alphaIndexMap.has(letter);
                  return (
                    <TouchableOpacity
                      key={letter}
                      onPress={() => jumpToAlpha(letter)}
                      disabled={!available}
                      style={{
                        width: 18,
                        minHeight: 14,
                        borderRadius: 9,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active && available ? colors.textPrimary : 'transparent',
                        opacity: available ? 1 : 0.22,
                      }}
                    >
                      <Text style={{
                        color: active ? colors.bg : colors.textSecondary,
                        fontSize: 8,
                        fontWeight: '900',
                      }}>
                        {letter}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default FriendListScreen;
