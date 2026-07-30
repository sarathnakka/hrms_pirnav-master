import { apiClient } from '../../services/apiClient';

export const DASHBOARD_ENDPOINTS = {
  userDashboard: '/api/user-dashboard',
  attendanceOverview: '/api/Attendance/dashboard-attendance',
  upcomingBirthdays: '/api/Employees/upcoming-birthdays',
};

export function getUserDashboard(token, options = {}) {
  return apiClient.get(DASHBOARD_ENDPOINTS.userDashboard, { ...options, token });
}

export function getUserAttendanceOverview(token, options = {}) {
  return apiClient.get(DASHBOARD_ENDPOINTS.attendanceOverview, { ...options, token });
}

export function getUpcomingBirthdays(token, options = {}) {
  return apiClient.get(DASHBOARD_ENDPOINTS.upcomingBirthdays, { ...options, token });
}
