import React from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';

const ActiveSessionScreen = ({ route, navigation }) => {
  // Friend data passed from AcceptRequestScreen
  const { friend } = route.params || {};

  const handleEndSession = () => {
    Alert.alert('End Session', 'Are you sure you want to end this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: () => {
          // Clear any session state here if needed
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <View style={styles.indicator} />
        <Text style={styles.statusText}>Session Active</Text>
      </View>

      {friend && (
        <View style={styles.friendInfo}>
          <Text style={styles.label}>With</Text>
          <Text style={styles.friendName}>{friend.name}</Text>
          <Text style={styles.friendEmail}>{friend.email}</Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Location sharing is active. You can now see each other&apos;s location.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button title="End Session" onPress={handleEndSession} color="#FF3B30" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: 'bold',
  },
  friendInfo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  friendName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 16,
    color: '#666',
  },
  infoBox: {
    padding: 20,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 60,
    width: '100%',
  },
  infoText: {
    textAlign: 'center',
    color: '#555',
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
  },
});

export default ActiveSessionScreen;
