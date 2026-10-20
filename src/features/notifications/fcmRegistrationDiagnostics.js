import { FCM_REGISTRATION_DIAGNOSTICS_ENABLED } from './nativePushConfig';

const listeners = new Set();

export { FCM_REGISTRATION_DIAGNOSTICS_ENABLED };

const initialSnapshot = {
  managerMounted: 'No',
  employeeAuthenticated: 'No',
  jwtAvailable: 'No',
  permission: 'Undetermined',
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

