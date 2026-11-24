import { Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { apiClient } from '../../services/apiClient';
import {
  resetFcmDiagnostics,
  updateFcmDiagnostics,
} from './fcmRegistrationDiagnostics';
import { NATIVE_FCM_PUSH_ENABLED } from './nativePushConfig';
import { emitNotificationRefresh } from './notificationRefreshEvents';
import {
  getNotificationOnboardingDecision,
  isLegacyNotificationOnboardingPresented,
  NOTIFICATION_ONBOARDING_ACTIONS,
} from './notificationPermissionPolicy';

export const HRMS_NOTIFICATION_CHANNEL_ID = 'hrms_updates';

export {
  getNotificationResponseKey,
  getNotificationRoutingInfo,
  getNotificationTimingInfo,
} from './notificationRouting';

const DEVICE_REGISTRATION_ENDPOINT = '/api/user-notifications/devices';
const DEVICE_UNREGISTRATION_TIMEOUT_MS = 8000;
const INSTALLATION_ID_KEY = 'peoplehrsync_installation_id';
const NOTIFICATION_PERMISSION_ONBOARDING_KEY =
  'peoplehrsync_notification_permission_onboarding_v1';
const NOTIFICATION_ONBOARDING_CAMPAIGN = 'peoplehrsync-fcm-launch-v1';
const NOTIFICATION_ONBOARDING_CAMPAIGN_KEY =
  'peoplehrsync_notification_onboarding_campaign';

const pendingRegistrations = [];
const permissionListeners = new Set();
let notificationsModule = null;
let notificationHandlerConfigured = false;
let currentNativePushToken = '';
let installationIdPromise = null;
let registrationQueue = Promise.resolve();
let registrationGeneration = 0;
let registeredDeviceToken = '';
let registeredSessionToken = '';
let blockedRegistrationSessionToken = '';
let legacyNotificationOnboardingPresented = null;
let notificationRolloutState = null;
let notificationRolloutStateLoaded = false;
let notificationPermissionPromptAttemptedThisRuntime = false;
let notificationPermissionRequestPromise = null;
let notificationPermissionSnapshot = {
  status: 'unknown',
  granted: false,
  canAskAgain: false,
  legacyOnboardingPresented: false,
  rolloutState: '',
  upgradeOnboardingEligible: false,
  upgradeOnboardingOffered: false,
  showUpgradeOnboarding: false,
  onboardingReason: 'not-evaluated',
};

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

function publishNotificationPermission(permission) {
  const rawStatus = normalizeString(permission?.status).toLowerCase() || 'unknown';
  const granted = permission?.granted === true || rawStatus === 'granted';
  const status = granted ? 'granted' : rawStatus;
  const nextSnapshot = {
    ...notificationPermissionSnapshot,
    status,
    granted,
    canAskAgain: permission?.canAskAgain === true,
  };
  const permissionWasGranted = notificationPermissionSnapshot.status === 'granted';

  notificationPermissionSnapshot = nextSnapshot;

  if (status !== 'granted' && permissionWasGranted) {
    // A later grant must POST again even when the native token itself did not rotate.
    registrationGeneration += 1;
    registeredDeviceToken = '';
    registeredSessionToken = '';
    pendingRegistrations.length = 0;
  }

  permissionListeners.forEach((listener) => listener());
  return nextSnapshot;
}

function publishNotificationOnboarding(values) {
  notificationPermissionSnapshot = {
    ...notificationPermissionSnapshot,
    ...values,
  };
  permissionListeners.forEach((listener) => listener());
  return notificationPermissionSnapshot;
}

async function getLegacyNotificationOnboardingPresented() {
  if (legacyNotificationOnboardingPresented !== null) {
    return legacyNotificationOnboardingPresented;
  }

  try {
    const storedValue = await SecureStore.getItemAsync(
      NOTIFICATION_PERMISSION_ONBOARDING_KEY
    );
    legacyNotificationOnboardingPresented =
      isLegacyNotificationOnboardingPresented(storedValue);
  } catch {
    legacyNotificationOnboardingPresented = false;
  }

  return legacyNotificationOnboardingPresented;
}

async function getNotificationRolloutState() {
  if (notificationRolloutStateLoaded) {
    return notificationRolloutState || '';
  }

  notificationRolloutStateLoaded = true;

  try {
    const storedValue = normalizeString(
      await SecureStore.getItemAsync(NOTIFICATION_ONBOARDING_CAMPAIGN_KEY)
    );
    const parsed = storedValue ? JSON.parse(storedValue) : null;
    notificationRolloutState =
      parsed?.campaign === NOTIFICATION_ONBOARDING_CAMPAIGN
        ? normalizeString(parsed?.state).toLowerCase()
        : '';
  } catch {
    notificationRolloutState = '';
  }

  return notificationRolloutState;
}

async function setNotificationRolloutState(state) {
  const normalizedState = normalizeString(state).toLowerCase();
  notificationRolloutState = normalizedState;
  notificationRolloutStateLoaded = true;

  try {
    await SecureStore.setItemAsync(
      NOTIFICATION_ONBOARDING_CAMPAIGN_KEY,
      JSON.stringify({
        campaign: NOTIFICATION_ONBOARDING_CAMPAIGN,
        state: normalizedState,
      })
    );
  } catch {
    // Runtime state still prevents repeated onboarding during this app session.
  }

  publishNotificationOnboarding({
    rolloutState: normalizedState,
    upgradeOnboardingEligible: false,
    showUpgradeOnboarding: false,
  });
}

async function requestNotificationPermissionSingleFlight(Notifications) {
  if (!notificationPermissionRequestPromise) {
    notificationPermissionRequestPromise = Notifications.requestPermissionsAsync()
      .finally(() => {
        notificationPermissionRequestPromise = null;
      });
  }

  return notificationPermissionRequestPromise;
}

export function getNotificationPermissionSnapshot() {
  return notificationPermissionSnapshot;
}

export function subscribeToNotificationPermission(listener) {
  permissionListeners.add(listener);
  return () => permissionListeners.delete(listener);
}

export function addNotificationPermissionListener(listener) {
  const wrappedListener = () => listener?.(notificationPermissionSnapshot);
  permissionListeners.add(wrappedListener);
  return { remove: () => permissionListeners.delete(wrappedListener) };
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

async function getStoredInstallationId() {
  return normalizeString(await SecureStore.getItemAsync(INSTALLATION_ID_KEY));
}

async function getInstallationId() {
  if (!installationIdPromise) {
    installationIdPromise = (async () => {
      const storedInstallationId = await getStoredInstallationId();

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
  blockedRegistrationSessionToken = '';
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

  if (notificationPermissionSnapshot.status !== 'granted') {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Notification permission not granted',
      backendRegistration: 'Not attempted',
    });
    return Promise.resolve({ status: 'skipped', reason: 'permission-not-granted' });
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

  if (authenticatedToken === blockedRegistrationSessionToken) {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      registrationSkipped: 'Session is signing out',
      backendRegistration: 'Not attempted',
    });
    return Promise.resolve({ status: 'skipped', reason: 'session-signing-out' });
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

export function unregisterDeviceToken(sessionToken) {
  const authenticatedToken = normalizeString(sessionToken);

  updateFcmDiagnostics('UNREGISTRATION_REQUESTED', {
    deviceUnregistration: 'Pending',
  });

  if (Platform.OS !== 'android') {
    updateFcmDiagnostics('UNREGISTRATION_SKIPPED', {
      deviceUnregistration: 'Unsupported platform',
    });
    return Promise.resolve({ status: 'unsupported' });
  }

  if (!authenticatedToken) {
    updateFcmDiagnostics('UNREGISTRATION_SKIPPED', {
      deviceUnregistration: 'Missing authenticated JWT',
    });
    return Promise.resolve({ status: 'skipped', reason: 'missing-session-token' });
  }

  // Invalidate queued registrations immediately. The shared queue guarantees that
  // DELETE runs after any POST already in flight and is the final backend mutation.
  registrationGeneration += 1;
  blockedRegistrationSessionToken = authenticatedToken;
  registeredDeviceToken = '';
  registeredSessionToken = '';
  pendingRegistrations.length = 0;

  const runUnregistration = async () => {
    let installationId;

    try {
      installationId = await getStoredInstallationId();
    } catch (error) {
      updateFcmDiagnostics('UNREGISTRATION_STORAGE_ERROR', {
        deviceUnregistration: 'Installation ID storage error',
      });
      throw error;
    }

    if (!installationId) {
      updateFcmDiagnostics('UNREGISTRATION_SKIPPED', {
        deviceUnregistration: 'No registered installation',
      });
      return { status: 'skipped', reason: 'missing-installation-id' };
    }

    const endpoint = `${DEVICE_REGISTRATION_ENDPOINT}/${encodeURIComponent(
      installationId
    )}`;

    try {
      await apiClient.delete(endpoint, {
        token: authenticatedToken,
        timeout: DEVICE_UNREGISTRATION_TIMEOUT_MS,
        onLifecycleEvent: ({ stage, status, url }) => {
          if (stage === 'SESSION_PRECHECK_PASSED') {
            updateFcmDiagnostics(stage, { sessionValidation: 'Passed' });
          } else if (stage === 'SESSION_PRECHECK_REJECTED') {
            updateFcmDiagnostics(stage, {
              sessionValidation: 'Rejected',
              deviceUnregistration: 'Failure (session rejected)',
            });
          } else if (stage === 'HTTP_REQUEST_STARTED') {
            updateFcmDiagnostics('UNREGISTRATION_HTTP_STARTED', {
              apiHost: getSafeHost(url),
              deviceUnregistration: 'Request started',
            });
          } else if (stage === 'HTTP_RESPONSE_RECEIVED') {
            updateFcmDiagnostics('UNREGISTRATION_HTTP_RESPONSE', {
              deviceUnregistration: `HTTP ${status}`,
            });
          }
        },
      });

      updateFcmDiagnostics('UNREGISTRATION_SUCCEEDED', {
        deviceUnregistration: 'Success',
      });

      if (__DEV__) {
        console.info('[PeopleHRSync FCM] Device unregistration succeeded.');
      }

      return { status: 'unregistered' };
    } catch (error) {
      updateFcmDiagnostics('UNREGISTRATION_FAILED', {
        deviceUnregistration: `Failure (${getSafeHttpFailure(error)})`,
      });

      if (__DEV__) {
        console.warn('[PeopleHRSync FCM] Device unregistration failed.', {
          status: error?.status || null,
          code: error?.code || null,
        });
      }

      throw error;
    }
  };

  const unregistrationPromise = registrationQueue
    .catch(() => {})
    .then(runUnregistration);

  registrationQueue = unregistrationPromise.then(
    () => undefined,
    () => undefined
  );

  return unregistrationPromise;
}

async function ensureAndroidNotificationChannel(Notifications) {
  await Notifications.setNotificationChannelAsync(HRMS_NOTIFICATION_CHANNEL_ID, {
    name: 'PeopleHRSync Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#087BAE',
  });

  updateFcmDiagnostics('NOTIFICATION_CHANNEL_READY', {
    osApiLevel: String(Platform.Version),
    fcmBuildFlag: NATIVE_FCM_PUSH_ENABLED ? 'Enabled' : 'Disabled',
    notificationChannel: 'Ready',
  });
}

export async function refreshAndroidNotificationPermission() {
  if (Platform.OS !== 'android') {
    return publishNotificationPermission({
      status: 'unsupported',
      canAskAgain: false,
    });
  }

  const Notifications = getNotificationsModule();
  const permission = await Notifications.getPermissionsAsync();
  const snapshot = publishNotificationPermission(permission);
  updateFcmDiagnostics('FCM_PERMISSION_CHECKED', {
    permission: snapshot.status,
    permissionGranted: snapshot.granted ? 'Yes' : 'No',
    permissionCanAskAgain: snapshot.canAskAgain ? 'Yes' : 'No',
  });
  return snapshot;
}

export async function openAndroidNotificationSettings() {
  if (Platform.OS !== 'android') {
    return false;
  }

  await Linking.openSettings();
  return true;
}

export async function requestAndroidNotificationPermission() {
  const result = await initializeAndroidPushNotifications({ userInitiated: true });
  if (result?.requiresSettings) {
    await openAndroidNotificationSettings();
  }
  return result;
}

export function markUpgradeNotificationOnboardingOffered() {
  if (!notificationPermissionSnapshot.showUpgradeOnboarding) {
    return;
  }

  publishNotificationOnboarding({ upgradeOnboardingOffered: true });
  updateFcmDiagnostics('UPGRADE_ONBOARDING_OFFERED', {
    upgradeOnboardingOffered: 'Yes',
  });
}

export async function dismissNotificationPermissionOnboarding() {
  await setNotificationRolloutState('dismissed');
  updateFcmDiagnostics('UPGRADE_ONBOARDING_DISMISSED', {
    rolloutOnboardingState: 'Dismissed',
    upgradeOnboardingEligible: 'No',
    upgradeOnboardingOffered: 'Yes',
  });
}

export async function initializeAndroidPushNotifications({ userInitiated = false } = {}) {
  if (Platform.OS !== 'android') {
    updateFcmDiagnostics('REGISTRATION_SKIPPED', {
      permission: 'Unsupported platform',
      registrationSkipped: 'Unsupported platform',
    });
    return { status: 'unsupported', token: '' };
  }

  const Notifications = getNotificationsModule();
  await ensureAndroidNotificationChannel(Notifications);

  const existingPermission = await Notifications.getPermissionsAsync();
  let permissionSnapshot = publishNotificationPermission(existingPermission);
  const [legacyOnboardingPresented, rolloutState] = await Promise.all([
    getLegacyNotificationOnboardingPresented(),
    getNotificationRolloutState(),
  ]);

  const onboardingDecision = getNotificationOnboardingDecision({
    granted: permissionSnapshot.granted,
    canAskAgain: permissionSnapshot.canAskAgain,
    legacyOnboardingPresented,
    rolloutState,
    promptAttemptedThisRuntime: notificationPermissionPromptAttemptedThisRuntime,
    userInitiated,
  });

  const upgradeOnboardingEligible =
    onboardingDecision.action === NOTIFICATION_ONBOARDING_ACTIONS.OFFER_UPGRADE;

  permissionSnapshot = publishNotificationOnboarding({
    legacyOnboardingPresented,
    rolloutState,
    upgradeOnboardingEligible,
    upgradeOnboardingOffered: upgradeOnboardingEligible
      ? notificationPermissionSnapshot.upgradeOnboardingOffered
      : false,
    showUpgradeOnboarding: upgradeOnboardingEligible,
    onboardingReason: onboardingDecision.reason,
  });

  updateFcmDiagnostics('FCM_PERMISSION_CHECKED', {
    permission: permissionSnapshot.status,
    permissionGranted: permissionSnapshot.granted ? 'Yes' : 'No',
    permissionCanAskAgain: permissionSnapshot.canAskAgain ? 'Yes' : 'No',
    permissionOnboardingPresented: legacyOnboardingPresented ? 'Yes' : 'No',
    legacyOnboardingState: legacyOnboardingPresented ? 'Presented (ambiguous)' : 'Not present',
    rolloutOnboardingState: rolloutState || 'Not handled',
    upgradeOnboardingEligible: upgradeOnboardingEligible ? 'Yes' : 'No',
    upgradeOnboardingOffered: permissionSnapshot.upgradeOnboardingOffered ? 'Yes' : 'No',
    onboardingDecision: onboardingDecision.reason,
  });

  if (
    onboardingDecision.action ===
    NOTIFICATION_ONBOARDING_ACTIONS.REQUEST_PERMISSION
  ) {
    notificationPermissionPromptAttemptedThisRuntime = true;
    updateFcmDiagnostics('FCM_PERMISSION_PROMPT_REQUESTED', {
      permissionPromptAttempted: 'Yes',
      permissionRequestTriggered: 'Yes',
      permissionPromptResult: 'Awaiting response',
      permissionRequestResult: 'Awaiting response',
    });

    let requestedPermission;
    try {
      requestedPermission = await requestNotificationPermissionSingleFlight(
        Notifications
      );
    } catch (error) {
      publishNotificationOnboarding({
        upgradeOnboardingEligible: true,
        showUpgradeOnboarding: true,
        onboardingReason: 'permission-request-failed',
      });
      updateFcmDiagnostics('FCM_PERMISSION_PROMPT_FAILED', {
        permissionPromptResult: 'Request failed',
        permissionRequestResult: 'Request failed',
        upgradeOnboardingEligible: 'Yes',
      });
      throw error;
    }

    permissionSnapshot = publishNotificationPermission(requestedPermission);
    const requestResultState = permissionSnapshot.granted ? 'granted' : 'denied';
    await setNotificationRolloutState(requestResultState);
    permissionSnapshot = getNotificationPermissionSnapshot();
    updateFcmDiagnostics('FCM_PERMISSION_PROMPT_COMPLETED', {
      permission: permissionSnapshot.status,
      permissionGranted: permissionSnapshot.granted ? 'Yes' : 'No',
      permissionCanAskAgain: permissionSnapshot.canAskAgain ? 'Yes' : 'No',
      permissionOnboardingPresented: 'Yes',
      permissionPromptResult: permissionSnapshot.granted ? 'Granted' : 'Denied',
      permissionRequestResult: permissionSnapshot.granted ? 'Granted' : 'Denied',
      rolloutOnboardingState: permissionSnapshot.granted ? 'Granted' : 'Denied',
      upgradeOnboardingEligible: 'No',
    });
  } else if (
    onboardingDecision.action === NOTIFICATION_ONBOARDING_ACTIONS.REGISTER
  ) {
    if (rolloutState !== 'granted') {
      await setNotificationRolloutState('granted');
      permissionSnapshot = getNotificationPermissionSnapshot();
    }
    updateFcmDiagnostics('FCM_PERMISSION_PROMPT_SKIPPED', {
      permissionPromptAttempted: 'No',
      permissionRequestTriggered: 'No',
      permissionPromptResult: 'Already granted',
      permissionRequestResult: 'Already granted',
      rolloutOnboardingState: 'Granted',
      upgradeOnboardingEligible: 'No',
    });
  } else if (
    onboardingDecision.action === NOTIFICATION_ONBOARDING_ACTIONS.OFFER_UPGRADE
  ) {
    updateFcmDiagnostics('UPGRADE_ONBOARDING_ELIGIBLE', {
      permissionPromptAttempted: 'No',
      permissionRequestTriggered: 'No',
      permissionPromptResult: 'Waiting for employee action',
      permissionRequestResult: 'Not attempted',
      upgradeOnboardingEligible: 'Yes',
      upgradeOnboardingOffered: permissionSnapshot.upgradeOnboardingOffered
        ? 'Yes'
        : 'No',
    });
  } else if (
    onboardingDecision.action === NOTIFICATION_ONBOARDING_ACTIONS.OPEN_SETTINGS
  ) {
    publishNotificationOnboarding({
      upgradeOnboardingEligible: true,
      showUpgradeOnboarding: true,
      onboardingReason: 'os-cannot-ask-again',
    });
    updateFcmDiagnostics('NOTIFICATION_SETTINGS_REQUIRED', {
      permissionPromptAttempted: 'No',
      permissionRequestTriggered: 'No',
      permissionPromptResult: 'Android Settings required',
      permissionRequestResult: 'Android Settings required',
      upgradeOnboardingEligible: 'Yes',
    });
  } else {
    updateFcmDiagnostics('FCM_PERMISSION_PROMPT_SKIPPED', {
      permissionPromptAttempted: 'No',
      permissionRequestTriggered: 'No',
      permissionPromptResult: onboardingDecision.reason,
      permissionRequestResult: 'Not attempted',
    });
  }

  if (!permissionSnapshot.granted) {
    updateFcmDiagnostics('FCM_PERMISSION_DENIED', {
      permission: permissionSnapshot.status,
      nativeToken: 'Unavailable',
      registrationSkipped: 'Notification permission not granted',
      backendRegistration: 'Not attempted',
    });
    return {
      ...permissionSnapshot,
      token: '',
      requiresSettings:
        onboardingDecision.action ===
        NOTIFICATION_ONBOARDING_ACTIONS.OPEN_SETTINGS,
    };
  }

  updateFcmDiagnostics('FCM_PERMISSION_GRANTED', { permission: 'Granted' });

  try {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    const token = acceptNativePushToken(devicePushToken);
    return { ...permissionSnapshot, token };
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
