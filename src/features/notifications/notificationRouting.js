const TEAM_NOTIFICATION_TYPES = new Set([
  'TEAM_SCHEDULE_UPDATED',
]);

const NESTED_DATA_KEYS = ['data', 'payload', 'navigation'];

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim().startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function getValue(source, names) {
  if (!source) return '';

  const keys = Object.keys(source);
  for (const name of names) {
    const matchingKey = keys.find((key) => key.toLowerCase() === name.toLowerCase());
    if (matchingKey) {
      const value = source[matchingKey];
      if (value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }
    }
  }

  return '';
}

function getNotificationDataCandidates(response) {
  const rootData = asObject(response?.notification?.request?.content?.data) || {};
  const candidates = [rootData];

  NESTED_DATA_KEYS.forEach((key) => {
    const nested = asObject(rootData[key]);
    if (nested) {
      candidates.push(nested);
    }
  });

  return candidates;
}

function getFirstValue(candidates, names) {
  for (const candidate of candidates) {
    const value = getValue(candidate, names);
    if (value) return value;
  }

  return '';
}

function getSafeDiagnosticValue(value) {
  if (!value) return 'Unavailable';
  return /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : 'Unrecognized';
}

export function getNotificationRoutingInfo(response) {
  const candidates = getNotificationDataCandidates(response);
  const type = getFirstValue(candidates, ['type']).toUpperCase();
  const screen = getFirstValue(candidates, ['screen']).toLowerCase();
  const target = screen === 'teams' || TEAM_NOTIFICATION_TYPES.has(type)
    ? 'teams'
    : '';

  return {
    target,
    type: getSafeDiagnosticValue(type),
    screen: getSafeDiagnosticValue(screen),
  };
}

export function getNotificationResponseKey(response) {
  const candidates = getNotificationDataCandidates(response);
  const notificationId = getFirstValue(candidates, ['notificationId']);
  const requestId = String(
    response?.notification?.request?.identifier || ''
  ).trim();

  return notificationId || requestId;
}

export function getNotificationTimingInfo(response, now = Date.now()) {
  const remoteMessage = response?.notification?.request?.trigger?.remoteMessage;
  const eventTime = remoteMessage?.notification?.eventTime;
  const sentTime = remoteMessage?.sentTime;
  const eventTimestamp = eventTime === null || eventTime === undefined
    ? NaN
    : Number(eventTime);
  const sentTimestamp = sentTime === null || sentTime === undefined
    ? NaN
    : Number(sentTime);

  if (Number.isFinite(eventTimestamp)) {
    const ageMs = now - eventTimestamp;
    const isSuspicious = ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -5 * 60 * 1000;
    return {
      source: 'FCM event_time',
      status: isSuspicious ? 'Suspicious event time' : 'Event time plausible',
    };
  }

  if (Number.isFinite(sentTimestamp)) {
    const ageMs = now - sentTimestamp;
    const isSuspicious = ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -5 * 60 * 1000;
    return {
      source: 'FCM sent time',
      status: isSuspicious ? 'Suspicious sent time' : 'Sent time plausible',
    };
  }

  return {
    source: 'Unavailable',
    status: 'Timestamp unavailable',
  };
}

