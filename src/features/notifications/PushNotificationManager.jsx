import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  isAuthenticatedNavigationReady,
  isTeamsNotificationDestinationFocused,
  navigateToTeamsFromNotification,
} from '../../app/navigation/navigationRef';
import { useAuth } from '../auth/AuthContext';
import FcmRegistrationDiagnosticsPanel from './FcmRegistrationDiagnosticsPanel';
import NotificationPermissionOnboardingCard from './NotificationPermissionOnboardingCard';
import { updateFcmDiagnostics } from './fcmRegistrationDiagnostics';
import {
  addForegroundNotificationListener,
  addNotificationPermissionListener,
  addNativePushTokenListener,
  addNotificationResponseListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  getNotificationResponseKey,
  getNotificationRoutingInfo,
  getNotificationTimingInfo,
  initializeAndroidPushNotifications,
  registerDeviceToken,
  resetDeviceRegistrationState,
} from './pushNotificationService';

export default function PushNotificationManager({
  navigationReady,
  navigationStateVersion,
}) {
  const { isAuthenticated, token } = useAuth();
  const authenticatedRef = useRef(isAuthenticated);
  const sessionTokenRef = useRef(token || '');
  const navigationReadyRef = useRef(navigationReady);
  const previousAuthenticatedRef = useRef(isAuthenticated);
  const pendingNavigationRef = useRef(null);
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

  const finishPendingNavigation = useCallback((responseKey) => {
    if (responseKey) {
      handledResponseKeysRef.current.add(responseKey);
    }
    pendingNavigationRef.current = null;
    updateFcmDiagnostics('NOTIFICATION_NAVIGATION_SUCCEEDED', {
      navigationStatus: 'Teams focused',
    });
    clearLastNotificationResponse();
  }, []);

  const processPendingNavigation = useCallback(() => {
    const pending = pendingNavigationRef.current;
    if (!pending) return;

    if (!authenticatedRef.current) {
      updateFcmDiagnostics('WAITING_FOR_AUTH', {
        navigationStatus: 'Waiting for authentication',
      });
      return;
    }

    if (
      !navigationReadyRef.current ||
      !isAuthenticatedNavigationReady()
    ) {
      updateFcmDiagnostics('WAITING_FOR_NAVIGATION', {
        navigationStatus: 'Waiting for authenticated navigator',
      });
      return;
    }

    if (pending.navigationStarted) {
      if (isTeamsNotificationDestinationFocused()) {
        finishPendingNavigation(pending.responseKey);
      }
      return;
    }

    pending.navigationStarted = true;
    updateFcmDiagnostics('NOTIFICATION_NAVIGATION_STARTED', {
      navigationStatus: 'Opening Teams',
    });

    if (!navigateToTeamsFromNotification(pending.refreshKey)) {
      pending.navigationStarted = false;
      updateFcmDiagnostics('WAITING_FOR_NAVIGATION', {
        navigationStatus: 'Authenticated navigator unavailable',
      });
      return;
    }

    if (isTeamsNotificationDestinationFocused()) {
      finishPendingNavigation(pending.responseKey);
    }
  }, [finishPendingNavigation]);

  const handleResponse = useCallback((response) => {
    if (!response?.notification) {
      return;
    }

    const responseKey = getNotificationResponseKey(response);
    const timing = getNotificationTimingInfo(response);
    updateFcmDiagnostics('NOTIFICATION_TAP_RECEIVED', {
      navigationStatus: 'Tap received',
      notificationDelivery: timing.delivery,
      notificationTimeSource: timing.source,
      notificationTimeStatus: timing.status,
    });

    if (responseKey && handledResponseKeysRef.current.has(responseKey)) {
      updateFcmDiagnostics('NOTIFICATION_RESPONSE_ALREADY_HANDLED', {
        navigationStatus: 'Duplicate ignored',
      });
      clearLastNotificationResponse();
      return;
    }

    if (
      responseKey &&
      pendingNavigationRef.current?.responseKey === responseKey
    ) {
      updateFcmDiagnostics('NOTIFICATION_NAVIGATION_QUEUED', {
        navigationStatus: 'Already queued',
      });
      processPendingNavigation();
      return;
    }

    const routing = getNotificationRoutingInfo(response);
    const { target } = routing;
    if (!target) {
      updateFcmDiagnostics('NOTIFICATION_TARGET_UNSUPPORTED', {
        notificationType: routing.type,
        notificationScreen: routing.screen,
        notificationTarget: 'None',
        navigationStatus: 'Ignored safely',
      });
      if (responseKey) {
        handledResponseKeysRef.current.add(responseKey);
      }
      clearLastNotificationResponse();
      return;
    }

    updateFcmDiagnostics('NOTIFICATION_TARGET_RECOGNIZED', {
      notificationType: routing.type,
      notificationScreen: routing.screen,
      notificationTarget: 'Teams',
    });

    if (!authenticatedRef.current) {
      updateFcmDiagnostics('WAITING_FOR_AUTH', {
        navigationStatus: 'Login required; tap discarded',
      });
      if (responseKey) {
        handledResponseKeysRef.current.add(responseKey);
      }
      clearLastNotificationResponse();
      return;
    }

    const refreshKey = responseKey || String(Date.now());
    pendingNavigationRef.current = {
      responseKey,
      refreshKey,
      target,
      navigationStarted: false,
    };
    updateFcmDiagnostics('NOTIFICATION_NAVIGATION_QUEUED', {
      navigationStatus: 'Teams queued',
    });
    processPendingNavigation();
  }, [processPendingNavigation]);

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
      pendingNavigationRef.current = null;
      handledResponseKeysRef.current.clear();
      clearLastNotificationResponse();
    }

    previousAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated && navigationReady) {
      processPendingNavigation();
    }

    if (nextSessionToken && navigationReady) {
      registerForSession(nextSessionToken);
    }
  }, [
    isAuthenticated,
    navigationReady,
    processPendingNavigation,
    registerForSession,
    token,
  ]);

  useEffect(() => {
    navigationReadyRef.current = navigationReady;
    processPendingNavigation();
  }, [navigationReady, navigationStateVersion, processPendingNavigation]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const tokenSubscription = addNativePushTokenListener((nativeToken) => {
      const currentSessionToken = sessionTokenRef.current;
      if (currentSessionToken) {
        registerCurrentDevice(nativeToken, currentSessionToken);
      }
    });
    const permissionSubscription = addNotificationPermissionListener((permission) => {
      if (permission.status === 'granted' && sessionTokenRef.current) {
        registerForSession(sessionTokenRef.current);
      }
    });
    const foregroundSubscription = addForegroundNotificationListener((notification) => {
      const timing = getNotificationTimingInfo(notification);
      updateFcmDiagnostics('FOREGROUND_NOTIFICATION_RECEIVED', {
        notificationDelivery: timing.delivery,
        notificationTimeSource: timing.source,
        notificationTimeStatus: timing.status,
      });
    });
    const responseSubscription = addNotificationResponseListener(handleResponse);

    getLastNotificationResponse()
      .then(handleResponse)
      .catch(() => {});

    return () => {
      tokenSubscription.remove();
      permissionSubscription.remove();
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }, [handleResponse, isAuthenticated, registerCurrentDevice, registerForSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && sessionTokenRef.current) {
        registerForSession(sessionTokenRef.current);
      }
    });

    return () => subscription.remove();
  }, [registerForSession]);

  return (
    <>
      {isAuthenticated ? <NotificationPermissionOnboardingCard /> : null}
      <FcmRegistrationDiagnosticsPanel />
    </>
  );
}
