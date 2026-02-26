import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

const DUMMY_FRIENDS = [
  // NOTE: For backend integration, these IDs need to be valid UUIDs from your Supabase 'auth.users' table
  // You can copy a real UUID from your Supabase dashboard to test sending requests to a real user
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Alice Johnson (Dummy)',
    email: 'alice@example.com',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Bob Smith (Dummy)',
    email: 'bob@example.com',
  },
];

const FriendListScreen = ({ navigation }) => {
  const handleRequestLocation = friend => {
    navigation.navigate('Request', { friend });
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.infoContainer}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
      <TouchableOpacity style={styles.requestButton} onPress={() => handleRequestLocation(item)}>
        <Text style={styles.buttonText}>Request Location</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={DUMMY_FRIENDS}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />
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
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  requestButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default FriendListScreen;
