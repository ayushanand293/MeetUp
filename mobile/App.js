import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import AnimatedLaunchScreen from './src/components/AnimatedLaunchScreen';
import * as Linking from 'expo-linking';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [launchDone, setLaunchDone] = useState(false);

  useEffect(() => {
    const prepare = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 60));
      } finally {
        setAppReady(true);
      }
    };

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (!appReady) return;
    await SplashScreen.hideAsync();
  }, [appReady]);

  const redirectUrl = Linking.createURL('/');
  console.log(
    'App starting... Supabase URL:',
    process.env.EXPO_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing'
  );
  console.log('--- ACTION REQUIRED ---');
  console.log('Add this URL to your Supabase Redirect URLs:', redirectUrl);
  console.log('-----------------------');
  if (!appReady) return null;

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <View style={styles.root} onLayout={onLayoutRootView}>
            <StatusBar style="dark" />
            <AppNavigator />
            {!launchDone && <AnimatedLaunchScreen onComplete={() => setLaunchDone(true)} />}
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
