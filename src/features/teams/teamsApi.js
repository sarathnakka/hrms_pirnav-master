import { apiClient } from '../../services/apiClient';

const TEAM_ENDPOINTS = {
  myTeam: '/api/Team/my-team',
};

export function getMyTeam(token, options = {}) {
  return apiClient.get(TEAM_ENDPOINTS.myTeam, {
    ...options,
    token,
  });
}
