import * as FileSystem from 'expo-file-system/legacy';

import { apiClient, buildApiUrl } from '../../services/apiClient';

const ENDPOINTS = {
  myDetails: '/api/EmployeeFullDetail/my-details',
  departments: '/api/Departments',
  personal: '/api/employeepersonalinfo',
  personalByEmployee: (employeeId) => `/api/employeepersonalinfo/${encodeURIComponent(employeeId)}`,
  bank: '/api/EmployeeBankDetails',
  bankByEmployee: (employeeId) => `/api/EmployeeBankDetails/${encodeURIComponent(employeeId)}`,
  education: '/api/EmployeeEducation',
  educationByEmployee: (employeeId) => `/api/EmployeeEducation/${encodeURIComponent(employeeId)}`,
  experience: '/api/EmployeeExperience',
  experienceByEmployee: (employeeId) => `/api/EmployeeExperience/${encodeURIComponent(employeeId)}`,
  documentsUpload: '/api/EmployeeDocuments/upload',
  documentsByEmployee: (employeeId) => `/api/EmployeeDocuments/${encodeURIComponent(employeeId)}`,
  documentDelete: (documentId) => `/api/EmployeeDocuments/${encodeURIComponent(documentId)}`,
  documentView: (documentId) => `/api/EmployeeDocuments/view/${encodeURIComponent(documentId)}`,
  documentDownload: (documentId) => `/api/EmployeeDocuments/download/${encodeURIComponent(documentId)}`,
  documentChecklist: (employeeId) => `/api/EmployeeDocuments/checklist/${encodeURIComponent(employeeId)}`,
  agreementsMine: '/api/Agreement/myagreements',
  agreementGetAll: '/api/Agreement/GetAllAgreements',
  agreementPending: (employeeId) => `/api/Agreement/Pending/${encodeURIComponent(employeeId)}`,
  agreementSigned: (employeeId) => `/api/Agreement/Signed/${encodeURIComponent(employeeId)}`,
  agreementView: (id) => `/api/Agreement/view/${encodeURIComponent(id)}`,
  agreementViewSigned: (id) => `/api/Agreement/ViewSigned/${encodeURIComponent(id)}`,
  agreementDownloadSigned: (id) => `/api/Agreement/DownloadSigned/${encodeURIComponent(id)}`,
  agreementSign: ({ agreementCode, employeeId, signatureName, signedLocation }) =>
    `/api/Agreement/sign?AgreementCode=${encodeURIComponent(agreementCode)}&SignatureName=${encodeURIComponent(signatureName)}&SignedLocation=${encodeURIComponent(signedLocation)}&EmployeeId=${encodeURIComponent(employeeId)}`,
};

