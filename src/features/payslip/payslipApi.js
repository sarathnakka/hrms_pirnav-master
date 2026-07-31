import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, buildApiUrl } from '../../services/apiClient';

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

async function deleteIfExists(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup only.
  }
}

async function validateDownloadedFile(result, token, filename) {
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

    return downloadFileFromUrl(resolveFileUrl(fileUrl), token, finalName);
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

  const result = await FileSystem.downloadAsync(url, targetUri, {
    headers: {
      Accept: 'application/pdf, application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (result.status < 200 || result.status >= 300) {
    await deleteIfExists(result.uri);
    throw new Error('Unable to download payslip. Please try again.');
  }

  return validateDownloadedFile(result, token, safeFilename);
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
