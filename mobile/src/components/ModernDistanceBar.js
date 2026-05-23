import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ModernDistanceBar = ({ distanceM, maxDistanceM = 500, colors, variant = 'card', onPress }) => {
  const { tone, widthPct, status, statusShort } = useMemo(() => {
    if (distanceM == null) {
      return {
        tone: 'neutral',
        widthPct: 0,
        status: 'Waiting for peer location',
        statusShort: 'Waiting',
      };
    }

    const proximity = clamp(1 - distanceM / maxDistanceM, 0, 1);
    const width = Math.max(proximity * 100, 6);

    if (distanceM <= 50) {
      return { tone: 'success', widthPct: width, status: 'You are close enough to confirm arrival', statusShort: 'Here' };
    }

    if (distanceM <= 200) {
      return { tone: 'warning', widthPct: width, status: 'Getting closer', statusShort: 'Close' };
    }

    return { tone: 'danger', widthPct: width, status: 'Far away from meetup point', statusShort: 'Far' };
  }, [distanceM, maxDistanceM]);

  const fillColor =
    tone === 'success'
      ? '#34C759'
      : tone === 'warning'
        ? '#FF9500'
        : tone === 'danger'
          ? '#FF3B30'
          : colors.textMuted;

  const isMapHero = variant === 'mapHero';
  const isMapChip = variant === 'mapChip';
  const Container = onPress ? TouchableOpacity : View;

  if (isMapChip) {
    return (
      <Container
        activeOpacity={0.88}
        onPress={onPress}
        style={[styles.mapChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.mapChipValue, { color: colors.textPrimary }]}>
          {distanceM == null ? '--' : `${Math.round(distanceM)}m`}
        </Text>
        <View style={styles.mapChipDivider} />
        <View style={[styles.mapChipDot, { backgroundColor: fillColor }]} />
        <Text style={[styles.mapChipStatus, { color: colors.textSecondary }]}>{statusShort}</Text>
      </Container>
    );
  }

  if (isMapHero) {
    return (
      <Container
        activeOpacity={0.88}
        onPress={onPress}
        style={[styles.mapHero, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.mapHeroTop}>
          <Text style={[styles.mapValue, { color: colors.textPrimary }]}>
            {distanceM == null ? '--' : `${Math.round(distanceM)}m`}
          </Text>
          <Text style={[styles.mapHeading, { color: colors.textSecondary }]}>meetup</Text>
        </View>
        <View style={[styles.mapTrack, { backgroundColor: colors.surfaceElevated }]}>
          <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: fillColor }]} />
        </View>
        <View style={styles.mapHeroBottom}>
          <View style={[styles.mapStatusDot, { backgroundColor: fillColor }]} />
          <Text style={[styles.mapStatus, { color: colors.textSecondary }]}>{statusShort}</Text>
        </View>
      </Container>
    );
  }

  return (
    <Container
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        isMapHero ? styles.mapHero : styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.row}>
        <Text style={[isMapHero ? styles.mapHeading : styles.heading, { color: colors.textSecondary }]} numberOfLines={1}>To meetup</Text>
        <Text style={[isMapHero ? styles.mapValue : styles.value, { color: colors.textPrimary }]}>
          {distanceM == null ? '--' : `${Math.round(distanceM)}m`}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}>
        <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: fillColor }]} />
      </View>

      <Text style={[isMapHero ? styles.mapStatus : styles.status, { color: colors.textSecondary }]} numberOfLines={isMapHero ? 1 : undefined}>{status}</Text>
    </Container>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 10,
  },
  heading: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  value: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  track: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  status: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  mapHero: {
    width: 132,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 11,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
  mapHeading: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    textAlign: 'center',
    marginTop: -2,
  },
  mapValue: {
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  mapTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 5,
  },
  mapHeroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  mapStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 4,
  },
  mapStatus: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
  },
  mapChip: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
  mapChipValue: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  mapChipDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(120,120,120,0.22)',
    marginHorizontal: 9,
  },
  mapChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  mapChipStatus: {
    fontSize: 13,
    fontWeight: '900',
  },
});

export default ModernDistanceBar;
