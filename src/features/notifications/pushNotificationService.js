import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { apiClient } from '../../services/apiClient';
import {
  resetFcmDiagnostics,
  updateFcmDiagnostics,
} from './fcmRegistrationDiagnostics';
import { emitNotificationRefresh } from './notificationRefreshEvents';

export const HRMS_NOTIFICATION_CHANNEL_ID = 'hrms_updates';

const DEVICE_REGISTRATION_ENDPOINT = '/api/user-notifications/devices';
const INSTALLATION_ID_KEY = 'peoplehrsync_installation_id';

const pendingRegistrations = [];
let notificationsModule = null;
let notificationHandlerConfigured = false;
let currentNativePushToken = '';
let installationIdPromise = null;
let registrationQueue = Promise.resolve();
let registrationGeneration = 0;
let registeredDeviceToken = '';
let registeredSessionToken = '';

function getNotificationsModule() {
  if (!notificationsModule) {
    notificationsModule = require('expo-notifications');
  }

  if (!notificationHandlerConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  }

  return notificationsModule;
}

function normalizeToken(token) {
  return typeof token?.data === 'string' ? token.data.trim() : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSafeHost(url) {
  const value = normalizeString(url);
  const match = value.match(/^https?:\/\/([^/]+)/i);
  return match?.[1] || 'Invalid configured host';
}

function getSafeHttpFailure(error) {
  if (error?.status) return `HTTP ${error.status}`;
  if (error?.code === 'SESSION_EXPIRED') return 'Session rejected';
  if (error?.code === 'REQUEST_TIMEOUT') return 'Request timeout';
  if (error?.code === 'NETWORK_ERROR') return 'Network error';
  return 'Request error';
}

function createInstallationId() {
  let timestamp = Date.now();
  let performanceTimestamp = Math.floor(globalThis.performance?.now?.() || 0);

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    let random = Math.random() * 16;

    if (timestamp > 0) {
      random = (timestamp + random) % 16;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = (performanceTimestamp + random) % 16;
      performanceTimestamp = Math.floor(performanceTimestamp / 16);
    }

    const value = character === 'x' ? random : (random % 4) + 8;
    return Math.floor(value).toString(16);
  });
}

async function getInstallationId() {
  if (!installationIdPromise) {
    installationIdPromise = (async () => {
      const storedInstallationId = normalizeString(
        await SecureStore.getItemAsync(INSTALLATION_ID_KEY)
      );

      if (storedInstallationId) {
        return storedInstallationId;
      }

      const installationId = createInstallationId();
      await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
      return installationId;
    })().catch((error) => {
      installationIdPromise = null;
      throw error;
    });
  }

  return installationIdPromise;
}

function findPendingRegistration(deviceToken, sessionToken) {
  return pendingRegistrations.find(
    (registration) =>
      registration.deviceToken === deviceToken &&
      registration.sessionToken === sessionToken
  );
}

function removePendingRegistration(registration) {
  const index = pendingRegistrations.indexOf(registration);
  if (index >= 0) {
    pendingRegistrations.splice(index, 1);
  }
}

export function acceptNativePushToken(token) {
  const value = normalizeToken(token);
  if (!value) {
    updateFcmDiagnostics('FCM_TOKEN_UNAVAILABLE', { nativeToken: 'Unavailable' });
    return currentNativePushToken;
  }

  if (value === currentNativePushToken) {
    updateFcmDiagnostics('FCM_TOKEN_AVAILABLE', { nativeToken: 'Available' });
    return currentNativePushToken;
  }

  currentNativePushToken = value;
  updateFcmDiagnostics('FCM_TOKEN_AVAILABLE', { nativeToken: 'Available' });

  if (__DEV__) {
    console.info('[PeopleHRSync FCM] Native Android token is available.');
  }

  return value;
}

export function getCurrentNativePushToken() {
  return currentNativePushToken;
}

export function resetDeviceRegistrationState() {
  registrationGeneration += 1;
  registeredDeviceToken = '';
  registeredSessionToken = '';
  pendingRegistrations.length = 0;
  resetFcmDiagnostics();
}

