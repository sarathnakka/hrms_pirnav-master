import React, { useCallback, useEffect, useRef } from 'react';

import { navigateToTeamsFromNotification } from '../../app/navigation/navigationRef';
import { useAuth } from '../auth/AuthContext';
import {
  addForegroundNotificationListener,
  addNativePushTokenListener,
  addNotificationResponseListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
  getNotificationNavigationTarget,
  getNotificationResponseKey,
  initializeAndroidPushNotifications,
} from './pushNotificationService';

export default function PushNotificationManager({ navigationReady }) {
  const { isAuthenticated } = useAuth();
  const authenticatedRef = useRef(isAuthenticated);
  const navigationReadyRef = useRef(navigationReady);
  const previousAuthenticatedRef = useRef(isAuthenticated);
  const pendingResponseRef = useRef(null);
  const handledResponseKeysRef = useRef(new Set());
  const tokenInitializationStartedRef = useRef(false);

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
    authenticatedRef.current = isAuthenticated;
    navigationReadyRef.current = navigationReady;

    if (previousAuthenticatedRef.current && !isAuthenticated) {
      pendingResponseRef.current = null;
      handledResponseKeysRef.current.clear();
      clearLastNotificationResponse();
    }

    previousAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated && navigationReady && pendingResponseRef.current) {
      handleResponse(pendingResponseRef.current);
    }
  }, [handleResponse, isAuthenticated, navigationReady]);

  useEffect(() => {
    const tokenSubscription = addNativePushTokenListener(() => {
      // Backend registration will be added once its authenticated contract exists.
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
  }, [handleResponse]);

  useEffect(() => {
    if (!isAuthenticated || tokenInitializationStartedRef.current) {
      return;
    }

    tokenInitializationStartedRef.current = true;
    initializeAndroidPushNotifications().catch((error) => {
      if (__DEV__) {
        console.warn('[PIRNAV FCM] Native token initialization failed.', {
          message: error?.message,
        });
      }
    });
  }, [isAuthenticated]);

  return null;
}
