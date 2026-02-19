import React from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const HomeScreen = ({ navigation }) => {
    const { user, signOut } = useAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (error) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.welcomeText}>
                Welcome, {user?.email || 'User'}!
            </Text>

            <View style={styles.navigationButtons}>
                <View style={styles.buttonWrapper}>
                    <Button
                        title="View Friends"
                        onPress={() => navigation.navigate('FriendList')}
                        color="#007AFF"
                    />
                </View>
                <View style={styles.buttonWrapper}>
                    <Button
                        title="Incoming Requests"
                        onPress={() => navigation.navigate('AcceptRequest')}
                        color="#34C759"
                    />
                </View>
            </View>

            <View style={styles.signOutButton}>
                <Button
                    title="Sign Out"
                    onPress={handleSignOut}
                    color="#FF3B30"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#333',
    },
    welcomeText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 40,
    },
    navigationButtons: {
        width: '100%',
        marginBottom: 40,
    },
    buttonWrapper: {
        marginBottom: 12,
    },
    signOutButton: {
        width: '100%',
    },
});

export default HomeScreen;
