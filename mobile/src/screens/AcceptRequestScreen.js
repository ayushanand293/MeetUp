import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import client from '../api/client';

const AcceptRequestScreen = ({ navigation }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [acceptingId, setAcceptingId] = useState(null);
    const pollIntervalRef = useRef(null);

    const fetchRequests = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await client.get('/requests/pending');
            setRequests(response.data || []);
        } catch (error) {
            if (!silent) {
                Alert.alert('Error', 'Could not load requests. Make sure you are signed in and the backend is running.');
            }
            console.error('Fetch requests error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial load + poll every 5 seconds
    useEffect(() => {
        fetchRequests();
        pollIntervalRef.current = setInterval(() => {
            fetchRequests(true); // silent refresh
        }, 5000);
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [fetchRequests]);

    const handleAccept = async (request) => {
        setAcceptingId(request.id);
        try {
            const response = await client.post(`/requests/${request.id}/accept`);
            const { session_id, peer_name, peer_id } = response.data;

            // Stop polling — we're entering the session
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

            navigation.navigate('ActiveSession', {
                sessionId: session_id,
                friend: {
                    id: peer_id,
                    name: peer_name,
                },
            });
        } catch (error) {
            console.error('Accept error:', error);
            Alert.alert('Error', error.response?.data?.detail || 'Failed to accept request. Try again.');
        } finally {
            setAcceptingId(null);
        }
    };

    const handleDecline = (requestId) => {
        // Optimistically remove from list (no backend endpoint for decline yet)
        setRequests(prev => prev.filter(r => r.id !== requestId));
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.infoContainer}>
                <Text style={styles.name}>{item.requester_name}</Text>
                <Text style={styles.email}>{item.requester_email}</Text>
                <Text style={styles.time}>Wants to meet up with you</Text>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.button, styles.acceptButton]}
                    onPress={() => handleAccept(item)}
                    disabled={acceptingId === item.id}
                >
                    {acceptingId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Accept</Text>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.declineButton]}
                    onPress={() => handleDecline(item.id)}
                    disabled={acceptingId === item.id}
                >
                    <Text style={styles.buttonText}>Decline</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Looking for requests...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {requests.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyTitle}>No Incoming Requests</Text>
                    <Text style={styles.emptySubtext}>
                        When someone sends you a meet request, it will appear here automatically.
                    </Text>
                    <TouchableOpacity style={styles.refreshButton} onPress={() => fetchRequests()}>
                        <Text style={styles.refreshButtonText}>Refresh</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); fetchRequests(); }}
                        />
                    }
                    ListHeaderComponent={
                        <Text style={styles.listHeader}>
                            Auto-refreshing every 5s • {requests.length} request{requests.length !== 1 ? 's' : ''}
                        </Text>
                    }
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, color: '#666', fontSize: 15 },
    listContainer: { padding: 16 },
    listHeader: { fontSize: 12, color: '#999', marginBottom: 12, textAlign: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
    emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    refreshButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#007AFF',
        borderRadius: 8,
    },
    refreshButtonText: { color: '#fff', fontWeight: '600' },
    card: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    infoContainer: { flex: 1, marginRight: 10 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
    email: { fontSize: 13, color: '#666', marginBottom: 2 },
    time: { fontSize: 12, color: '#007AFF', fontStyle: 'italic' },
    actions: { flexDirection: 'row' },
    button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginLeft: 8,
        minWidth: 70,
        alignItems: 'center',
    },
    acceptButton: { backgroundColor: '#34C759' },
    declineButton: { backgroundColor: '#FF3B30' },
    buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

export default AcceptRequestScreen;
