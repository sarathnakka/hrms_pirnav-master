import {
  FCM_REGISTRATION_DIAGNOSTICS_ENABLED,
  NATIVE_FCM_PUSH_ENABLED,
} from './nativePushConfig';

const listeners = new Set();

export { FCM_REGISTRATION_DIAGNOSTICS_ENABLED };

const initialSnapshot = {
  managerMounted: 'No',
  employeeAuthenticated: 'No',
  jwtAvailable: 'No',
  osApiLevel: 'Unavailable',
  fcmBuildFlag: NATIVE_FCM_PUSH_ENABLED ? 'Enabled' : 'Disabled',
  notificationChannel: 'Pending',
  permission: 'Undetermined',
  permissionGranted: 'No',
  permissionCanAskAgain: 'Unknown',
  permissionOnboardingPresented: 'Unknown',
  legacyOnboardingState: 'Unknown',
  rolloutOnboardingState: 'Not evaluated',
  upgradeOnboardingEligible: 'No',
  upgradeOnboardingOffered: 'No',
  onboardingDecision: 'Not evaluated',
  permissionPromptAttempted: 'No',
  permissionPromptResult: 'Not attempted',
  permissionRequestTriggered: 'No',
  permissionRequestResult: 'Not attempted',
  nativeToken: 'Unavailable',
  installationId: 'Pending',
  registrationTriggered: 'No',
  registrationSkipped: 'None',
  sessionValidation: 'Pending',
  httpRequestStarted: 'No',
  endpoint: '/api/user-notifications/devices',
  apiHost: 'Unavailable',
  httpResult: 'Pending',
  backendRegistration: 'Pending',
  deviceUnregistration: 'Not requested',
  notificationType: 'Unavailable',
  notificationScreen: 'Unavailable',
  notificationTarget: 'None',
  navigationStatus: 'Not requested',
  notificationDelivery: 'Not inspected',
  notificationTimeSource: 'Unavailable',
  notificationTimeStatus: 'Not inspected',
  lastStage: 'WAITING',
};

let snapshot = initialSnapshot;

export function getFcmDiagnosticsSnapshot() {
  return snapshot;
}

export function subscribeToFcmDiagnostics(listener) {
  if (!FCM_REGISTRATION_DIAGNOSTICS_ENABLED) {
    return () => {};
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateFcmDiagnostics(stage, values = {}) {
  if (!FCM_REGISTRATION_DIAGNOSTICS_ENABLED) {
    return;
  }

  snapshot = {
    ...snapshot,
    ...values,
    lastStage: stage || snapshot.lastStage,
  };

  listeners.forEach((listener) => listener());
}

export function resetFcmDiagnostics() {
  if (!FCM_REGISTRATION_DIAGNOSTICS_ENABLED) {
    return;
  }

  snapshot = {
    ...initialSnapshot,
    managerMounted: snapshot.managerMounted,
  };
  listeners.forEach((listener) => listener());
}

