
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../api/supabase';
import * as Linking from 'expo-linking';
import client from '../api/client';
import { authStorage } from '../api/authStorage';
import analyticsService from '../services/analyticsService';
import { authEventEmitter } from '../api/client';

// Create the Auth Context
const AuthContext = createContext({});

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Auth Provider component
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [activeSessionHint, setActiveSessionHint] = useState(null);
  const [sessionInvalidatedElsewhere, setSessionInvalidatedElsewhere] = useState(false);
  const launchStartedAtRef = useRef(Date.now());
  const launchTrackedRef = useRef(false);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      let initialSession = null;
      try {
        const [accessToken, storedUser] = await Promise.all([
          authStorage.getAccessToken(),
          authStorage.getUser(),
        ]);

        if (accessToken) {
          initialSession = { access_token: accessToken, user: storedUser };
          setSession(initialSession);
          setUser(storedUser ?? null);

          try {
            const { data: freshUser } = await client.get('/users/me', {
              skipSessionInvalidation: true,
            });
            initialSession = { access_token: accessToken, user: freshUser };
            await authStorage.setSession(accessToken, freshUser);
            setSession(initialSession);
            setUser(freshUser);
          } catch (error) {
            await authStorage.clearSession();
            initialSession = null;
            setSession(null);
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setInitializing(false);
        if (!launchTrackedRef.current) {
          launchTrackedRef.current = true;
          analyticsService.track('app_launch', {
            elapsed_ms: Date.now() - launchStartedAtRef.current,
            signed_in: Boolean(initialSession),
          });
        }
      }
    };

    getInitialSession();

    // Handle deep links for magic link login
    const handleDeepLink = async url => {
      if (!url) return;
      const { path, queryParams } = Linking.parse(url);
      const cleanPath = (path || '').replace(/^\/+/, '');

      analyticsService.track('deep_link_opened', {
        path: cleanPath || null,
        hasToken: Boolean(queryParams?.token),
        hasAuthTokens: Boolean(queryParams?.access_token && queryParams?.refresh_token),
      });

      if (queryParams?.token) {
        try {
          const inviteResponse = await client.get(`/invites/${encodeURIComponent(queryParams.token)}`);
          const resolvedRequestId = inviteResponse?.data?.request_id;
          if (resolvedRequestId) {
            try {
              await client.post(`/invites/${encodeURIComponent(queryParams.token)}/redeem`);
            } catch (_) {
              // Redeem is idempotent best-effort; routing should still continue.
            }
            analyticsService.track('deep_link_route_prepared', {
              type: 'invite_request',
              requestId: resolvedRequestId,
              hasInviteToken: true,
            });
            setPendingNavigation({
              screen: 'AcceptRequest',
              params: {
                linkedRequestId: resolvedRequestId,
                inviteToken: queryParams.token,
                fromInvite: true,
              },
            });
            return;
          }
        } catch (error) {
          analyticsService.track('deep_link_invite_resolution_failed', {
            message: error?.response?.data?.detail || error?.message || 'unknown',
          });
          console.warn('Invite token resolution failed:', error?.response?.data || error);
        }
      }

      if (cleanPath.startsWith('request/')) {
        const [, requestId] = cleanPath.split('/');
        if (requestId) {
          analyticsService.track('deep_link_route_prepared', {
            type: 'request',
            requestId,
          });
          setPendingNavigation({
            screen: 'AcceptRequest',
            params: {
              linkedRequestId: requestId,
              fromInvite: true,
            },
          });
        }
      }

      if (cleanPath.startsWith('session/')) {
        const [, sessionId] = cleanPath.split('/');
        if (sessionId) {
          analyticsService.track('deep_link_route_prepared', {
            type: 'session',
            sessionId,
            hasInviteToken: Boolean(queryParams?.token),
          });
          setPendingNavigation({
            screen: 'ActiveSession',
            params: {
              sessionId,
              inviteToken: queryParams?.token || null,
              fromInvite: true,
            },
          });
        }
      }

      if (queryParams?.access_token && queryParams?.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: queryParams.access_token,
          refresh_token: queryParams.refresh_token,
        });
        if (error) {
          analyticsService.track('deep_link_auth_session_failed', { message: error?.message || 'unknown' });
          console.error('Error setting session from deep link:', error);
        } else {
          analyticsService.track('deep_link_auth_session_set');
        }
      }
    };

    // Listen for links when the app is already open
    const linkingSubscription = Linking.addEventListener('url', event => {
      handleDeepLink(event.url);
    });

    // Check for link that opened the app
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });

    // Cleanup subscription on unmount
    return () => {
      linkingSubscription.remove();
    };
  }, []);

  // Listen for session invalidation events (401 errors)
  useEffect(() => {
    const handleSessionInvalidated = () => {
      setSessionInvalidatedElsewhere(true);
      setSession(null);
      setUser(null);
      authStorage.clearSession();
    };

    authEventEmitter.on('SESSION_INVALIDATED', handleSessionInvalidated);

    return () => {
      authEventEmitter.off('SESSION_INVALIDATED', handleSessionInvalidated);
    };
  }, []);

  // Sign in with Phone (Send OTP)
  const signInWithPhone = async phone => {
    try {
      setLoading(true);
      await authStorage.clearSession();
      setSession(null);
      setUser(null);
      setPendingNavigation(null);

      const { data } = await client.post('/auth/otp/start', {
        phone_e164: phone,
      }, {
        skipSessionInvalidation: true,
      });
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Verify Phone OTP
  const verifyPhoneOTP = async (phone, token) => {
    try {
      setLoading(true);
      const deviceId = await authStorage.getDeviceId();
      const { data } = await client.post('/auth/otp/verify', {
        phone_e164: phone,
        otp_code: token,
        device_id: deviceId,
      }, {
        skipSessionInvalidation: true,
      });

      const nextSession = {
        access_token: data.access_token,
        user: data.user,
      };
      await authStorage.setSession(data.access_token, data.user);
      setSession(nextSession);
      setUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Update current user account details.
  const updateAccountDetails = async updates => {
    try {
      setLoading(true);
      const { data } = await client.post('/users/profile', {
        display_name: updates.display_name,
      });
      const accessToken = await authStorage.getAccessToken();
      if (accessToken) {
        await authStorage.setSession(accessToken, data);
      }
      setUser(data);
      setSession(prev => (prev ? { ...prev, user: data } : prev));
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true);
      await authStorage.clearSession();
      setSession(null);
      setUser(null);
      return { mode: 'local' };
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Context value
  const consumePendingNavigation = () => {
    const next = pendingNavigation;
    setPendingNavigation(null);
    return next;
  };

  const clearSessionInvalidatedFlag = () => {
    setSessionInvalidatedElsewhere(false);
  };

  const rememberActiveSession = hint => {
    if (!hint?.session_id) return;
    setActiveSessionHint(prev => ({
      ...(prev || {}),
      ...hint,
    }));
  };

  const clearActiveSessionHint = () => {
    setActiveSessionHint(null);
  };

  const value = {
    session,
    user,
    loading,
    initializing,
    activeSessionHint,
    rememberActiveSession,
    clearActiveSessionHint,
    pendingNavigation,
    consumePendingNavigation,
    sessionInvalidatedElsewhere,
    clearSessionInvalidatedFlag,
    signInWithPhone,
    verifyPhoneOTP,
    updateAccountDetails,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
