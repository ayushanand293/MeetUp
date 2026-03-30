import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ModernDistanceBar = ({ distanceM, maxDistanceM = 500, colors }) => {
  const { tone, widthPct, status } = useMemo(() => {
    if (distanceM == null) {
      return {
        tone: 'neutral',
        widthPct: 0,
        status: 'Waiting for peer location',
      };
    }

    const proximity = clamp(1 - distanceM / maxDistanceM, 0, 1);
    const width = Math.max(proximity * 100, 6);

    if (distanceM <= 50) {
      return { tone: 'success', widthPct: width, status: 'You are close enough to confirm arrival' };
    }

    if (distanceM <= 200) {
      return { tone: 'warning', widthPct: width, status: 'Getting closer' };
    }

    return { tone: 'danger', widthPct: width, status: 'Far away from meetup point' };
  }, [distanceM, maxDistanceM]);

  const fillColor =
    tone === 'success'
      ? colors.online
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.accent
          : colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <View style={styles.row}>
        <Text style={[styles.heading, { color: colors.textSecondary }]}>Distance to Meetup</Text>
        <Text style={[styles.value, { color: colors.textPrimary }]}> 
          {distanceM == null ? '--' : `${Math.round(distanceM)}m`}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceElevated }]}> 
        <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: fillColor }]} />
      </View>

      <View style={[styles.statusWrap, { backgroundColor: colors.surfaceSoft || colors.surfaceElevated, borderColor: colors.border }]}> 
        <Text style={[styles.status, { color: colors.textSecondary }]}>{status}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  track: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  statusWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ModernDistanceBar;
