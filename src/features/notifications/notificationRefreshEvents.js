const listeners = new Set();

export function emitNotificationRefresh() {
  listeners.forEach((listener) => listener());
}

export function addNotificationRefreshListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
