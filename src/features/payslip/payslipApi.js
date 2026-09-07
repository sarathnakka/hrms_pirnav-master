import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, buildApiUrl } from '../../services/apiClient';
import { notifySessionExpired } from '../auth/sessionManager';

const PAYSLIP_ENDPOINTS = {
  mine: '/api/PaySlip/my',
  preview: (id) => `/api/PaySlip/preview/${encodeURIComponent(id)}`,
  download: (id) => `/api/PaySlip/download/${encodeURIComponent(id)}`,
};

function assertPayslipId(id) {
  if (id === undefined || id === null || (typeof id === 'string' && !id.trim())) {
    throw new Error('Payslip is not available for this record.');
  }
}

function getHeader(headers = {}, name) {
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? headers[match] : '';
}

function sanitizeFilename(value, fallback = 'PIRNAV-Payslip.pdf') {
  const cleaned = String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const safe = cleaned || fallback;
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function getDispositionFilename(headers) {
  const disposition = getHeader(headers, 'content-disposition');
  const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function resolveFileUrl(value) {
  if (!value) return '';
  const url = String(value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return buildApiUrl(url.startsWith('/api/') ? url : `/api${url}`);
  return buildApiUrl(`/api/${url.replace(/^\/+/, '')}`);
}

function getPayslipHttpMessage(status) {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to access this payslip.';
  if (status === 404) return 'This payslip PDF is not available yet.';
  if (status >= 500) return 'The payslip service is temporarily unavailable. Please try again later.';
  return 'Unable to download payslip. Please try again.';
}

function createPayslipHttpError(result, bodyText = '') {
  const status = Number(result?.status || 0);
  const dataMessage = (() => {
    if (!bodyText) return '';
    try {
      const parsed = JSON.parse(bodyText);
      return parsed?.message || parsed?.title || parsed?.error || parsed?.detail || '';
    } catch {
      return '';
    }
  })();
  const mappedMessage = getPayslipHttpMessage(status);
  const shouldUseMappedMessage =
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status >= 500;
  const error = new Error(shouldUseMappedMessage ? mappedMessage : dataMessage || mappedMessage);
  error.status = status;
  error.code = status === 401 ? 'SESSION_EXPIRED' : 'PAYSLIP_HTTP_ERROR';
  error.contentType = String(getHeader(result?.headers, 'content-type') || '').toLowerCase();
  error.responseBody = bodyText;

  if (status === 401) {
    notifySessionExpired('unauthorized');
  }

  return error;
}

function createPayslipNetworkError(error) {
  const message = String(error?.message || '');
  const isNetworkFailure =
    /unable to resolve host/i.test(message) ||
    /network request failed/i.test(message) ||
    /enotfound/i.test(message) ||
    /eai_again/i.test(message) ||
    /no address associated with hostname/i.test(message);

  if (!isNetworkFailure) {
    return error;
  }

  const networkError = new Error(
    'Unable to connect to the HRMS server. Please check your internet connection and try again.'
  );
  networkError.code = 'PAYSLIP_NETWORK_ERROR';
  networkError.originalMessage = message;
  return networkError;
}

async function deleteIfExists(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup only.
  }
}

async function validateDownloadedFile(result, token, filename, requestedDirectory) {
  const contentType = String(getHeader(result.headers, 'content-type')).toLowerCase();
  const dispositionName = getDispositionFilename(result.headers);
  const finalName = sanitizeFilename(dispositionName || filename);

  if (contentType.includes('text/html')) {
    await deleteIfExists(result.uri);
    throw new Error('Payslip file is not available. Please try again later.');
  }

  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    const text = await FileSystem.readAsStringAsync(result.uri);
    await deleteIfExists(result.uri);

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Payslip file response was not valid.');
    }

    const fileUrl =
      parsed?.url ||
      parsed?.fileUrl ||
      parsed?.downloadUrl ||
      parsed?.previewUrl ||
      parsed?.data?.url ||
      parsed?.data?.fileUrl ||
      parsed?.data?.downloadUrl ||
      parsed?.data?.previewUrl;

    if (!fileUrl) {
      throw new Error(parsed?.message || 'Payslip file was not returned by the server.');
    }

    return downloadFileFromUrl(resolveFileUrl(fileUrl), token, finalName, requestedDirectory);
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  if (!fileInfo.exists || !fileInfo.size) {
    await deleteIfExists(result.uri);
    throw new Error('Downloaded payslip file is empty.');
  }

  return {
    uri: result.uri,
    filename: finalName,
    contentType: contentType || 'application/pdf',
    size: fileInfo.size,
  };
}

async function downloadFileFromUrl(url, token, filename, requestedDirectory = FileSystem.cacheDirectory) {
  const safeFilename = sanitizeFilename(filename);
  const targetDirectory =
    requestedDirectory ||
    FileSystem.cacheDirectory ||
    FileSystem.documentDirectory;

  if (!targetDirectory) {
    throw new Error('A writable file directory is not available.');
  }

  const targetUri = `${targetDirectory}${safeFilename}`;

  await deleteIfExists(targetUri);

  let result;
  try {
    result = await FileSystem.downloadAsync(url, targetUri, {
      headers: {
        Accept: 'application/pdf, application/octet-stream, application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    throw createPayslipNetworkError(error);
  }

  if (result.status < 200 || result.status >= 300) {
    const contentType = String(getHeader(result.headers, 'content-type')).toLowerCase();
    let bodyText = '';
    if (contentType.includes('json') || contentType.includes('text')) {
      try {
        bodyText = await FileSystem.readAsStringAsync(result.uri);
      } catch {
        bodyText = '';
      }
    }
    await deleteIfExists(result.uri);
    const error = createPayslipHttpError(result, bodyText);
    error.url = url;
    throw error;
  }

  return validateDownloadedFile(result, token, safeFilename, requestedDirectory);
}

export function getMyPayslips(token, options = {}) {
  return apiClient.get(PAYSLIP_ENDPOINTS.mine, { ...options, token });
}

export function getPayslipPreview(id, token, options = {}) {
  assertPayslipId(id);
  const filename = sanitizeFilename(options.filename || 'PIRNAV-Payslip-Preview.pdf');
  return downloadFileFromUrl(buildApiUrl(PAYSLIP_ENDPOINTS.preview(id)), token, filename, FileSystem.cacheDirectory);
}

export function downloadPayslip(id, token, options = {}) {
  assertPayslipId(id);
  const filename = sanitizeFilename(options.filename || 'PIRNAV-Payslip.pdf');
  return downloadFileFromUrl(buildApiUrl(PAYSLIP_ENDPOINTS.download(id)), token, filename, FileSystem.documentDirectory);
}

export function getPayslipFileEndpoint(id, type) {
  assertPayslipId(id);
  if (type === 'preview') return PAYSLIP_ENDPOINTS.preview(id);
  if (type === 'download') return PAYSLIP_ENDPOINTS.download(id);
  throw new Error('Unsupported payslip action.');
}
