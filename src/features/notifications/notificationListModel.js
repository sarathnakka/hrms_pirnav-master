export const NOTIFICATION_FILTERS = {
  ALL: 'all',
  UNREAD: 'unread',
  READ: 'read',
};

export const NOTIFICATIONS_PER_PAGE = 10;

const READ_FIELDS = ['isRead', 'IsRead', 'isread', 'read'];
const TIMESTAMP_FIELDS = [
  'createdAt',
  'CreatedAt',
  'createdOn',
  'CreatedOn',
  'createdDate',
  'CreatedDate',
  'date',
  'Date',
  'timestamp',
  'Timestamp',
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function parseReadStatus(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'read') return true;
    if (normalized === 'false' || normalized === 'unread') return false;
  }

  return null;
}

function getReadStatus(item) {
  const field = READ_FIELDS.find((candidate) => hasOwn(item, candidate));
  return field ? parseReadStatus(item[field]) : null;
}

function getTimestamp(item) {
  const field = TIMESTAMP_FIELDS.find((candidate) => item?.[candidate] != null);
  if (!field) return null;

  const parsed = new Date(item[field]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractNotificationCollection(payload) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.data,
    payload?.notifications,
    payload?.items,
    payload?.records,
    payload?.result,
    payload?.data?.notifications,
    payload?.data?.items,
    payload?.data?.records,
    payload?.data?.result,
  ];
  const collection = candidates.find(Array.isArray);

  if (!collection) {
    throw new Error('The notifications response was not in a supported format.');
  }

  return collection;
}

export function normalizeNotification(item, sourceIndex = 0) {
  const id = item?.id ?? item?.Id ?? item?.notificationId ?? item?.NotificationId;
  const timestamp = getTimestamp(item);

  return {
    id,
    isRead: getReadStatus(item),
    title: item?.title || item?.Title || 'Notification',
    description: item?.description || item?.Description || item?.message || item?.Message || 'No message',
    type: item?.type || item?.Type || 'info',
    timestamp,
    sourceIndex,
    metadata: item,
  };
}

export function normalizeNotifications(payload) {
  return extractNotificationCollection(payload)
    .map(normalizeNotification)
    .filter((item) => item.id !== undefined && item.id !== null && String(item.id).trim() !== '')
    .sort((left, right) => {
      if (left.timestamp && right.timestamp) {
        const difference = right.timestamp.getTime() - left.timestamp.getTime();
        return difference || left.sourceIndex - right.sourceIndex;
      }
      if (left.timestamp) return -1;
      if (right.timestamp) return 1;
      return left.sourceIndex - right.sourceIndex;
    });
}

export function filterNotifications(notifications, filter) {
  if (filter === NOTIFICATION_FILTERS.UNREAD) {
    return notifications.filter((item) => item.isRead === false);
  }
  if (filter === NOTIFICATION_FILTERS.READ) {
    return notifications.filter((item) => item.isRead === true);
  }
  return notifications;
}

export function paginateNotifications(notifications, requestedPage, pageSize = NOTIFICATIONS_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(notifications.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: notifications.slice(startIndex, startIndex + pageSize),
    page,
    totalPages,
    start: notifications.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, notifications.length),
    total: notifications.length,
  };
}

export function formatNotificationDate(timestamp, now = new Date()) {
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) return '';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  const time = timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Yesterday, ${time}`;

  return timestamp.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: timestamp.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
