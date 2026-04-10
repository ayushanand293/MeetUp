import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, TextInput, FlatList, TouchableOpacity,
    ActivityIndicator, Animated,
} from 'react-native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font, anim } from '../theme';

const FriendListScreen = ({ navigation }) => {
    const { colors } = useTheme();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [focusBorder, setFocusBorder] = useState(false);
    const debounceRef = useRef(null);
    const lastQueryRef = useRef('');

    const searchUsers = useCallback(async (text) => {
        if (text.trim().length < 2) {
            setResults([]);
            setSearched(false);
            setSearchError('');
            return;
        }
        setSearching(true);
        setSearchError('');
        try {
            const res = await client.get(`/users/search?name=${encodeURIComponent(text.trim())}`);
            setResults(res.data || []); setSearched(true);
        } catch (err) {
            setSearchError('Search is unavailable right now. Please try again.');
        }
        finally { setSearching(false); }
    }, []);

    const handleTextChange = (text) => {
        setQuery(text);
        lastQueryRef.current = text;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchUsers(text), 500);
    };

    const renderItem = ({ item, index }) => <UserRow item={item} index={index} colors={colors} onPress={() => navigation.navigate('Request', { friend: item })} />;
    const resultCount = results.length;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: Spacing.lg }}>
            <View style={{ marginBottom: Spacing.md, paddingTop: Spacing.md }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>Connections</Text>
                <Text style={[Font.title, { color: colors.textPrimary }]}>Find a Friend</Text>
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4, fontWeight: '600' }]}>Search by name to send a meet request</Text>
            </View>

            {searched && !searching && (
                <View style={{
                    alignSelf: 'flex-start',
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: Radius.pill,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    marginBottom: Spacing.md,
                }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
                        {resultCount > 0 ? `${resultCount} results` : 'No results'}
                    </Text>
                </View>
            )}

            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.surface,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: focusBorder ? colors.textMuted : colors.border,
                paddingHorizontal: Spacing.md,
                marginBottom: Spacing.lg,
                shadowColor: colors.textPrimary,
                shadowOpacity: 0.09,
                shadowOffset: { width: 0, height: 10 },
                shadowRadius: 14,
                elevation: 4,
            }}>
                <Text style={{ fontSize: 18, color: colors.textPrimary, marginRight: 10 }}>⌕</Text>
                <TextInput style={{ flex: 1, paddingVertical: 13, color: colors.textPrimary, fontSize: 15 }}
                    placeholder="Search by name..." placeholderTextColor={colors.textMuted}
                    value={query} onChangeText={handleTextChange} autoCapitalize="none"
                    onFocus={() => setFocusBorder(true)} onBlur={() => setFocusBorder(false)} />
                {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
                {query.length > 0 && !searching && (
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); setSearchError(''); }}>
                        <Text style={{ color: colors.textMuted, fontSize: 14, padding: 4 }}>✕</Text>
                    </TouchableOpacity>
                )}
            </View>

            {!!searchError && (
                <View style={{
                    borderWidth: 1,
                    borderColor: colors.warning,
                    backgroundColor: colors.warningBg,
                    borderRadius: Radius.sm,
                    marginBottom: Spacing.md,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}>
                    <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700', flex: 1 }}>{searchError}</Text>
                    <TouchableOpacity onPress={() => searchUsers(lastQueryRef.current)}>
                        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {searched && results.length === 0 && !searching && (
                <View style={{ alignItems: 'center', paddingTop: Spacing.xxl, paddingHorizontal: Spacing.md }}>
                    <Text style={{ fontSize: 48, color: colors.textMuted, marginBottom: Spacing.md }}>◎</Text>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, marginBottom: 6 }]}>No users found</Text>
                    <Text style={[Font.body, { color: colors.textSecondary, textAlign: 'center' }]}>Try a different name or remove spaces.</Text>
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); setSearchError(''); }}>
                        <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: 12, fontWeight: '700' }}>Clear Search</Text>
                    </TouchableOpacity>
                </View>
            )}

            <FlatList data={results} keyExtractor={item => item.id} renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: Spacing.xxl }} showsVerticalScrollIndicator={false} />
        </View>
    );
};

const UserRow = ({ item, index, colors, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: 0, duration: 250, delay: index * 45, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 250, delay: index * 45, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ transform: [{ translateY }, { scale }], opacity }}>
            <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border }}
                onPress={onPress} onPressIn={() => anim.pressIn(scale)} onPressOut={() => anim.pressOut(scale)}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 18 }}>{item.display_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 15 }]}>{item.display_name}</Text>
                    <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.email}</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '800' }}>Meet</Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

export default FriendListScreen;
