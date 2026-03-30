import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const LOGO_SOURCE = require('../../assets/Meet up logo.png');

const AnimatedLaunchScreen = ({ onComplete, duration = 2100, backgroundColor = '#F6F6F6' }) => {
  const containerOpacity = useRef(new Animated.Value(1)).current;

  const auroraA = useRef(new Animated.Value(0)).current;
  const auroraB = useRef(new Animated.Value(0)).current;
  const auroraC = useRef(new Animated.Value(0)).current;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.86)).current;
  const cardY = useRef(new Animated.Value(10)).current;

  const haloOpacity = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(0.82)).current;

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.78)).current;
  const logoY = useRef(new Animated.Value(8)).current;

  const shimmerX = useRef(new Animated.Value(-220)).current;

  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(16)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  const dot1 = useRef(new Animated.Value(0.28)).current;
  const dot2 = useRef(new Animated.Value(0.28)).current;
  const dot3 = useRef(new Animated.Value(0.28)).current;

  const timeline = useMemo(
    () => ({
      introDelay: 110,
      cardIn: 520,
      logoIn: 420,
      titleIn: 280,
      settleAt: 1180,
      fadeAt: duration - 320,
    }),
    [duration]
  );

  useEffect(() => {
    let mounted = true;
    let completionTimeout = null;
    let hapticTimeout = null;
    let fadeTimeout = null;
    let shimmerLoop = null;
    let dotLoop = null;
    let auroraLoop = null;

    const run = async () => {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();

      if (reduceMotion) {
        Animated.parallel([
          Animated.timing(cardOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(logoOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(titleOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();

        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 220,
          delay: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          if (mounted) onComplete?.();
        });
        return;
      }

      completionTimeout = setTimeout(() => {
        if (mounted) onComplete?.();
      }, duration);

      hapticTimeout = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }, timeline.settleAt);

      auroraLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(auroraA, {
              toValue: 1,
              duration: 1800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(auroraB, {
              toValue: 1,
              duration: 2200,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(auroraC, {
              toValue: 1,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(auroraA, {
              toValue: 0,
              duration: 1800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(auroraB, {
              toValue: 0,
              duration: 2200,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(auroraC, {
              toValue: 0,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      auroraLoop.start();

      Animated.sequence([
        Animated.delay(timeline.introDelay),
        Animated.parallel([
          Animated.spring(cardScale, {
            toValue: 1,
            stiffness: 250,
            damping: 18,
            mass: 0.9,
            useNativeDriver: true,
          }),
          Animated.spring(cardY, {
            toValue: 0,
            stiffness: 220,
            damping: 19,
            mass: 0.9,
            useNativeDriver: true,
          }),
          Animated.timing(cardOpacity, {
            toValue: 1,
            duration: timeline.cardIn,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.28,
            duration: timeline.cardIn,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(haloScale, {
            toValue: 1.08,
            duration: timeline.cardIn,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.sequence([
        Animated.delay(timeline.introDelay + 80),
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: timeline.logoIn,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(logoScale, {
            toValue: 1,
            stiffness: 290,
            damping: 18,
            mass: 0.78,
            useNativeDriver: true,
          }),
          Animated.spring(logoY, {
            toValue: 0,
            stiffness: 250,
            damping: 19,
            mass: 0.84,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.sequence([
        Animated.delay(timeline.introDelay + 320),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: timeline.titleIn,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(titleY, {
            toValue: 0,
            duration: timeline.titleIn,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: timeline.titleIn + 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.delay(260),
          Animated.timing(shimmerX, {
            toValue: 220,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shimmerX, {
            toValue: -220,
            duration: 1,
            useNativeDriver: true,
          }),
        ])
      );
      shimmerLoop.start();

      dotLoop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(dot1, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.timing(dot2, { toValue: 0.36, duration: 220, useNativeDriver: true }),
            Animated.timing(dot3, { toValue: 0.36, duration: 220, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(dot1, { toValue: 0.36, duration: 220, useNativeDriver: true }),
            Animated.timing(dot2, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.timing(dot3, { toValue: 0.36, duration: 220, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(dot1, { toValue: 0.36, duration: 220, useNativeDriver: true }),
            Animated.timing(dot2, { toValue: 0.36, duration: 220, useNativeDriver: true }),
            Animated.timing(dot3, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]),
        ])
      );
      dotLoop.start();

      fadeTimeout = setTimeout(() => {
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, timeline.fadeAt);
    };

    run();

    return () => {
      mounted = false;
      clearTimeout(completionTimeout);
      clearTimeout(hapticTimeout);
      clearTimeout(fadeTimeout);
      shimmerLoop?.stop();
      dotLoop?.stop();
      auroraLoop?.stop();
    };
  }, [
    auroraA,
    auroraB,
    auroraC,
    cardOpacity,
    cardScale,
    cardY,
    containerOpacity,
    dot1,
    dot2,
    dot3,
    duration,
    haloOpacity,
    haloScale,
    logoOpacity,
    logoScale,
    logoY,
    onComplete,
    shimmerX,
    subtitleOpacity,
    timeline,
    titleOpacity,
    titleY,
  ]);

  const auroraATranslateY = auroraA.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const auroraBTranslateX = auroraB.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const auroraCTranslateY = auroraC.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  return (
    <Animated.View style={[styles.root, { backgroundColor, opacity: containerOpacity }]} pointerEvents="none">
      <Animated.View style={[styles.auroraOne, { transform: [{ translateY: auroraATranslateY }] }]} />
      <Animated.View style={[styles.auroraTwo, { transform: [{ translateX: auroraBTranslateX }] }]} />
      <Animated.View style={[styles.auroraThree, { transform: [{ translateY: auroraCTranslateY }] }]} />

      <Animated.View
        style={[
          styles.halo,
          {
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ scale: cardScale }, { translateY: cardY }],
          },
        ]}>
        <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]} />
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }, { translateY: logoY }] }}>
          <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.textWrap, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}> 
        <Text style={styles.title}>MeetUp</Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>Where moments become plans</Animated.Text>
      </Animated.View>

      <View style={styles.progressDots}>
        <Animated.View style={[styles.dot, styles.dotA, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, styles.dotB, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, styles.dotC, { opacity: dot3 }]} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  auroraOne: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -120,
    right: -80,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  auroraTwo: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    bottom: -100,
    left: -80,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  auroraThree: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    bottom: 170,
    right: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
  },
  halo: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
  },
  card: {
    width: 250,
    height: 250,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  shimmer: {
    position: 'absolute',
    width: 86,
    height: 320,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    transform: [{ rotateZ: '24deg' }],
  },
  logo: {
    width: 184,
    height: 184,
  },
  textWrap: {
    marginTop: 28,
    alignItems: 'center',
  },
  title: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.1,
    color: '#12141A',
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#595959',
    fontWeight: '600',
  },
  progressDots: {
    position: 'absolute',
    bottom: 90,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginHorizontal: 5,
  },
  dotA: {
    backgroundColor: 'rgba(10, 10, 10, 0.9)',
  },
  dotB: {
    backgroundColor: 'rgba(10, 10, 10, 0.58)',
  },
  dotC: {
    backgroundColor: 'rgba(10, 10, 10, 0.36)',
  },
});

export default AnimatedLaunchScreen;
