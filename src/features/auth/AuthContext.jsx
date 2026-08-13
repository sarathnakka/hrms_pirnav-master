import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import {
  clearUserSession,
  getSessionExpiryTime,
  getUserSession,
  isSessionExpired,
  saveUserSession,
  updateStoredUser,
} from './authStorage';
import { getMyEmployeeDetails } from '../employees/employeeProfileApi';
import { normalizeEmployeeProfile } from '../employees/employeeProfileMappers';
import {
  clearSessionTimer,
  notifySessionExpired,
  registerSessionExpiryHandler,
  resetSessionExpiryGuard,
  startSessionTimer,
  unregisterSessionExpiryHandler,
} from './sessionManager';

const AuthContext = createContext(null);

function text(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function buildEmployeeIdentity(currentUser = {}, profile = null) {
  const personal = profile?.personal || {};

  const firstName = text(personal.firstName) || text(currentUser.firstName);
  const middleName = text(personal.middleName) || text(currentUser.middleName);
  const lastName = text(personal.lastName) || text(currentUser.lastName);

  const profileFullName = [firstName, middleName, lastName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const existingFullName =
    text(currentUser.employeeName) ||
    text(currentUser.fullName) ||
    text(currentUser.name);

  const fullName = profileFullName || existingFullName;
  const employeeId =
    text(profile?.employeeId) ||
    text(personal.employeeId) ||
    text(currentUser.employeeId) ||
    text(currentUser.employee_Id);
  const email =
    text(personal.email) ||
    text(currentUser.email) ||
    text(currentUser.emailAddress);

  return {
    ...currentUser,
    ...(firstName ? { firstName } : {}),
    ...(middleName ? { middleName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(fullName ? { fullName, employeeName: fullName } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(email ? { email } : {}),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const signingOutRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const enrichAuthenticatedUser = useCallback(async (accessToken, currentUser = {}) => {
    if (!accessToken) {
      return currentUser || {};
    }

    try {
      const response = await getMyEmployeeDetails(accessToken);
      const profile = normalizeEmployeeProfile(response);
      return buildEmployeeIdentity(currentUser || {}, profile);
    } catch {
      // Optional identity refresh must not block login or session restoration.
      return currentUser || {};
    }
  }, []);

  const signOut = useCallback(async ({ reason = 'manual', showMessage = false } = {}) => {
    if (signingOutRef.current) return;

    signingOutRef.current = true;
    clearSessionTimer();

    try {
      await clearUserSession();
    } finally {
      if (mountedRef.current) {
        setToken(null);
        setUser(null);
      }
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

      enrichAuthenticatedUser(session.token, session.user)
        .then(async (enrichedUser) => {
          if (!mountedRef.current) return;
          setUser(enrichedUser);
          await updateStoredUser(enrichedUser);
        })
        .catch(() => {});
    } finally {
      setIsInitializing(false);
    }
  }, [enrichAuthenticatedUser]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (accessToken, userData = {}) => {
    const session = await saveUserSession(accessToken, userData);
    resetSessionExpiryGuard();
    setToken(accessToken);
    setUser(userData);
    startSessionTimer(session, getSessionExpiryTime);

    try {
      const enrichedUser = await enrichAuthenticatedUser(accessToken, userData);
      await updateStoredUser(enrichedUser);
      if (mountedRef.current) {
        setUser(enrichedUser);
      }
    } catch {
      // Keep the authenticated session active even if optional identity caching fails.
    }
  }, [enrichAuthenticatedUser]);

  const refreshUserIdentity = useCallback(async () => {
    if (!token) {
      return user;
    }

    try {
      const enrichedUser = await enrichAuthenticatedUser(token, user || {});
      await updateStoredUser(enrichedUser);
      if (mountedRef.current) {
        setUser(enrichedUser);
      }
      return enrichedUser;
    } catch {
      return user;
    }
  }, [enrichAuthenticatedUser, token, user]);

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
      refreshUserIdentity,
    }),
    [user, token, isInitializing, login, logout, restoreSession, signOut, refreshUserIdentity]
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