export function registerDeviceToken(fcmToken, sessionToken) {
  const deviceToken = normalizeString(fcmToken);
  const authenticatedToken = normalizeString(sessionToken);

  updateFcmDiagnostics('REGISTRATION_REQUESTED', {
    registrationTriggered: 'Yes',
    registrationSkipped: 'None',
    backendRegistration: 'Pending',
  });

  if (Platform.OS !== 'android') {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Unsupported platform',
      backendRegistration: 'Not attempted',
    });
    return Promise.resolve({ status: 'unsupported' });
  }

  if (!deviceToken) {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Missing native FCM token',
      nativeToken: 'Unavailable',
      backendRegistration: 'Not attempted',
    });
    return Promise.resolve({ status: 'skipped', reason: 'missing-device-token' });
  }

  if (!authenticatedToken) {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Missing authenticated JWT',
      jwtAvailable: 'No',
      backendRegistration: 'Not attempted',
    });
    return Promise.resolve({ status: 'skipped', reason: 'missing-session-token' });
  }

  if (
    registeredDeviceToken === deviceToken &&
    registeredSessionToken === authenticatedToken
  ) {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Already registered this session',
      backendRegistration: 'Success',
    });
    return Promise.resolve({ status: 'already-registered' });
  }

  const existingRegistration = findPendingRegistration(deviceToken, authenticatedToken);
  if (existingRegistration) {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Registration already in progress',
    });
    return existingRegistration.promise;
  }

  const attemptGeneration = registrationGeneration;
  const registration = {
    deviceToken,
    sessionToken: authenticatedToken,
    promise: null,
  };

  const runRegistration = async () => {
    if (attemptGeneration !== registrationGeneration) {
      updateFcmDiagnostics('REGISTRATION_SKIPPED', {
        registrationSkipped: 'Stale authentication generation',
        backendRegistration: 'Not attempted',
      });
      return { status: 'stale' };
    }

    if (
      registeredDeviceToken === deviceToken &&
      registeredSessionToken === authenticatedToken
    ) {
      updateFcmDiagnostics('REGISTRATION_SKIPPED', {
        registrationSkipped: 'Already registered this session',
        backendRegistration: 'Success',
      });
      return { status: 'already-registered' };
    }

    try {
      let installationId;
      try {
        installationId = await getInstallationId();
        updateFcmDiagnostics('INSTALLATION_ID_AVAILABLE', {
          installationId: 'Available',
        });
      } catch (error) {
        updateFcmDiagnostics('INSTALLATION_ID_ERROR', {
          installationId: 'Storage error',
          backendRegistration: 'Failure',
          httpResult: 'Not attempted',
        });
        throw error;
      }

      if (attemptGeneration !== registrationGeneration) {
        updateFcmDiagnostics('REGISTRATION_SKIPPED', {
          registrationSkipped: 'Session changed before request',
          backendRegistration: 'Not attempted',
        });
        return { status: 'stale' };
      }

      const requestUrl = apiClient.buildUrl(DEVICE_REGISTRATION_ENDPOINT);
      updateFcmDiagnostics('REGISTRATION_REQUESTED', {
        endpoint: DEVICE_REGISTRATION_ENDPOINT,
        apiHost: getSafeHost(requestUrl),
      });

      const response = await apiClient.post(
        DEVICE_REGISTRATION_ENDPOINT,
        {
          installationId,
          platform: 'android',
          provider: 'fcm',
          deviceToken,
        },
        {
          token: authenticatedToken,
          onLifecycleEvent: ({ stage, status, url }) => {
            if (stage === 'SESSION_PRECHECK_PASSED') {
              updateFcmDiagnostics(stage, { sessionValidation: 'Passed' });
            } else if (stage === 'SESSION_PRECHECK_REJECTED') {
              updateFcmDiagnostics(stage, {
                sessionValidation: 'Rejected',
                httpRequestStarted: 'No',
                httpResult: 'Not attempted',
                backendRegistration: 'Failure',
              });
            } else if (stage === 'HTTP_REQUEST_STARTED') {
              updateFcmDiagnostics(stage, {
                httpRequestStarted: 'Yes',
                apiHost: getSafeHost(url),
                httpResult: 'Awaiting response',
              });
            } else if (stage === 'HTTP_RESPONSE_RECEIVED') {
              updateFcmDiagnostics(stage, { httpResult: `HTTP ${status}` });
            }
          },
        }
      );

      if (attemptGeneration !== registrationGeneration) {
        return { status: 'stale', response };
      }

      registeredDeviceToken = deviceToken;
      registeredSessionToken = authenticatedToken;
      updateFcmDiagnostics('REGISTRATION_SUCCEEDED', {
        backendRegistration: 'Success',
        registrationSkipped: 'None',
      });

      if (__DEV__) {
        console.info('[PeopleHRSync FCM] Device registration succeeded.');
      }

      return { status: 'registered', response };
    } catch (error) {
      const result = getSafeHttpFailure(error);
      updateFcmDiagnostics(
        error?.status ? `HTTP_${error.status}` : error?.code || 'REGISTRATION_FAILED',
        {
          httpResult: result,
          backendRegistration: 'Failure',
        }
      );

      if (__DEV__) {
        console.warn('[PeopleHRSync FCM] Device registration failed.', {
          status: error?.status || null,
          code: error?.code || null,
        });
      }

      throw error;
    }
  };

  registration.promise = registrationQueue
    .catch(() => {})
    .then(runRegistration)
    .finally(() => removePendingRegistration(registration));

  pendingRegistrations.push(registration);
  registrationQueue = registration.promise.then(
    () => undefined,
    () => undefined
  );

  return registration.promise;
}

