import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'pirnav_access_token';
const USER_KEY = 'pirnav_user';

function normalizeToken(token) {
  return typeof token === 'string' ? token.trim() : '';
}

export async function saveUserSession(token, user = {}) {
  const accessToken = normalizeToken(token);

  if (!accessToken) {
    throw new Error('Cannot save an authenticated session without an access token.');
  }

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user || {}));
    return true;
  } catch {
    throw new Error('Unable to save your secure session. Please try signing in again.');
  }
}

export async function getUserSession() {
  try {
    const token = normalizeToken(await SecureStore.getItemAsync(TOKEN_KEY));
    const userJson = await SecureStore.getItemAsync(USER_KEY);

    if (!token) {
      return { token: null, user: null };
    }

    let user = {};
    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch {
        user = {};
      }
    }

    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export async function clearUserSession() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    return true;
  } catch {
    throw new Error('Unable to clear your secure session. Please try again.');
  }
}
