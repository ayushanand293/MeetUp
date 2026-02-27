import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Alert,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import client from '../api/client';

const RequestScreen = ({ route, navigation }) => {
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [waitingDots, setWaitingDots] = useState('');
    const pollRef = useRef(null);
    const dotsRef = useRef(null);

    // Animate waiting dots
    useEffect(() => {
        if (sent) {
            dotsRef.current = setInterval(() => {
                setWaitingDots(prev => prev.length >= 3 ? '' : prev + '.');
            }, 600);
        }
        return () => { if (dotsRef.current) clearInterval(dotsRef.current); };
    }, [sent]);

    // Poll for active session after sending request
    useEffect(() => {
        if (sent) {
            pollRef.current = setInterval(async () => {
                try {
                    const response = await client.get('/sessions/active');
                    if (response.data && response.data.session_id) {
                        // Session found! The request was accepted
                        clearInterval(pollRef.current);
                        if (dotsRef.current) clearInterval(dotsRef.current);

                        navigation.navigate('ActiveSession', {
                            sessionId: response.data.session_id,
                            friend: friend,
                        });
                    }
                } catch (error) {
                    // No active session yet — keep polling
                }
            }, 3000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [sent, friend, navigation]);

    const handleSendRequest = async () => {
        if (!friend) return;
        setLoading(true);
        try {
            await client.post('/requests/', {
                to_user_id: friend.id,
            });
            // Navigate to Home — the Active Request card will track status + countdown
            navigation.navigate('Home');
        } catch (error) {
            console.error('Send request error:', error);
            const msg = error.response?.data?.detail || 'Failed to send request. Please try again.';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    if (!friend) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>No friend selected.</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (sent) {
        return (
            <View style={styles.container}>
                <View style={styles.sentContainer}>
                    <ActivityIndicator size="large" color="#007AFF" style={{ marginBottom: 16 }} />
                    <Text style={styles.sentTitle}>Request Sent!</Text>
                    <Text style={styles.sentSubtext}>
                        Waiting for {friend.display_name || friend.name} to accept{waitingDots}
                    </Text>
                    <Text style={styles.sentHint}>
                        Ask them to open "Incoming Requests" on their phone.
                        {'\n\n'}This screen will automatically take you to the map once they accept!
                    </Text>
                    <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('Home')}>
                        <Text style={styles.homeBtnText}>Go to Home Instead</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Send Meet Request</Text>

            <View style={styles.friendCard}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {(friend.display_name || friend.name || '?')[0].toUpperCase()}
                    </Text>
                </View>
                <Text style={styles.friendName}>{friend.display_name || friend.name}</Text>
                <Text style={styles.friendEmail}>{friend.email}</Text>
            </View>

            <Text style={styles.description}>
                Tapping "Send Request" will send {friend.display_name || friend.name} a meet request.
                Once they accept, you'll both start sharing live locations.
            </Text>

            <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendRequest}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Send Meet Request 📍</Text>
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#333' },
    friendCard: {
        backgroundColor: '#f0f7ff',
        padding: 24,
        borderRadius: 16,
        marginBottom: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#d0e8ff',
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
    friendName: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 4 },
    friendEmail: { fontSize: 14, color: '#666' },
    description: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
    button: {
        backgroundColor: '#007AFF',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
    sentContainer: { alignItems: 'center', padding: 16 },
    sentTitle: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    sentSubtext: { fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 8, minWidth: 200 },
    sentHint: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
    homeBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    homeBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
    errorText: { textAlign: 'center', fontSize: 16, color: 'red', marginBottom: 20 },
    backBtn: { alignItems: 'center', padding: 16 },
    backBtnText: { color: '#007AFF', fontSize: 16 },
});

export default RequestScreen;
