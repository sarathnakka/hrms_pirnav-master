import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'pirnav_access_token';
const USER_KEY = 'pirnav_user';
const LOGIN_TIME_KEY = 'pirnav_login_time';

export const SESSION_TIMEOUT_MS = 105 * 60 * 1000;

function normalizeToken(token) {
  return typeof token === 'string' ? token.trim() : '';
}

export function getSessionExpiryTime(session) {
  const loginTime = Number(session?.loginTime);

  if (!Number.isFinite(loginTime) || loginTime <= 0) {
    return null;
  }

  return loginTime + SESSION_TIMEOUT_MS;
}

export function isSessionExpired(session, now = Date.now()) {
  const expiryTime = getSessionExpiryTime(session);

  if (!expiryTime) {
    return true;
  }

  return now >= expiryTime;
}

export async function saveUserSession(token, user = {}) {
  const accessToken = normalizeToken(token);

  if (!accessToken) {
    throw new Error('Cannot save an authenticated session without an access token.');
  }

  try {
    const loginTime = Date.now();
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user || {}));
    await SecureStore.setItemAsync(LOGIN_TIME_KEY, String(loginTime));
    return { token: accessToken, user: user || {}, loginTime };
  } catch {
    throw new Error('Unable to save your secure session. Please try signing in again.');
  }
}

export async function getUserSession() {
  try {
    const token = normalizeToken(await SecureStore.getItemAsync(TOKEN_KEY));
    const userJson = await SecureStore.getItemAsync(USER_KEY);
    const loginTimeValue = await SecureStore.getItemAsync(LOGIN_TIME_KEY);
    const loginTime = Number(loginTimeValue);

    if (!token) {
      return { token: null, user: null, loginTime: null };
    }

    let user = {};
    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch {
        user = {};
      }
    }

    return {
      token,
      user,
      loginTime: Number.isFinite(loginTime) && loginTime > 0 ? loginTime : null,
    };
  } catch {
    return { token: null, user: null, loginTime: null };
  }
}

export async function clearUserSession() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(LOGIN_TIME_KEY);
    return true;
  } catch {
    throw new Error('Unable to clear your secure session. Please try again.');
  }
}
