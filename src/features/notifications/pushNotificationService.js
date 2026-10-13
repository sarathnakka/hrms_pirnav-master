import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const HRMS_NOTIFICATION_CHANNEL_ID = 'hrms_updates';

const notificationRefreshListeners = new Set();
let currentNativePushToken = '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function normalizeToken(token) {
  return typeof token?.data === 'string' ? token.data.trim() : '';
}

function diagnosticsEnabled() {
  return String(process.env.EXPO_PUBLIC_FCM_TOKEN_DIAGNOSTICS || '').toLowerCase() === 'true';
}

export function acceptNativePushToken(token) {
  const value = normalizeToken(token);
  if (!value || value === currentNativePushToken) {
    return currentNativePushToken;
  }

  currentNativePushToken = value;

  if (diagnosticsEnabled()) {
    console.info(`[PIRNAV FCM Test Token] ${value}`);
  } else if (__DEV__) {
    console.info('[PIRNAV FCM] Native Android token is available.');
  }

  return value;
}

export function getCurrentNativePushToken() {
  return currentNativePushToken;
}

export async function initializeAndroidPushNotifications() {
  if (Platform.OS !== 'android') {
    return { status: 'unsupported', token: '' };
  }

  await Notifications.setNotificationChannelAsync(HRMS_NOTIFICATION_CHANNEL_ID, {
    name: 'HRMS Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#007A8C',
  });

  const existingPermission = await Notifications.getPermissionsAsync();
  let permission = existingPermission;

  if (existingPermission.status === 'undetermined') {
    permission = await Notifications.requestPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    return { status: permission.status || 'denied', token: '' };
  }

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  return {
    status: 'granted',
    token: acceptNativePushToken(devicePushToken),
  };
}

export function addNativePushTokenListener(listener) {
  return Notifications.addPushTokenListener((token) => {
    const value = acceptNativePushToken(token);
    if (value) {
      listener?.(value, token);
    }
  });
}

export function addForegroundNotificationListener(listener) {
  return Notifications.addNotificationReceivedListener((notification) => {
    notificationRefreshListeners.forEach((refreshListener) => refreshListener());
    listener?.(notification);
  });
}

export function addNotificationResponseListener(listener) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function addNotificationRefreshListener(listener) {
  notificationRefreshListeners.add(listener);
  return () => notificationRefreshListeners.delete(listener);
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
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearLastNotificationResponse() {
  try {
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // Clearing stale navigation state must never affect normal app startup.
  }
}
