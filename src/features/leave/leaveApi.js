import { apiClient } from '../../services/apiClient';

const LEAVE_ENDPOINTS = {
  employeeLeaves: '/api/EmployeeLeave',
  myWfh: '/api/EmployeeLeave/my-wfh',
  applyWfh: '/api/EmployeeLeave/apply-wfh',
  deleteLeave: (id) => `/api/EmployeeLeave/${encodeURIComponent(id)}`,
  cancelWfh: (id) => `/api/EmployeeLeave/cancel-wfh/${encodeURIComponent(id)}`,
};

export function getEmployeeLeaves(token, options = {}) {
  return apiClient.get(LEAVE_ENDPOINTS.employeeLeaves, { ...options, token });
}

export function getMyWorkFromHomeRequests(token, options = {}) {
  return apiClient.get(LEAVE_ENDPOINTS.myWfh, { ...options, token });
}

export function applyEmployeeLeave(payload, token, options = {}) {
  return apiClient.post(LEAVE_ENDPOINTS.employeeLeaves, payload, { ...options, token });
}

export function applyWorkFromHome(payload, token, options = {}) {
  return apiClient.post(LEAVE_ENDPOINTS.applyWfh, payload, { ...options, token });
}

export function deleteEmployeeLeave(id, token, options = {}) {
  return apiClient.delete(LEAVE_ENDPOINTS.deleteLeave(id), { ...options, token });
}

export function cancelWorkFromHome(id, token, options = {}) {
  return apiClient.put(LEAVE_ENDPOINTS.cancelWfh(id), {}, { ...options, token });
}
