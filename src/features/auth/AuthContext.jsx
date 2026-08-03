import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import {
  clearUserSession,
  getSessionExpiryTime,
  getUserSession,
  isSessionExpired,
  saveUserSession,
} from './authStorage';
import {
  clearSessionTimer,
  notifySessionExpired,
  registerSessionExpiryHandler,
  resetSessionExpiryGuard,
  startSessionTimer,
  unregisterSessionExpiryHandler,
} from './sessionManager';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const signingOutRef = useRef(false);

  const signOut = useCallback(async ({ reason = 'manual', showMessage = false } = {}) => {
    if (signingOutRef.current) return;

    signingOutRef.current = true;
    clearSessionTimer();

    try {
      await clearUserSession();
    } finally {
      setToken(null);
      setUser(null);
      signingOutRef.current = false;
    }

    if (showMessage) {
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please sign in again.'
      );
    }
  }, []);

  const restoreSession = useCallback(async ({ silentExpired = true } = {}) => {
    setIsInitializing(true);
    try {
      const session = await getUserSession();
      if (!session.token || isSessionExpired(session)) {
        await clearUserSession();
        clearSessionTimer();
        setToken(null);
        setUser(null);

        if (!silentExpired && session.token) {
          Alert.alert(
            'Session Expired',
            'Your session has expired. Please sign in again.'
          );
        }
        return;
      }

      setToken(session.token);
      setUser(session.user);
      startSessionTimer(session, getSessionExpiryTime);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (accessToken, userData = {}) => {
    const session = await saveUserSession(accessToken, userData);
    resetSessionExpiryGuard();
    setToken(accessToken);
    setUser(userData);
    startSessionTimer(session, getSessionExpiryTime);
  }, []);

  const logout = useCallback(
    async (options) => {
      resetSessionExpiryGuard();
      await signOut(options);
    },
    [signOut]
  );

  useEffect(() => {
    const handleExpiredSession = () => {
      signOut({ reason: 'expired', showMessage: true });
    };

    registerSessionExpiryHandler(handleExpiredSession);

    return () => {
      unregisterSessionExpiryHandler(handleExpiredSession);
      clearSessionTimer();
    };
  }, [signOut]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !token) return;

      const session = await getUserSession();
      if (!session.token || isSessionExpired(session)) {
        notifySessionExpired('expired');
        return;
      }

      startSessionTimer(session, getSessionExpiryTime);
    });

    return () => subscription.remove();
  }, [signOut, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isInitializing,
      login,
      logout,
      restoreSession,
      signOut,
    }),
    [user, token, isInitializing, login, logout, restoreSession, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
