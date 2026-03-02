import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import * as Linking from 'expo-linking';

export default function App() {
  const redirectUrl = Linking.createURL('/');
  console.log('App starting... Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing');
  console.log('--- ACTION REQUIRED ---');
  console.log('Add this URL to your Supabase Redirect URLs:', redirectUrl);
  console.log('-----------------------');
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
