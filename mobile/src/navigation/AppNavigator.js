import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import FriendListScreen from '../screens/FriendListScreen';
import RequestScreen from '../screens/RequestScreen';
import AcceptRequestScreen from '../screens/AcceptRequestScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';

const Stack = createNativeStackNavigator();

// Auth Stack - Shown when user is not logged in
const AuthStack = () => {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </Stack.Navigator>
    );
};

// Main Stack - Shown when user is logged in
const MainStack = () => {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {
                    backgroundColor: '#007AFF',
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
            }}
        >
            <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ title: 'MeetUp' }}
            />
            <Stack.Screen
                name="FriendList"
                component={FriendListScreen}
                options={{ title: 'Friend List' }}
            />
            <Stack.Screen
                name="Request"
                component={RequestScreen}
                options={{ title: 'Send Request' }}
            />
            <Stack.Screen
                name="AcceptRequest"
                component={AcceptRequestScreen}
                options={{ title: 'Accept Requests' }}
            />
            <Stack.Screen
                name="ActiveSession"
                component={ActiveSessionScreen}
                options={{ title: 'Active Session' }}
            />
        </Stack.Navigator>
    );
};

// Loading Screen - Shown while checking auth state
const LoadingScreen = () => {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
        </View>
    );
};

// Main App Navigator
const AppNavigator = () => {
    const { session, loading } = useAuth();

    // Show loading screen while checking auth state
    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <NavigationContainer>
            {session ? <MainStack /> : <AuthStack />}
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});

export default AppNavigator;
