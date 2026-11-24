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
  const request = response?.notification?.request || response?.request;
  const trigger = request?.trigger;
  const remoteMessage = trigger?.remoteMessage;
  const eventTime = remoteMessage?.notification?.eventTime;
  const sentTime = remoteMessage?.sentTime;
  const eventTimestamp = eventTime === null || eventTime === undefined
    ? NaN
    : Number(eventTime);
  const sentTimestamp = sentTime === null || sentTime === undefined
    ? NaN
    : Number(sentTime);

  const isRemoteNotification = Boolean(remoteMessage) || trigger?.type === 'push';

  if (!isRemoteNotification) {
    return {
      delivery: 'App/local notification',
      source: 'Local trigger',
      status: 'No FCM timestamp metadata',
    };
  }

  if (eventTime !== null && eventTime !== undefined) {
    if (!Number.isFinite(eventTimestamp)) {
      return {
        delivery: 'FCM remote notification',
        source: 'FCM event_time',
        status: 'Invalid event_time value',
      };
    }

    const ageMs = now - eventTimestamp;
    const isSuspicious = ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -5 * 60 * 1000;
    return {
      delivery: 'FCM remote notification',
      source: 'FCM event_time',
      status: isSuspicious
        ? ageMs > 0
          ? 'Suspicious event_time: unreasonably old'
          : 'Suspicious event_time: in the future'
        : 'Event time plausible',
    };
  }

  if (sentTime !== null && sentTime !== undefined) {
    if (!Number.isFinite(sentTimestamp)) {
      return {
        delivery: 'FCM remote notification',
        source: 'FCM sent_time',
        status: 'event_time absent; invalid sent_time',
      };
    }

    const ageMs = now - sentTimestamp;
    const isSuspicious = ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -5 * 60 * 1000;
    return {
      delivery: 'FCM remote notification',
      source: 'FCM sent_time',
      status: isSuspicious
        ? ageMs > 0
          ? 'event_time absent; sent_time unreasonably old'
          : 'event_time absent; sent_time in the future'
        : 'event_time absent; sent_time plausible',
    };
  }

  return {
    delivery: 'FCM remote notification',
    source: 'FCM metadata',
    status: 'event_time absent; sent_time unavailable',
  };
}