export async function initializeAndroidPushNotifications() {
  if (Platform.OS !== 'android') {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      permission: 'Unsupported platform',
      registrationSkipped: 'Unsupported platform',
    });
    return { status: 'unsupported', token: '' };
  }

  const Notifications = getNotificationsModule();

  await Notifications.setNotificationChannelAsync(HRMS_NOTIFICATION_CHANNEL_ID, {
    name: 'PeopleHRSync Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#087BAE',
  });

  const existingPermission = await Notifications.getPermissionsAsync();
  let permission = existingPermission;
  updateFcmDiagnostics('FCM_PERMISSION_CHECKED', {
    permission: existingPermission.status || 'Undetermined',
  });

  if (existingPermission.status === 'undetermined') {
    permission = await Notifications.requestPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    updateFcmDiagnostics('FCM_PERMISSION_DENIED', {
      permission: permission.status || 'Denied',
      nativeToken: 'Unavailable',
      registrationSkipped: 'Notification permission not granted',
      backendRegistration: 'Not attempted',
    });
    return { status: permission.status || 'denied', token: '' };
  }

  updateFcmDiagnostics('FCM_PERMISSION_GRANTED', { permission: 'Granted' });

  try {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const token = acceptNativePushToken(devicePushToken);
    return { status: 'granted', token };
  } catch (error) {
    updateFcmDiagnostics('FCM_TOKEN_ERROR', {
      nativeToken: 'Unavailable',
      registrationSkipped: 'Native FCM token error',
      backendRegistration: 'Not attempted',
    });
    throw error;
  }
}

export function addNativePushTokenListener(listener) {
  const Notifications = getNotificationsModule();
  return Notifications.addPushTokenListener((token) => {
    const value = acceptNativePushToken(token);
    if (value) {
      listener?.(value, token);
    }
  });
}

export function addForegroundNotificationListener(listener) {
  const Notifications = getNotificationsModule();
  return Notifications.addNotificationReceivedListener((notification) => {
    emitNotificationRefresh();
    listener?.(notification);
  });
}

export function addNotificationResponseListener(listener) {
  const Notifications = getNotificationsModule();
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function getNotificationResponseKey(response) {
  const data = response?.notification?.request?.content?.data || {};
  const notificationId = String(data.notificationId || '').trim();
  const requestId = String(response?.notification?.request?.identifier || '').trim();
  return notificationId || requestId;
}

export function getNotificationNavigationTarget(response) {
  const data = response?.notification?.request?.content?.data || {};
  const type = String(data.type || '').trim().toUpperCase();
  const screen = String(data.screen || '').trim().toLowerCase();

  if (type === 'TEAM_SCHEDULE_UPDATED' || (!type && screen === 'teams')) {
    return 'teams';
  }

  return '';
}

export function getLastNotificationResponse() {
  const Notifications = getNotificationsModule();
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearLastNotificationResponse() {
  try {
    const Notifications = getNotificationsModule();
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Clearing stale navigation state must never affect normal app startup.
  }
}
