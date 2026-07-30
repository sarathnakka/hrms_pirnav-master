import { environment } from '../../config/environment';

const DEFAULT_WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function unwrapPayload(payload = {}) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  ) {
    return payload.data;
  }

  return payload || {};
}

export function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  const source = unwrapPayload(payload);
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.items)) return source.items;
  if (Array.isArray(source?.records)) return source.records;
  if (Array.isArray(source?.results)) return source.results;
  if (Array.isArray(source?.result)) return source.result;
  if (Array.isArray(source?.data)) return source.data;
  return [];
}

export function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clampPercentage(value) {
  const numeric = normalizeNumber(value, 0);
  return Math.min(100, Math.max(0, numeric));
}

export function getInitials(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'E';
}

export function getUserDisplayName(user = {}) {
  return (
    user?.employeeName ||
    user?.name ||
    user?.fullName ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    user?.email ||
    'Employee'
  );
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, fallback = '-') {
  const date = parseDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function timeAgo(value) {
  const date = parseDate(value);
  if (!date) return '';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatWorkingHours(value, fallback = '0h') {
  if (value === null || value === undefined || value === '') return fallback;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const [hoursPart = 0, minutesPart = 0, secondsPart = 0] = trimmed.split(':').map(Number);
      const totalMinutes = Math.max(0, Math.round(hoursPart * 60 + minutesPart + secondsPart / 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0 && minutes === 0) return '0m';
      if (hours === 0) return `${minutes}m`;
      return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
    }

    const hoursMatch = trimmed.match(/(\d+)\s*h/i);
    const minutesMatch = trimmed.match(/(\d+)\s*m/i);
    if (hoursMatch || minutesMatch) {
      const hours = Number(hoursMatch?.[1] || 0);
      const minutes = Number(minutesMatch?.[1] || 0);
      if (hours === 0 && minutes === 0) return '0m';
      if (hours === 0) return `${minutes}m`;
      return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
    }

    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? formatWorkingHours(numeric, fallback) : trimmed;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const safeHours = Math.max(0, value);
    const hours = Math.floor(safeHours);
    const minutes = Math.round((safeHours - hours) * 60);
    if (hours === 0 && minutes === 0) return '0h';
    if (hours === 0) return `${minutes}m`;
    return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  }

  return fallback;
}

function parseHoursValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const hoursMatch = trimmed.match(/(\d+)\s*h/i);
    const minutesMatch = trimmed.match(/(\d+)\s*m/i);
    if (hoursMatch || minutesMatch) {
      return Number(hoursMatch?.[1] || 0) + Number(minutesMatch?.[1] || 0) / 60;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const [hoursPart = 0, minutesPart = 0, secondsPart = 0] = trimmed.split(':').map(Number);
      return hoursPart + minutesPart / 60 + secondsPart / 3600;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  }
  return 0;
}

function getWeekLabel(item, index) {
  if (!item || typeof item !== 'object') return DEFAULT_WEEK_LABELS[index] || `Day ${index + 1}`;

  const directLabel = item?.day || item?.dayName || item?.label || item?.weekDay || item?.weekday || item?.name || '';
  if (directLabel) {
    const raw = String(directLabel).trim();
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(raw)) {
      return raw.slice(0, 3).replace(/^./, (char) => char.toUpperCase());
    }
    return raw.length <= 3 ? raw : raw.slice(0, 3);
  }

  const date = parseDate(item?.date || item?.attendanceDate || item?.dayDate || item?.weekDate || '');
  if (date) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return DEFAULT_WEEK_LABELS[index] || `Day ${index + 1}`;
}

function getWeekHours(item) {
  return parseHoursValue(
    item && typeof item === 'object'
      ? item?.hours ?? item?.value ?? item?.workingHours ?? item?.duration ?? item?.totalHours ?? item?.weekHours ?? 0
      : item
  );
}

export function normalizeWeeklyHours(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      day: getWeekLabel(item, index),
      hours: getWeekHours(item),
    }));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entry], index) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return { day: getWeekLabel({ ...entry, day: key }, index), hours: getWeekHours(entry) };
      }
      return { day: key, hours: normalizeNumber(entry, 0) };
    });
  }

  return [];
}

