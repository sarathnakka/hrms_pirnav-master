import { apiClient } from '../../services/apiClient';

const TEAM_ENDPOINTS = {
  myTeam: '/api/Team/my-team',
  shifts: '/api/Shift',
  shiftSwaps: '/api/ShiftSwap',
  shiftChanges: '/api/ShiftChangeRequest',
  acceptSwap: (id) => `/api/ShiftSwap/${encodeURIComponent(id)}/employee-accept`,
  rejectSwap: (id) => `/api/ShiftSwap/${encodeURIComponent(id)}/employee-reject`,
  cancelShiftChange: (id) => `/api/ShiftChangeRequest/${encodeURIComponent(id)}`,
};

export function getMyTeam(token, options = {}) {
  const { date, ...requestOptions } = options;
  const endpoint = date
    ? `${TEAM_ENDPOINTS.myTeam}?date=${encodeURIComponent(date)}`
    : TEAM_ENDPOINTS.myTeam;

  return apiClient.get(endpoint, {
    ...requestOptions,
    token,
  });
}

export function getActiveShifts(token, options = {}) {
  return apiClient.get(TEAM_ENDPOINTS.shifts, { ...options, token });
}

export function getShiftSwaps(token, options = {}) {
  const { employeeId, includePendingEmployee = true, ...requestOptions } = options;
  const query = new URLSearchParams();

  if (employeeId) query.set('employeeId', String(employeeId));
  query.set('includePendingEmployee', String(Boolean(includePendingEmployee)));

  return apiClient.get(`${TEAM_ENDPOINTS.shiftSwaps}?${query.toString()}`, {
    ...requestOptions,
    token,
  });
}

export function createShiftSwap(token, payload, options = {}) {
  return apiClient.post(TEAM_ENDPOINTS.shiftSwaps, payload, { ...options, token });
}

export function acceptShiftSwap(token, id, options = {}) {
  return apiClient.post(TEAM_ENDPOINTS.acceptSwap(id), undefined, { ...options, token });
}

export function rejectShiftSwap(token, id, remarks, options = {}) {
  return apiClient.post(
    TEAM_ENDPOINTS.rejectSwap(id),
    { remarks: String(remarks || '').trim() },
    { ...options, token }
  );
}

export function getShiftChangeRequests(token, employeeId, options = {}) {
  const query = new URLSearchParams();
  if (employeeId) query.set('employeeId', String(employeeId));
  const suffix = query.toString();

  return apiClient.get(
    `${TEAM_ENDPOINTS.shiftChanges}${suffix ? `?${suffix}` : ''}`,
    { ...options, token }
  );
}

export function createShiftChange(token, payload, options = {}) {
  return apiClient.post(TEAM_ENDPOINTS.shiftChanges, payload, { ...options, token });
}

export function cancelShiftChange(token, id, options = {}) {
  return apiClient.delete(TEAM_ENDPOINTS.cancelShiftChange(id), { ...options, token });
}
