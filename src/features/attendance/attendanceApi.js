import { apiClient } from '../../services/apiClient';
import { getUserSession } from '../auth/authStorage';

async function getToken() {
  const session = await getUserSession();
  return session.token;
}

async function requestWithFallback(primaryEndpoint, fallbackEndpoint, requestFactory) {
  try {
    return await requestFactory(primaryEndpoint);
  } catch (error) {
    if (error.status === 404 && fallbackEndpoint) {
      return requestFactory(fallbackEndpoint);
    }
    throw error;
  }
}

function toResult(promise, fallbackMessage) {
  return promise
    .then((data) => ({ success: true, data }))
    .catch((error) => ({
      success: false,
      message: error.message || fallbackMessage,
      status: error.status,
      code: error.code,
      data: error.data,
      isOutcomeUnknown: Boolean(error.isOutcomeUnknown),
    }));
}

export async function checkInAttendance({ latitude, longitude, accuracy = 10 }) {
  const token = await getToken();
  const payload = { latitude, longitude, accuracy };

  const result = await toResult(
    requestWithFallback('/api/Attendance/checkin', '/Attendance/checkin', (endpoint) =>
      apiClient.post(endpoint, payload, { token })
    ),
    'Network error performing check-in.'
  );

  return {
    ...result,
    message: result.success
      ? result.data?.message || 'Check-in successful!'
      : result.message || 'Check-in failed. Please try again.',
  };
}

export async function checkOutAttendance({
  latitude,
  longitude,
  accuracy = 10,
  locationChangeReason = '',
}) {
  const token = await getToken();
  const payload = { latitude, longitude, accuracy };
  if (locationChangeReason) {
    payload.locationChangeReason = locationChangeReason;
  }

  const result = await toResult(
    requestWithFallback('/api/Attendance/checkout', '/Attendance/checkout', (endpoint) =>
      apiClient.post(endpoint, payload, { token })
    ),
    'Network error performing check-out.'
  );

  const requiresReason =
    Boolean(result.data?.requiresReason || result.data?.data?.requiresReason) ||
    Boolean(result.message && result.message.toLowerCase().includes('location change'));

  return {
    ...result,
    requiresReason,
    message: result.success
      ? result.data?.message || 'Check-out successful!'
      : result.message || 'Check-out failed. Please try again.',
  };
}

export async function getAttendanceHistory(period = 'Week') {
  const token = await getToken();
  let endpoint = '/api/Attendance/weekly';
  if (period === 'Last Week') endpoint = '/api/Attendance/previous-week';
  if (period === 'Month') endpoint = '/api/Attendance/current-month';
  if (period === 'Last Month') endpoint = '/api/Attendance/previous-month';

  const fallbackEndpoint = endpoint.replace('/api/Attendance', '/Attendance');
  const result = await toResult(
    requestWithFallback(endpoint, fallbackEndpoint, (targetEndpoint) =>
      apiClient.get(targetEndpoint, { token })
    ),
    'Network error fetching history.'
  );

  if (!result.success) return result;

  const data = result.data;
  let records = [];
  if (Array.isArray(data)) {
    records = data;
  } else if (Array.isArray(data?.records)) {
    records = data.records;
  } else if (Array.isArray(data?.data)) {
    records = data.data;
  } else if (Array.isArray(data?.result)) {
    records = data.result;
  }

  return {
    success: true,
    data: records,
    raw: data,
  };
}

export async function getTodayAttendance() {
  const token = await getToken();
  const result = await toResult(
    requestWithFallback('/api/Attendance/today', '/Attendance/today', (endpoint) =>
      apiClient.get(endpoint, { token })
    ),
    'Unable to load today attendance.'
  );

  if (!result.success) return result;

  return {
    success: true,
    data: result.data,
    raw: result.data,
  };
}

export async function getAttendanceSettings() {
  const token = await getToken();

  const result = await toResult(
    requestWithFallback('/api/Settings/attendance', '/Settings/attendance', (endpoint) =>
      apiClient.get(endpoint, { token })
    ),
    'Unable to load attendance settings.'
  );

  if (!result.success) {
    return result;
  }

  const source = result.data?.data ?? result.data?.result ?? result.data;

  return {
    success: true,
    data: {
      id: source?.id,
      officeStartTime: source?.officeStartTime || '',
      officeEndTime: source?.officeEndTime || '',
      checkInStartTime: source?.checkInStartTime || '',
      lateAfterTime: source?.lateAfterTime || '',
      checkoutTime: source?.checkoutTime || '',
      halfDayHours: source?.halfDayHours,
      updatedAt: source?.updatedAt,
    },
    raw: result.data,
  };
}
