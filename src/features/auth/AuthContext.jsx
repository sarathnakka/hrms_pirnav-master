import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearUserSession, getUserSession, saveUserSession } from './authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const restoreSession = useCallback(async () => {
    setIsInitializing(true);
    try {
      const session = await getUserSession();
      setToken(session.token);
      setUser(session.user);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (accessToken, userData = {}) => {
    await saveUserSession(accessToken, userData);
    setToken(accessToken);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await clearUserSession();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isInitializing,
      login,
      logout,
      restoreSession,
    }),
    [user, token, isInitializing, login, logout, restoreSession]
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
