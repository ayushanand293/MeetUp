import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import FriendListScreen from '../screens/FriendListScreen';
import RequestScreen from '../screens/RequestScreen';
import AcceptRequestScreen from '../screens/AcceptRequestScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';

const Stack = createNativeStackNavigator();

<<<<<<< Updated upstream
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
=======
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
  </Stack.Navigator>
);
>>>>>>> Stashed changes

const MainStack = () => {
<<<<<<< Updated upstream
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
=======
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="FriendList" component={FriendListScreen} options={{ title: 'Find a Friend' }} />
      <Stack.Screen name="Request" component={RequestScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AcceptRequest" component={AcceptRequestScreen} options={{ title: 'Requests' }} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
>>>>>>> Stashed changes
};

const LoadingScreen = () => {
<<<<<<< Updated upstream
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
        </View>
    );
=======
  const { colors } = useTheme();
  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color={colors.textSecondary} />
    </View>
  );
>>>>>>> Stashed changes
};

const AppNavigator = () => {
<<<<<<< Updated upstream
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
=======
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <NavigationContainer>{session ? <MainStack /> : <AuthStack />}</NavigationContainer>;
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
>>>>>>> Stashed changes
});

export default AppNavigator;
