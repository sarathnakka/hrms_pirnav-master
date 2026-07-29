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
      data: error.data,
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
