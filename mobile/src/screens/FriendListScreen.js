import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import client from '../api/client';

const FriendListScreen = ({ navigation }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const debounceRef = useRef(null);

    const searchUsers = useCallback(async (text) => {
        if (text.trim().length < 2) {
            setResults([]);
            setSearched(false);
            return;
        }
        setSearching(true);
        try {
            const response = await client.get(`/users/search?name=${encodeURIComponent(text.trim())}`);
            setResults(response.data || []);
            setSearched(true);
        } catch (error) {
            console.error('Search error:', error);
            Alert.alert('Error', error.response?.data?.detail || 'Search failed. Make sure you are signed in.');
        } finally {
            setSearching(false);
        }
    }, []);

    const handleTextChange = (text) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchUsers(text);
        }, 500);
    };

    const handleSelectFriend = (friend) => {
        navigation.navigate('Request', { friend });
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => handleSelectFriend(item)}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.display_name?.[0]?.toUpperCase() || '?'}</Text>
            </View>
            <View style={styles.infoContainer}>
                <Text style={styles.name}>{item.display_name}</Text>
                <Text style={styles.email}>{item.email}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name..."
                    value={query}
                    onChangeText={handleTextChange}
                    autoCapitalize="words"
                    clearButtonMode="while-editing"
                    returnKeyType="search"
                />
                {searching && <ActivityIndicator style={styles.searchSpinner} color="#007AFF" />}
            </View>

            {!searched && query.length < 2 && (
                <View style={styles.hint}>
                    <Text style={styles.hintIcon}>🔍</Text>
                    <Text style={styles.hintTitle}>Find a Friend</Text>
                    <Text style={styles.hintText}>
                        Type at least 2 characters to search for a friend by their display name.
                    </Text>
                </View>
            )}

            {searched && results.length === 0 && !searching && (
                <View style={styles.hint}>
                    <Text style={styles.hintIcon}>😕</Text>
                    <Text style={styles.hintTitle}>No results for "{query}"</Text>
                    <Text style={styles.hintText}>
                        Make sure your friend has signed up and set their display name.
                    </Text>
                </View>
            )}

            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        margin: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        paddingHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    searchInput: {
        flex: 1,
        height: 50,
        fontSize: 16,
        color: '#333',
    },
    searchSpinner: { marginLeft: 8 },
    hint: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, marginTop: -60 },
    hintIcon: { fontSize: 40, marginBottom: 12 },
    hintTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
    hintText: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
    list: { paddingHorizontal: 16 },
    card: {
        backgroundColor: '#fff',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    infoContainer: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: '#333' },
    email: { fontSize: 13, color: '#999', marginTop: 2 },
    arrow: { fontSize: 22, color: '#ccc' },
});

export default FriendListScreen;
