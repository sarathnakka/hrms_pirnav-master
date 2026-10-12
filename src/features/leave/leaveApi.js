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

function buildLeaveFormData(payload) {
  const formData = new FormData();
  formData.append('LeaveType', payload.leaveType.trim());
  formData.append('FromDate', payload.fromDate);
  formData.append('ToDate', payload.toDate);
  formData.append('Reason', payload.reason.trim());

  if (payload.attachment?.uri) {
    formData.append('Attachment', {
      uri: payload.attachment.uri,
      name: payload.attachment.name || 'attachment',
      type: payload.attachment.mimeType || 'application/octet-stream',
    });
  }

  return formData;
}

export function applyEmployeeLeave(payload, token, options = {}) {
  return apiClient.post(
    LEAVE_ENDPOINTS.employeeLeaves,
    buildLeaveFormData(payload),
    { ...options, token }
  );
}

export function applyWorkFromHome(payload, token, options = {}) {
  return apiClient.post(
    LEAVE_ENDPOINTS.applyWfh,
    buildLeaveFormData(payload),
    { ...options, token }
  );
}

export function deleteEmployeeLeave(id, token, options = {}) {
  return apiClient.delete(LEAVE_ENDPOINTS.deleteLeave(id), { ...options, token });
}

export function cancelWorkFromHome(id, token, options = {}) {
  return apiClient.put(LEAVE_ENDPOINTS.cancelWfh(id), {}, { ...options, token });
}
