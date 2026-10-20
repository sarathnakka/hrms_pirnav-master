import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { navigateToTeamsFromNotification } from '../../app/navigation/navigationRef';
import { useAuth } from '../auth/AuthContext';
import FcmRegistrationDiagnosticsPanel from './FcmRegistrationDiagnosticsPanel';
import { updateFcmDiagnostics } from './fcmRegistrationDiagnostics';
import {
  addForegroundNotificationListener,
  addNativePushTokenListener,
  addNotificationResponseListener,
  clearLastNotificationResponse,
  getCurrentNativePushToken,
  getLastNotificationResponse,
  getNotificationNavigationTarget,
  getNotificationResponseKey,
  initializeAndroidPushNotifications,
  registerDeviceToken,
  resetDeviceRegistrationState,
} from './pushNotificationService';

export default function PushNotificationManager({ navigationReady }) {
  const { isAuthenticated, token } = useAuth();
  const authenticatedRef = useRef(isAuthenticated);
  const sessionTokenRef = useRef(token || '');
  const navigationReadyRef = useRef(navigationReady);
  const previousAuthenticatedRef = useRef(isAuthenticated);
  const pendingResponseRef = useRef(null);
  const handledResponseKeysRef = useRef(new Set());
  const tokenInitializationPromiseRef = useRef(null);

  const registerCurrentDevice = useCallback(async (deviceToken, sessionToken) => {
    const expectedSessionToken = String(sessionToken || '').trim();

    if (!deviceToken || !expectedSessionToken) {
      updateFcmDiagnostics('REGISTRATION_SKIPPED', {
        registrationSkipped: !deviceToken
          ? 'Missing native FCM token'
          : 'Missing authenticated JWT',
        backendRegistration: 'Not attempted',
      });
      return;
    }

    try {
      await registerDeviceToken(deviceToken, expectedSessionToken);
    } catch {
      // Registration retries on a later login, token refresh, or foreground event.
    }
  }, []);

  const ensureNativeToken = useCallback(() => {
    if (!tokenInitializationPromiseRef.current) {
      tokenInitializationPromiseRef.current = initializeAndroidPushNotifications()
        .finally(() => {
          tokenInitializationPromiseRef.current = null;
        });
    }

    return tokenInitializationPromiseRef.current;
  }, []);

  const registerForSession = useCallback(async (sessionToken) => {
    const expectedSessionToken = String(sessionToken || '').trim();
    if (!expectedSessionToken) {
      updateFcmDiagnostics('JWT_UNAVAILABLE', {
        jwtAvailable: 'No',
        registrationSkipped: 'Missing authenticated JWT',
        backendRegistration: 'Not attempted',
      });
      return;
    }

    if (sessionTokenRef.current !== expectedSessionToken) {
      updateFcmDiagnostics('REGISTRATION_SKIPPED', {
        registrationSkipped: 'Stale authenticated session',
        backendRegistration: 'Not attempted',
      });
      return;
    }

    const availableToken = getCurrentNativePushToken();
    if (availableToken) {
      await registerCurrentDevice(availableToken, expectedSessionToken);
      return;
    }

    try {
      const initialization = await ensureNativeToken();
      if (sessionTokenRef.current !== expectedSessionToken) {
        updateFcmDiagnostics('REGISTRATION_SKIPPED', {
          registrationSkipped: 'Session changed during token initialization',
          backendRegistration: 'Not attempted',
        });
        return;
      }

      if (initialization?.token) {
        await registerCurrentDevice(initialization.token, expectedSessionToken);
      } else {
        updateFcmDiagnostics('REGISTRATION_SKIPPED', {
          registrationSkipped: `Native token unavailable (${initialization?.status || 'unknown'})`,
          backendRegistration: 'Not attempted',
        });
      }
    } catch (error) {
      updateFcmDiagnostics('FCM_INITIALIZATION_ERROR', {
        registrationSkipped: 'Push initialization failed',
        backendRegistration: 'Not attempted',
      });

      if (__DEV__) {
        console.warn('[PeopleHRSync FCM] Native token initialization failed.', {
          status: error?.status || null,
          code: error?.code || null,
        });
      }
    }
  }, [ensureNativeToken, registerCurrentDevice]);

  const handleResponse = useCallback((response) => {
    if (!response?.notification) {
      return;
    }

    const responseKey = getNotificationResponseKey(response);
    if (responseKey && handledResponseKeysRef.current.has(responseKey)) {
      clearLastNotificationResponse();
      return;
    }

    const target = getNotificationNavigationTarget(response);
    if (!target) {
      if (responseKey) {
        handledResponseKeysRef.current.add(responseKey);
      }
      clearLastNotificationResponse();
      return;
    }

    if (!authenticatedRef.current || !navigationReadyRef.current) {
      pendingResponseRef.current = response;
      return;
    }

    const refreshKey = responseKey || String(Date.now());
    if (target === 'teams' && navigateToTeamsFromNotification(refreshKey)) {
      if (responseKey) {
        handledResponseKeysRef.current.add(responseKey);
      }
      pendingResponseRef.current = null;
      clearLastNotificationResponse();
    }
  }, []);

  useEffect(() => {
    updateFcmDiagnostics('MANAGER_MOUNTED', { managerMounted: 'Yes' });

    return () => {
      updateFcmDiagnostics('MANAGER_UNMOUNTED', { managerMounted: 'No' });
    };
  }, []);

  useEffect(() => {
    authenticatedRef.current = isAuthenticated;
    const previousSessionToken = sessionTokenRef.current;
    const nextSessionToken = isAuthenticated ? String(token || '').trim() : '';
    sessionTokenRef.current = nextSessionToken;
    navigationReadyRef.current = navigationReady;

    if (previousSessionToken !== nextSessionToken) {
      resetDeviceRegistrationState();
    }

    updateFcmDiagnostics(
      isAuthenticated ? 'AUTH_SESSION_READY' : 'AUTH_SESSION_UNAVAILABLE',
      {
        employeeAuthenticated: isAuthenticated ? 'Yes' : 'No',
        jwtAvailable: nextSessionToken ? 'Yes' : 'No',
      }
    );

    if (previousAuthenticatedRef.current && !isAuthenticated) {
      pendingResponseRef.current = null;
      handledResponseKeysRef.current.clear();
      clearLastNotificationResponse();
    }

    previousAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated && navigationReady && pendingResponseRef.current) {
      handleResponse(pendingResponseRef.current);
    }

    if (nextSessionToken) {
      registerForSession(nextSessionToken);
    }
  }, [handleResponse, isAuthenticated, navigationReady, registerForSession, token]);

  useEffect(() => {
    const tokenSubscription = addNativePushTokenListener((nativeToken) => {
      const currentSessionToken = sessionTokenRef.current;
      if (currentSessionToken) {
        registerCurrentDevice(nativeToken, currentSessionToken);
      }
    });
    const foregroundSubscription = addForegroundNotificationListener();
    const responseSubscription = addNotificationResponseListener(handleResponse);

    getLastNotificationResponse()
      .then(handleResponse)
      .catch(() => {});

    return () => {
      tokenSubscription.remove();
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }, [handleResponse, registerCurrentDevice]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && sessionTokenRef.current) {
        registerForSession(sessionTokenRef.current);
      }
    });

    return () => subscription.remove();
  }, [registerForSession]);

  return <FcmRegistrationDiagnosticsPanel />;
}
