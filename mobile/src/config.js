export const CLIENT_ANALYTICS_ENABLED =
  String(process.env.EXPO_PUBLIC_CLIENT_ANALYTICS_ENABLED ?? 'true').toLowerCase() !== 'false';

export const CLIENT_LOCATION_FOREGROUND_ONLY = true;

export const APP_FEATURES = {
  analyticsEnabled: CLIENT_ANALYTICS_ENABLED,
  locationForegroundOnly: CLIENT_LOCATION_FOREGROUND_ONLY,
};
