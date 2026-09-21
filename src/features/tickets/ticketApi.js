import { apiClient, buildApiUrl } from '../../services/apiClient';
import * as FileSystem from 'expo-file-system/legacy';
import { notifySessionExpired } from '../auth/sessionManager';

export const TICKET_ENDPOINTS = {
  mine: '/api/Ticket/MyTickets',
  getById: (id) => `/api/Ticket/${encodeURIComponent(id)}`,
  update: (id) => `/api/Ticket/Update/${encodeURIComponent(id)}`,
  delete: (id) => `/api/Ticket/${encodeURIComponent(id)}`,
  updateStatus: (id) => `/api/Ticket/UpdateStatus/${encodeURIComponent(id)}`,
  startWork: '/api/Ticket/start-work',
  stopWork: '/api/Ticket/stop-work',
  employees: '/api/Employees',
};

function buildWorkActionPayload(ticket = {}) {
  return {
    ticketId: Number(ticket?.ticketId || ticket?.id || 0),
  };
}

export function getMyTickets(token, options = {}) {
  return apiClient.get(TICKET_ENDPOINTS.mine, { ...options, token });
}

export function getTicketById(id, token, options = {}) {
  const endpoint = TICKET_ENDPOINTS.getById(id);
  return apiClient.get(endpoint, { ...options, token });
}

export function updateTicket(id, payload, token, options = {}) {
  const endpoint = TICKET_ENDPOINTS.update(id);
  return apiClient.put(endpoint, payload, { ...options, token });
}

export function updateTicketStatus(id, { status, remarks, files = [] }, token, options = {}) {
  const endpoint = TICKET_ENDPOINTS.updateStatus(id);
  const formData = new FormData();
  formData.append('status', String(status || '').trim());
  formData.append('remarks', String(remarks || '').trim());
  files.forEach((file) => {
    formData.append('files', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    });
  });

  return apiClient.put(endpoint, formData, { ...options, token });
}

function resolveAttachmentUrl(path) {
  const value = String(path || '').trim().replace(/\\/g, '/');
  if (!value || /^(file:|data:|blob:)/i.test(value) || /^[a-z]:\//i.test(value)) {
    return '';
  }
  const server = new URL(buildApiUrl('/'));
  const resolved = new URL(/^https?:\/\//i.test(value) ? value : `/${value.replace(/^\/+/, '')}`, server);
  return resolved.origin === server.origin && /^https?:$/.test(resolved.protocol) ? resolved.href : '';
}

export async function getTicketAttachment(attachment, token) {
  const rawPath = attachment?.url || attachment?.fileUrl || attachment?.path ||
    attachment?.filePath || attachment?.downloadUrl || attachment?.FileUrl || attachment?.FilePath;
  const url = resolveAttachmentUrl(rawPath);
  if (!url) throw new Error('This attachment is not available to view.');
  const name = String(attachment?.name || attachment?.fileName || attachment?.FileName || 'ticket-attachment')
    .replace(/^.*[/\\]/, '').replace(/[^A-Za-z0-9._ -]/g, '_');
  const uri = `${FileSystem.cacheDirectory}ticket-${Date.now()}-${name}`;
  const response = await FileSystem.downloadAsync(url, uri, {
    headers: {
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
    },
  });
  if (response.status === 401) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    notifySessionExpired('unauthorized');
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (response.status < 200 || response.status >= 300) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw new Error(response.status === 404 ? 'This attachment is no longer available.' : 'Unable to open this attachment.');
  }
  const contentType = String(response.headers?.['Content-Type'] || response.headers?.['content-type'] || '').toLowerCase().split(';')[0].trim();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size || contentType.includes('text/html') || contentType.includes('application/json')) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw new Error('The server did not return a viewable attachment.');
  }
  const extension = name.split('.').pop().toLowerCase();
  const extensionMime = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[extension];
  const mimeType = contentType && contentType !== 'application/octet-stream'
    ? contentType : (extensionMime || contentType || 'application/octet-stream');
  return { uri, mimeType, name };
}

export function deleteTicket(id, token, options = {}) {
  const endpoint = TICKET_ENDPOINTS.delete(id);
  return apiClient.delete(endpoint, { ...options, token });
}

export function startTicketWork(ticket, token, options = {}) {
  return apiClient.post(
    TICKET_ENDPOINTS.startWork,
    buildWorkActionPayload(ticket),
    { ...options, token }
  );
}

export function stopTicketWork(ticket, remarks, token, options = {}) {
  return apiClient.post(
    TICKET_ENDPOINTS.stopWork,
    {
      ...buildWorkActionPayload(ticket),
      remarks: String(remarks || '').trim(),
    },
    { ...options, token }
  );
}

export function getTicketEmployees(token, options = {}) {
  return apiClient.get(TICKET_ENDPOINTS.employees, { ...options, token });
}
