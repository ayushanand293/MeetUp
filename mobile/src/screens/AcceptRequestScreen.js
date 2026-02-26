import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import client from '../api/client';

const DUMMY_REQUESTS = [
  {
    id: 'req_123',
    from_user: { name: 'Bob Smith', email: 'bob@example.com' },
    created_at: '2023-10-27T10:00:00Z',
  },
  {
    id: 'req_456',
    from_user: { name: 'Alice Johnson', email: 'alice@example.com' },
    created_at: '2023-10-27T11:30:00Z',
  },
];

const AcceptRequestScreen = ({ navigation }) => {
  const [requests, setRequests] = useState(DUMMY_REQUESTS);
  const [loadingId, setLoadingId] = useState(null);

  const handleAccept = async request => {
    setLoadingId(request.id);
    try {
      // Placeholder API call
      await client.post(`/requests/${request.id}/accept`);

      Alert.alert('Success', 'Request accepted!', [
        {
          text: 'OK',
          onPress: () =>
            navigation.navigate('ActiveSession', {
              friend: request.from_user,
            }),
        },
      ]);
    } catch (error) {
      console.error('Accept Error:', error);
      // Fallback for Demo/Testing: Simulate success if backend fails
      Alert.alert(
        'Demo Mode',
        'Backend unreachable or rejected acceptance. Simulating active session for testing.',
        [
          {
            text: 'OK',
            onPress: () =>
              navigation.navigate('ActiveSession', {
                friend: request.from_user,
              }),
          },
        ]
      );
    } finally {
      setLoadingId(null);
    }
  };

  const handleDecline = requestId => {
    // Just remove from local list for now
    setRequests(prev => prev.filter(req => req.id !== requestId));
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{item.from_user.name}</Text>
        <Text style={styles.email}>{item.from_user.email}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => handleAccept(item)}
          disabled={loadingId === item.id}
        >
          {loadingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Accept</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => handleDecline(item.id)}
          disabled={loadingId === item.id}
        >
          <Text style={styles.buttonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No incoming requests.</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
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
  infoContainer: {
    flex: 1,
    marginRight: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    flexDirection: 'row',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 8,
  },
  acceptButton: {
    backgroundColor: '#34C759',
    minWidth: 70,
    alignItems: 'center',
  },
  declineButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default AcceptRequestScreen;
