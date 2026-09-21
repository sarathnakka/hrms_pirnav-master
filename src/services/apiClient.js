import { environment } from '../config/environment';
import { getUserSession, isSessionExpired } from '../features/auth/authStorage';
import { notifySessionExpired } from '../features/auth/sessionManager';

const DEFAULT_TIMEOUT_MS = 20000;

function buildUrl(endpoint) {
  if (!endpoint.startsWith('/')) {
    throw new Error(`API endpoint must be relative and start with "/": ${endpoint}`);
  }

  return `${environment.apiBaseUrl}${endpoint}`;
}

export function buildApiUrl(endpoint) {
  return buildUrl(endpoint);
}

function extractErrorMessage(data, fallback) {
  if (typeof data === 'string' && data.trim()) return data;
  return (
    data?.message ||
    data?.title ||
    data?.error ||
    data?.detail ||
    data?.errors?.[0]?.message ||
    fallback
  );
}

async function parseResponse(response) {
  const responseText = await response.text();
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function createSessionExpiredError() {
  const error = new Error('Your session has expired. Please sign in again.');
  error.status = 401;
  error.code = 'SESSION_EXPIRED';
  return error;
}

async function request(
  endpoint,
  {
    method = 'GET',
    body,
    token,
    headers,
    timeout = DEFAULT_TIMEOUT_MS,
    signal,
    skipAuth = false,
    requiresAuth = true,
    isPublic = false,
  } = {}
) {
  const shouldValidateSession = Boolean(token) && requiresAuth !== false && !skipAuth && !isPublic;

  if (shouldValidateSession) {
    const session = await getUserSession();

    if (!session.token || isSessionExpired(session)) {
      notifySessionExpired('expired');
      throw createSessionExpiredError();
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const abortRequest = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else if (signal?.addEventListener) {
    signal.addEventListener('abort', abortRequest);
  }

  const requestHeaders = {
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...headers,
  };

  const hasBody = body !== undefined && body !== null;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (hasBody && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(buildUrl(endpoint), {
      method,
      headers: requestHeaders,
      body: hasBody ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      if (response.status === 401 && shouldValidateSession) {
        notifySessionExpired('unauthorized');
        throw createSessionExpiredError();
      }

      const error = new Error(
        extractErrorMessage(data, 'Request failed. Please try again.')
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(
        'Request timed out before a server response was received.'
      );
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.isOutcomeUnknown = method !== 'GET';
      throw timeoutError;
    }

    if (!error.status && error.message === 'Network request failed') {
      const networkError = new Error(
        'Network connection was lost before a server response was received.'
      );
      networkError.code = 'NETWORK_ERROR';
      networkError.isOutcomeUnknown = method !== 'GET';
      throw networkError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal?.removeEventListener) {
      signal.removeEventListener('abort', abortRequest);
    }
  }
}

export const apiClient = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
  buildUrl: buildApiUrl,
};