function assertId(value, label) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${label} is required.`);
  }
}

function getHeader(headers = {}, name) {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function sanitizeFilename(value, fallback = 'PIRNAV-Document.pdf') {
  const cleaned = String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

async function deleteIfExists(uri) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function resolveFileUrl(value) {
  if (!value) return '';
  const url = String(value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return buildApiUrl(url.startsWith('/api/') ? url : `/api${url}`);
  return buildApiUrl(`/api/${url.replace(/^\/+/, '')}`);
}

async function validateDownloadedFile(result, token, filename, requestedDirectory) {
  const contentType = String(getHeader(result.headers, 'content-type')).toLowerCase();
  if (contentType.includes('text/html')) {
    await deleteIfExists(result.uri);
    throw new Error('The server did not return a valid document.');
  }

  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    const text = await FileSystem.readAsStringAsync(result.uri);
    await deleteIfExists(result.uri);
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Document response was not valid.');
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
      throw new Error(parsed?.message || 'Document file was not returned by the server.');
    }

    return downloadEmployeeFile(resolveFileUrl(fileUrl), token, filename, requestedDirectory);
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || !info.size) {
    await deleteIfExists(result.uri);
    throw new Error('Downloaded document file is empty.');
  }

  return {
    uri: result.uri,
    filename,
    contentType: contentType || 'application/octet-stream',
    size: info.size,
  };
}

async function downloadEmployeeFile(url, token, filename, requestedDirectory = FileSystem.cacheDirectory) {
  const targetDirectory = requestedDirectory || FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!targetDirectory) {
    throw new Error('A writable file directory is not available.');
  }

  const safeFilename = sanitizeFilename(filename);
  const targetUri = `${targetDirectory}${safeFilename}`;
  await deleteIfExists(targetUri);

  const result = await FileSystem.downloadAsync(url, targetUri, {
    headers: {
      Accept: 'application/pdf, image/*, application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (result.status < 200 || result.status >= 300) {
    let message = 'Unable to download document. Please try again.';
    try {
      const text = await FileSystem.readAsStringAsync(result.uri);
      if (text) {
        const parsed = JSON.parse(text);
        message = parsed?.message || parsed?.title || parsed?.error || message;
      }
    } catch {
      // Keep the generic message when the error body is not readable JSON.
    }
    await deleteIfExists(result.uri);
    const error = new Error(message);
    error.status = result.status;
    error.code = 'DOCUMENT_HTTP_ERROR';
    throw error;
  }

  return validateDownloadedFile(result, token, safeFilename, targetDirectory);
}

async function uploadForm(endpoint, formData, token) {
  const response = await fetch(buildApiUrl(endpoint), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.title || data?.error || 'Upload failed. Please try again.');
    error.status = response.status;
    error.code = 'UPLOAD_HTTP_ERROR';
    error.data = data;
    throw error;
  }

  return data;
}

export function getMyEmployeeDetails(token, options = {}) {
  return apiClient.get(ENDPOINTS.myDetails, { ...options, token });
}

export function getDepartments(token, options = {}) {
  return apiClient.get(ENDPOINTS.departments, { ...options, token });
}

export function savePersonalInfo(payload, employeeId, hasExistingData, token, options = {}) {
  if (hasExistingData) {
    assertId(employeeId, 'Employee ID');
    return apiClient.put(ENDPOINTS.personalByEmployee(employeeId), payload, { ...options, token });
  }
  return apiClient.post(ENDPOINTS.personal, payload, { ...options, token });
}

export function saveBankInfo(payload, employeeId, hasExistingData, token, options = {}) {
  if (hasExistingData) {
    assertId(employeeId, 'Employee ID');
    return apiClient.put(ENDPOINTS.bankByEmployee(employeeId), payload, { ...options, token });
  }
  return apiClient.post(ENDPOINTS.bank, payload, { ...options, token });
}

export async function saveEducationCollection(payloadList, employeeId, hasExistingData, token) {
  assertId(employeeId, 'Employee ID');
  if (!payloadList.length) {
    if (hasExistingData) {
      return apiClient.delete(ENDPOINTS.educationByEmployee(employeeId), { token });
    }
    return null;
  }
  if (hasExistingData) {
    return apiClient.put(ENDPOINTS.educationByEmployee(employeeId), payloadList, { token });
  }
  return Promise.all(payloadList.map((payload) => apiClient.post(ENDPOINTS.education, payload, { token })));
}

export async function saveExperienceCollection(payloadList, employeeId, hasExistingData, token) {
  assertId(employeeId, 'Employee ID');
  if (hasExistingData) {
    await apiClient.delete(ENDPOINTS.experienceByEmployee(employeeId), { token });
  }
  if (!payloadList.length) return null;
  return Promise.all(payloadList.map((payload) => apiClient.post(ENDPOINTS.experience, payload, { token })));
}

export function getEmployeeDocuments(employeeId, token, options = {}) {
  assertId(employeeId, 'Employee ID');
  return apiClient.get(ENDPOINTS.documentsByEmployee(employeeId), { ...options, token });
}

export function getDocumentChecklist(employeeId, token, options = {}) {
  assertId(employeeId, 'Employee ID');
  return apiClient.get(ENDPOINTS.documentChecklist(employeeId), { ...options, token });
}

export function uploadEmployeeDocument({ employeeId, documentType, file }, token) {
  assertId(employeeId, 'Employee ID');
  const formData = new FormData();
  formData.append('EmployeeId', String(employeeId));
  formData.append('DocumentType', documentType);
  formData.append('Files', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || file.type || 'application/octet-stream',
  });
  return uploadForm(ENDPOINTS.documentsUpload, formData, token);
}

export function deleteEmployeeDocument(documentId, token, options = {}) {
  assertId(documentId, 'Document ID');
  return apiClient.delete(ENDPOINTS.documentDelete(documentId), { ...options, token });
}

export function viewEmployeeDocument(documentId, token, filename = 'PIRNAV-Document.pdf') {
  assertId(documentId, 'Document ID');
  return downloadEmployeeFile(buildApiUrl(ENDPOINTS.documentView(documentId)), token, filename, FileSystem.cacheDirectory);
}

export function downloadEmployeeDocument(documentId, token, filename = 'PIRNAV-Document.pdf') {
  assertId(documentId, 'Document ID');
  return downloadEmployeeFile(buildApiUrl(ENDPOINTS.documentDownload(documentId)), token, filename, FileSystem.documentDirectory);
}

export function getMyAgreements(token, options = {}) {
  return apiClient.get(ENDPOINTS.agreementsMine, { ...options, token });
}

export function getAgreementTemplates(token, options = {}) {
  return apiClient.get(ENDPOINTS.agreementGetAll, { ...options, token });
}

export function getPendingAgreements(employeeId, token, options = {}) {
  assertId(employeeId, 'Employee ID');
  return apiClient.get(ENDPOINTS.agreementPending(employeeId), { ...options, token });
}

export function getSignedAgreements(employeeId, token, options = {}) {
  assertId(employeeId, 'Employee ID');
  return apiClient.get(ENDPOINTS.agreementSigned(employeeId), { ...options, token });
}

function uniqueAgreementCandidates(source, preferredFields) {
  if (source === null || source === undefined || typeof source !== 'object') {
    return [source].filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
  }

  const candidates = [];
  preferredFields.forEach((field) => {
    const value = source?.[field];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      candidates.push(value);
    }
  });

  return Array.from(new Set(candidates.map((value) => String(value).trim()).filter(Boolean)));
}

async function downloadAgreementWithCandidates(source, token, filename, endpointBuilder, preferredFields, directory) {
  const candidates = uniqueAgreementCandidates(source, preferredFields);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await downloadEmployeeFile(buildApiUrl(endpointBuilder(candidate)), token, filename, directory);
    } catch (error) {
      lastError = error;
      if (Number(error?.status) === 404) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Agreement file is unavailable.');
}

export function viewAgreementDocument(agreement, token, filename = 'PIRNAV-Agreement.pdf') {
  return downloadAgreementWithCandidates(
    agreement,
    token,
    filename,
    ENDPOINTS.agreementView,
    ['pendingEmployeeAgreementId', 'employeeAgreementId', 'agreementId', 'documentId', 'agreementCode', 'id'],
    FileSystem.cacheDirectory
  );
}

export function viewSignedAgreementDocument(agreement, token, filename = 'PIRNAV-Signed-Agreement.pdf') {
  return downloadAgreementWithCandidates(
    agreement,
    token,
    filename,
    ENDPOINTS.agreementViewSigned,
    ['signedEmployeeAgreementId', 'employeeAgreementId', 'agreementId', 'documentId', 'agreementCode', 'id'],
    FileSystem.cacheDirectory
  );
}

export function downloadSignedAgreementDocument(agreement, token, filename = 'PIRNAV-Signed-Agreement.pdf') {
  return downloadAgreementWithCandidates(
    agreement,
    token,
    filename,
    ENDPOINTS.agreementDownloadSigned,
    ['signedEmployeeAgreementId', 'employeeAgreementId', 'agreementId', 'documentId', 'agreementCode', 'id'],
    FileSystem.documentDirectory
  );
}

export function signEmployeeAgreement({ agreementCode, employeeId, signatureName, signedLocation, signatureFile }, token) {
  assertId(agreementCode, 'Agreement Code');
  assertId(employeeId, 'Employee ID');
  assertId(signatureName, 'Signature Name');
  assertId(signedLocation, 'Signed Location');
  if (!signatureFile) {
    throw new Error('Signature image is required.');
  }

  const formData = new FormData();
  formData.append('SignatureImage', {
    uri: signatureFile.uri,
    name: signatureFile.name,
    type: signatureFile.mimeType || signatureFile.type || 'image/png',
  });

  return uploadForm(ENDPOINTS.agreementSign({
    agreementCode,
    employeeId,
    signatureName,
    signedLocation,
  }), formData, token);
}
