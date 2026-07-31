import { apiClient } from '../../services/apiClient';

const TEAM_ENDPOINTS = {
  list: '/api/Team',
  details: (teamId) => `/api/Team/${encodeURIComponent(String(teamId))}`,
};

function assertTeamId(teamId) {
  if (teamId === null || teamId === undefined || String(teamId).trim() === '') {
    throw new Error('A valid team ID is required.');
  }
}

export function getTeams(token, options = {}) {
  return apiClient.get(TEAM_ENDPOINTS.list, {
    ...options,
    token,
  });
}

export function getTeamById(teamId, token, options = {}) {
  assertTeamId(teamId);

  return apiClient.get(TEAM_ENDPOINTS.details(teamId), {
    ...options,
    token,
  });
}
