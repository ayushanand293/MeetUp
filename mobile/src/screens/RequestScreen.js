import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import client from '../api/client';

const RequestScreen = ({ route, navigation }) => {
    // Get the friend object passed from FriendListScreen
    const { friend } = route.params || {};
    const [loading, setLoading] = useState(false);

    const handleSendRequest = async () => {
        if (!friend) return;

        setLoading(true);
        try {
            // Placeholder API call
            // In a real app, this would use the friend's ID
            await client.post('/requests', {
                to_user_id: friend.id,
            });

            Alert.alert('Success', `Meet request sent to ${friend.name}!`, [
                { text: 'OK', onPress: () => navigation.navigate('Home') }
            ]);
        } catch (error) {
            console.error('Request Error:', error);
            // Fallback for Demo/Testing: Simulate success if backend fails
            Alert.alert(
                'Demo Mode',
                'Backend unreachable or rejected request. Simulating success for testing.',
                [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
            );
        } finally {
            setLoading(false);
        }
    };

    if (!friend) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>No friend selected.</Text>
                <Button title="Go Back" onPress={() => navigation.goBack()} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Send Meet Request</Text>

            <View style={styles.friendCard}>
                <Text style={styles.label}>To:</Text>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendEmail}>{friend.email}</Text>
            </View>

            <View style={styles.actionContainer}>
                {loading ? (
                    <ActivityIndicator size="large" color="#007AFF" />
                ) : (
                    <Button
                        title="Send Meet Request"
                        onPress={handleSendRequest}
                        disabled={loading}
                    />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
        textAlign: 'center',
        color: '#333',
    },
    friendCard: {
        backgroundColor: '#f5f5f5',
        padding: 20,
        borderRadius: 12,
        marginBottom: 30,
        alignItems: 'center',
    },
    label: {
        fontSize: 16,
        color: '#666',
        marginBottom: 8,
    },
    friendName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 4,
    },
    friendEmail: {
        fontSize: 16,
        color: '#666',
    },
    errorText: {
        fontSize: 18,
        color: 'red',
        marginBottom: 20,
        textAlign: 'center',
    },
    actionContainer: {
        marginTop: 10,
    }
});

export default RequestScreen;
