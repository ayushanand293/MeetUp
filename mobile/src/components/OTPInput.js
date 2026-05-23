import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, Spacing, Radius } from '../theme';

const DIGIT_COUNT = 6;
const AUTO_SUBMIT_DELAY = 300;

const OTPInput = forwardRef(({ value = '', onChangeText, onComplete, editable = true, error = '' }, ref) => {
  const { colors } = useTheme();
  const hiddenRef = useRef(null);
  const [focused, setFocused] = useState(false);

  /* ── entrance animation ── */
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      tension: 68,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  /* ── blinking cursor ── */
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  /* ── shake animation for errors ── */
  const shakeX = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    shake() {
      Animated.sequence([
        Animated.timing(shakeX, { toValue: 12, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -12, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 4, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    },
    focus() {
      hiddenRef.current?.focus();
    },
  }));

  /* ── auto-submit timer ── */
  const submitTimer = useRef(null);
  useEffect(() => {
    if (value.length === DIGIT_COUNT && onComplete) {
      submitTimer.current = setTimeout(() => onComplete(value), AUTO_SUBMIT_DELAY);
    }
    return () => clearTimeout(submitTimer.current);
  }, [value, onComplete]);

  /* ── handlers ── */
  const handleChange = useCallback(
    (text) => {
      const digits = text.replace(/\D/g, '').slice(0, DIGIT_COUNT);
      if (digits.length > value.length) {
        Haptics.selectionAsync().catch(() => {});
      }
      onChangeText(digits);
    },
    [onChangeText, value],
  );

  const focusInput = useCallback(() => {
    hiddenRef.current?.focus();
  }, []);

  /* ── digit boxes ── */
  const digits = value.split('');
  const activeIndex = Math.min(digits.length, DIGIT_COUNT - 1);
  const hasError = Boolean(error);

  const entranceTranslateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: entrance,
          transform: [{ translateY: entranceTranslateY }, { translateX: shakeX }],
        },
      ]}
    >
      {/* Hidden real input */}
      <TextInput
        ref={hiddenRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={DIGIT_COUNT}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
        editable={editable}
        style={styles.hiddenInput}
        caretHidden
      />

      {/* Visible digit boxes */}
      <TouchableOpacity
        style={styles.boxRow}
        activeOpacity={1}
        onPress={focusInput}
        accessible={false}
      >
        {Array.from({ length: DIGIT_COUNT }).map((_, i) => {
          const filled = i < digits.length;
          const isActive = focused && i === activeIndex && !filled;
          const isCompleted = digits.length === DIGIT_COUNT;

          const borderColor = hasError
            ? '#B1121B'
            : isActive
            ? colors.textPrimary
            : filled
            ? isCompleted
              ? '#B1121B'
              : colors.borderLight
            : colors.border;

          const bgColor = hasError
            ? 'rgba(177,18,27,0.06)'
            : filled
            ? isCompleted
              ? 'rgba(177,18,27,0.08)'
              : colors.surfaceElevated
            : colors.surface;

          return (
            <View
              key={i}
              style={[styles.box, { borderColor, backgroundColor: bgColor }]}
            >
              {filled ? (
                <Text style={[styles.digit, { color: hasError ? '#B1121B' : isCompleted ? '#B1121B' : colors.textPrimary }]}>
                  {digits[i]}
                </Text>
              ) : isActive ? (
                <Animated.View
                  style={[
                    styles.cursor,
                    {
                      backgroundColor: colors.textPrimary,
                      opacity: cursorOpacity,
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </TouchableOpacity>

      {/* Inline error message */}
      {hasError && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    marginTop: Spacing.md,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  box: {
    flex: 1,
    aspectRatio: 0.9,
    maxHeight: 56,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
  },
  errorText: {
    color: '#B1121B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default OTPInput;
