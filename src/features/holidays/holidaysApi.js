import { apiClient } from '../../services/apiClient';

const HOLIDAYS_ENDPOINT = '/api/Holidays';

export function getHolidays(token, options = {}) {
  return apiClient.get(HOLIDAYS_ENDPOINT, {
    ...options,
    token,
  });
}
