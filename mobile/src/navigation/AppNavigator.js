import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import FriendListScreen from '../screens/FriendListScreen';
import QuickFriendsScreen from '../screens/QuickFriendsScreen';
import RequestScreen from '../screens/RequestScreen';
import AcceptRequestScreen from '../screens/AcceptRequestScreen';
import RequestsTabsScreen from '../screens/RequestsTabsScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const AuthStack = ({ initialRouteName = 'Login' }) => (
  <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const MainStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '800', fontSize: 17, letterSpacing: -0.3 },
        animation: 'slide_from_right',
        animationDuration: 220,
        gestureEnabled: true,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="QuickFriends" component={QuickFriendsScreen} options={{ title: 'Quick Friends' }} />
      <Stack.Screen name="FriendList" component={FriendListScreen} options={{ title: 'Find a Friend' }} />
      <Stack.Screen name="Request" component={RequestScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AcceptRequest" component={AcceptRequestScreen} options={{ title: 'Requests' }} />
      <Stack.Screen name="RequestsTabs" component={RequestsTabsScreen} options={{ title: 'Requests' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="ActiveSession" component={ActiveSessionScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
};

const LoadingScreen = ({ isAuthReady, onFinished }) => {
  const { colors } = useTheme();

  const cardScale = React.useRef(new Animated.Value(0.94)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;
  const logoFloat = React.useRef(new Animated.Value(0)).current;
  const shimmerX = React.useRef(new Animated.Value(-180)).current;
  const barProgress = React.useRef(new Animated.Value(0.18)).current;
  const dotPulse = React.useRef(new Animated.Value(0)).current;
  const ambient = React.useRef(new Animated.Value(0)).current;
  const completionSent = React.useRef(false);

  React.useEffect(() => {
    const intro = Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        stiffness: 240,
        damping: 18,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {
          toValue: -4,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoFloat, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(shimmerX, {
          toValue: 180,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerX, {
          toValue: -180,
          duration: 1,
          useNativeDriver: true,
        }),
      ])
    );

    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(barProgress, {
          toValue: 0.74,
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(barProgress, {
          toValue: 0.42,
          duration: 880,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );

    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 0,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    intro.start();
    floatLoop.start();
    shimmerLoop.start();
    dotLoop.start();

    if (!isAuthReady) {
      barLoop.start();
    }

    if (isAuthReady) {
      Animated.timing(barProgress, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        if (completionSent.current) return;
        completionSent.current = true;
        onFinished?.();
      });
    }

    return () => {
      floatLoop.stop();
      shimmerLoop.stop();
      barLoop.stop();
      dotLoop.stop();
    };
  }, [barProgress, cardOpacity, cardScale, dotPulse, isAuthReady, logoFloat, onFinished, shimmerX]);

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambient, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ambient, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ambient]);

  const orbUp = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const orbDown = ambient.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const loadWidth = barProgress.interpolate({ inputRange: [0, 1], outputRange: ['18%', '100%'] });
  const dot1 = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const dot2 = dotPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 0.32, 0.85] });
  const dot3 = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.36] });

  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.loadingOrbTop,
          { backgroundColor: colors.surfaceElevated, transform: [{ translateY: orbUp }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.loadingOrbBottom,
          { backgroundColor: colors.border, transform: [{ translateY: orbDown }] },
        ]}
      />

      <Animated.View
        style={{
          transform: [{ scale: cardScale }, { translateY: logoFloat }],
          opacity: cardOpacity,
        }}>
        <View style={[styles.loadingLogoWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Animated.View style={[styles.loadingShimmer, { transform: [{ translateX: shimmerX }] }]} />
          <Image source={require('../../assets/Meet up logo.png')} style={styles.loadingLogo} resizeMode="contain" />
        </View>
      </Animated.View>

      <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>MeetUp</Text>
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}> 
        {isAuthReady ? 'Entering your space' : 'Preparing your space'}
      </Text>

      <View style={[styles.loadingTrack, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
        <Animated.View style={[styles.loadingFill, { width: loadWidth, backgroundColor: colors.textPrimary }]} />
      </View>

      <View style={styles.loadingDotsRow}>
        <Animated.View style={[styles.loadingDot, { opacity: dot1, backgroundColor: colors.textPrimary }]} />
        <Animated.View style={[styles.loadingDot, { opacity: dot2, backgroundColor: colors.textSecondary }]} />
        <Animated.View style={[styles.loadingDot, { opacity: dot3, backgroundColor: colors.textMuted }]} />
      </View>
    </View>
  );
};

const AppNavigator = () => {
  const { session, user, initializing, pendingNavigation, consumePendingNavigation } = useAuth();
  const [navReady, setNavReady] = React.useState(false);
  const [hasShownLoading, setHasShownLoading] = React.useState(false);
  const [transitionDone, setTransitionDone] = React.useState(false);

  React.useEffect(() => {
    if (initializing) {
      setHasShownLoading(true);
      setTransitionDone(false);
    }
  }, [initializing]);

  React.useEffect(() => {
    if (!session || !pendingNavigation || !navReady || !navigationRef.isReady()) return;

    const next = consumePendingNavigation();
    if (!next) return;

    navigationRef.navigate(next.screen, next.params);
  }, [consumePendingNavigation, navReady, pendingNavigation, session]);

  const shouldShowLoading = initializing || (hasShownLoading && !transitionDone);

  if (shouldShowLoading) {
    return <LoadingScreen isAuthReady={!initializing} onFinished={() => setTransitionDone(true)} />;
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      {session ? (
        user?.display_name ? <MainStack /> : <AuthStack key="profile-completion" initialRouteName="Register" />
      ) : (
        <AuthStack key="signed-out" />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOrbTop: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -100,
    right: -70,
    opacity: 0.42,
  },
  loadingOrbBottom: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    bottom: 120,
    left: -70,
    opacity: 0.3,
  },
  loadingLogoWrap: {
    width: 176,
    height: 176,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 22,
    elevation: 8,
  },
  loadingShimmer: {
    position: 'absolute',
    width: 80,
    height: 260,
    backgroundColor: 'rgba(255,255,255,0.55)',
    transform: [{ rotateZ: '24deg' }],
  },
  loadingLogo: {
    width: 126,
    height: 126,
  },
  loadingTitle: {
    marginTop: 22,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  loadingText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  loadingTrack: {
    marginTop: 18,
    width: 182,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  loadingFill: {
    height: '100%',
    borderRadius: 4,
  },
  loadingDotsRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
});

export default AppNavigator;