export function normalizeAttendance(payload = {}) {
  const source = unwrapPayload(payload);
  return {
    attendancePercentage: clampPercentage(source?.attendancePercentage ?? source?.attendance ?? source?.percentage ?? 0),
    presentDays: normalizeNumber(source?.presentDays ?? source?.present ?? source?.presentCount ?? 0),
    absentDays: normalizeNumber(source?.absentDays ?? source?.absent ?? source?.absentCount ?? 0),
    halfDays: normalizeNumber(source?.halfDays ?? source?.halfDay ?? source?.halfDayCount ?? 0),
    leaveDays: normalizeNumber(source?.leaveDays ?? source?.leave ?? source?.leaveCount ?? 0),
    todayWorkingHours: source?.todayWorkingHours ?? source?.workingHoursToday ?? source?.workingHours ?? '',
    weeklyHours: normalizeWeeklyHours(source?.weeklyHours ?? source?.weeklyAttendance ?? source?.weekly ?? source?.weeklyData ?? source?.graph ?? []),
  };
}

export function normalizeDashboardData(payload = {}) {
  const source = unwrapPayload(payload);
  return {
    myTickets: normalizeNumber(source?.myTickets ?? source?.totalTickets ?? source?.ticketCount ?? 0),
    completedTickets: normalizeNumber(source?.completedTickets ?? source?.completed ?? source?.completedTicketCount ?? source?.completedCount ?? 0),
    pendingTickets: normalizeNumber(source?.pendingTickets ?? source?.pending ?? source?.pendingTicketCount ?? source?.pendingCount ?? 0),
    attendance: clampPercentage(source?.attendance ?? source?.attendancePercentage ?? 0),
    recentActivities: Array.isArray(source?.recentActivities || source?.activities || source?.recentActivity)
      ? source?.recentActivities || source?.activities || source?.recentActivity
      : [],
    upcomingHolidays: Array.isArray(source?.upcomingHolidays || source?.holidays || source?.upcomingHoliday)
      ? source?.upcomingHolidays || source?.holidays || source?.upcomingHoliday
      : [],
  };
}

function resolveImageUrl(record = {}) {
  const rawSource =
    record?.employeePhoto ||
    record?.photo ||
    record?.photoUrl ||
    record?.imageUrl ||
    record?.avatarUrl ||
    record?.profileImage ||
    record?.picture ||
    record?.image ||
    '';

  const raw = String(rawSource || '').trim();
  if (!raw || /^file:/i.test(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || /^\\\\/.test(raw)) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const cleanPath = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${environment.apiBaseUrl}/${cleanPath}`;
}

export function normalizeBirthday(record = {}) {
  const employeeName =
    record?.employeeName ||
    record?.name ||
    `${record?.firstName ?? ''} ${record?.lastName ?? ''}`.trim() ||
    'Employee';

  const parsedDays = Number(record?.daysRemaining ?? record?.days_remaining ?? record?.remainingDays ?? 0);

  return {
    employeeId: record?.employeeId || record?.employeeID || record?.employee_id || record?.id || '',
    employeeName,
    designation: record?.designation || record?.designationName || record?.roleName || record?.role || record?.position || '',
    birthday: record?.birthday || record?.dob || record?.birthDate || record?.dateOfBirth || '',
    daysRemaining: Number.isFinite(parsedDays) ? Math.max(0, parsedDays) : 0,
    imageUrl: resolveImageUrl(record),
    initials: getInitials(employeeName),
  };
}

export function normalizeBirthdays(payload) {
  return extractCollection(payload)
    .map(normalizeBirthday)
    .sort((left, right) => {
      if (left.daysRemaining !== right.daysRemaining) return left.daysRemaining - right.daysRemaining;
      return left.employeeName.localeCompare(right.employeeName);
    });
}

export function normalizeActivity(item = {}) {
  const message = item?.message || item?.activity || item?.title || '';
  const rawTime = item?.time || item?.createdAt || item?.updatedAt || item?.date || '';
  return {
    id: item?.id || item?.activityId || `${message}-${rawTime}`,
    message: message || 'Activity updated',
    time: String(rawTime || '').toLowerCase().includes('ago') ? String(rawTime) : timeAgo(rawTime),
  };
}

export function normalizeHoliday(item = {}) {
  return {
    id: item?.id || item?.holidayId || item?.holidayName || item?.holiday_Name || item?.name || item?.date,
    name: item?.holidayName || item?.holiday_Name || item?.name || 'Holiday',
    date: formatDate(item?.date || item?.holiday_Date || item?.holidayDate),
  };
}
