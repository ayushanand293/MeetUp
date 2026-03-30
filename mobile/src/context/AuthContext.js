import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import * as Linking from 'expo-linking';
import analyticsService from '../services/analyticsService';

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
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setLoading(false);
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

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log('Auth state changed:', event);
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  // Sign up with email and password
  const signUpWithEmail = async (email, password) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Sign in with email and password
  const signInWithEmail = async (email, password) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Phone (Send OTP)
  const signInWithPhone = async phone => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithOtp({
        phone,
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Verify Phone OTP
  const verifyPhoneOTP = async (phone, token) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Reset Password Request
  const resetPasswordForEmail = async email => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Update User Password (after reset)
  const updateUserPassword = async new_password => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.updateUser({
        password: new_password,
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Update current user account details (email/phone/password/metadata)
  const updateAccountDetails = async updates => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      if (data?.user) {
        setUser(data.user);
      }
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (!error) {
        return { mode: 'remote' };
      }

      const message = (error?.message || '').toLowerCase();
      const isNetworkFailure = message.includes('network request failed') || message.includes('failed to fetch');

      if (!isNetworkFailure) {
        throw error;
      }

      // If network is unavailable, perform local-only sign-out so users can still leave the session.
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
      if (localError) {
        setSession(null);
        setUser(null);
        throw localError;
      }

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

  const value = {
    session,
    user,
    loading,
    pendingNavigation,
    consumePendingNavigation,
    signUpWithEmail,
    signInWithEmail,
    signInWithPhone,
    verifyPhoneOTP,
    resetPasswordForEmail,
    updateUserPassword,
    updateAccountDetails,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
