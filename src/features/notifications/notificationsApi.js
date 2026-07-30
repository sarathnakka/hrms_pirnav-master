import { apiClient } from '../../services/apiClient';

const NOTIFICATION_ENDPOINTS = {
  list: '/api/user-notifications',
  read: (id) => `/api/user-notifications/${encodeURIComponent(id)}/read`,
  markAll: '/api/user-notifications/mark-all',
};

export function getUserNotifications(token, options = {}) {
  return apiClient.get(NOTIFICATION_ENDPOINTS.list, { ...options, token });
}

export function markNotificationAsRead(id, token, options = {}) {
  return apiClient.put(NOTIFICATION_ENDPOINTS.read(id), null, { ...options, token });
}

export function markAllNotificationsAsRead(token, options = {}) {
  return apiClient.put(NOTIFICATION_ENDPOINTS.markAll, null, { ...options, token });
}
