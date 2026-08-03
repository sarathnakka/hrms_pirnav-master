let sessionTimerId = null;
let sessionExpiryInProgress = false;
let registeredExpiryHandler = null;

export function registerSessionExpiryHandler(handler) {
  registeredExpiryHandler = typeof handler === 'function' ? handler : null;
}

export function unregisterSessionExpiryHandler(handler) {
  if (!handler || registeredExpiryHandler === handler) {
    registeredExpiryHandler = null;
  }
}

export function resetSessionExpiryGuard() {
  sessionExpiryInProgress = false;
}

export function clearSessionTimer() {
  if (sessionTimerId) {
    clearTimeout(sessionTimerId);
    sessionTimerId = null;
  }
}

export function notifySessionExpired(reason = 'expired') {
  if (sessionExpiryInProgress) return;

  sessionExpiryInProgress = true;
  clearSessionTimer();

  if (registeredExpiryHandler) {
    registeredExpiryHandler(reason);
  }
}

export function startSessionTimer(session, getSessionExpiryTime) {
  clearSessionTimer();
  sessionExpiryInProgress = false;

  if (typeof getSessionExpiryTime !== 'function') {
    notifySessionExpired('expired');
    return;
  }

  const expiryTime = getSessionExpiryTime(session);
  const remainingMs = expiryTime ? expiryTime - Date.now() : 0;

  if (remainingMs <= 0) {
    notifySessionExpired('expired');
    return;
  }

  sessionTimerId = setTimeout(() => {
    notifySessionExpired('expired');
  }, remainingMs);
}
