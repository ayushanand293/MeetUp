import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_TOKEN_KEY = 'meetup_access_token';
const USER_KEY = 'meetup_user';
const DEVICE_ID_KEY = 'meetup_device_id';

const makeDeviceId = () => `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const authStorage = {
  async getAccessToken() {
    return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  },

  async setSession(accessToken, user) {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user || null));
  },

  async clearSession() {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  },

  async getUser() {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async getDeviceId() {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = makeDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  },
};
