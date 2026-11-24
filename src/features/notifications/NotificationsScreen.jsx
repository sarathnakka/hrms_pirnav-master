import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './notificationsApi';
import {
  filterNotifications,
  formatNotificationDate,
  normalizeNotifications,
  NOTIFICATION_FILTERS,
  paginateNotifications,
} from './notificationListModel';
import {
  addNotificationRefreshListener,
  emitNotificationRefresh,
} from './notificationRefreshEvents';
import { SHOULD_INITIALIZE_NATIVE_PUSH } from './nativePushConfig';
import {
  getNotificationPermissionSnapshot,
  openAndroidNotificationSettings,
  refreshAndroidNotificationPermission,
  requestAndroidNotificationPermission,
  subscribeToNotificationPermission,
} from './pushNotificationService';

const FILTER_OPTIONS = [
  { key: NOTIFICATION_FILTERS.ALL, label: 'All' },
  { key: NOTIFICATION_FILTERS.UNREAD, label: 'Unread' },
  { key: NOTIFICATION_FILTERS.READ, label: 'Read' },
];

function getTypeMeta(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'team_schedule_updated') {
    return { icon: 'calendar-outline', color: colors.primary, backgroundColor: colors.tealTintSoft };
  }
  if (normalized === 'success') {
    return { icon: 'checkmark-circle', color: colors.notifications.successIcon, backgroundColor: colors.successBackground };
  }
  if (normalized === 'warning') {
    return { icon: 'warning-outline', color: colors.notifications.warningIcon, backgroundColor: colors.warningBackground };
  }
  return { icon: 'notifications-outline', color: colors.primary, backgroundColor: colors.tealTintSoft };
}

function getEmptyState(filter) {
  if (filter === NOTIFICATION_FILTERS.UNREAD) {
    return { title: 'No unread notifications', copy: "You're all caught up." };
  }
  if (filter === NOTIFICATION_FILTERS.READ) {
    return { title: 'No read notifications', copy: 'Notifications you read will appear here.' };
  }
  return { title: 'No notifications yet', copy: 'Your notifications will appear here when there are updates.' };
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const listRef = useRef(null);
  const requestVersionRef = useRef(0);
  const hasLoadedDataRef = useRef(false);
  const pendingReadIdsRef = useRef(new Set());
  const markingAllRef = useRef(false);
  const [notifications, setNotifications] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(NOTIFICATION_FILTERS.ALL);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [pendingReadIds, setPendingReadIds] = useState(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [updatingPushPermission, setUpdatingPushPermission] = useState(false);
  const pushPermission = useSyncExternalStore(
    subscribeToNotificationPermission,
    getNotificationPermissionSnapshot,
    getNotificationPermissionSnapshot
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.isRead === false).length,
    [notifications]
  );
  const filteredNotifications = useMemo(
    () => filterNotifications(notifications, selectedFilter),
    [notifications, selectedFilter]
  );
  const pagination = useMemo(
    () => paginateNotifications(filteredNotifications, page),
    [filteredNotifications, page]
  );
  const emptyState = getEmptyState(selectedFilter);
  const canMarkAll = unreadCount > 0 && !markingAll;

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  useEffect(() => {
    requestVersionRef.current += 1;
    hasLoadedDataRef.current = false;
    setNotifications([]);
    setSelectedFilter(NOTIFICATION_FILTERS.ALL);
    setPage(1);
    setError('');
    setRefreshError('');
    pendingReadIdsRef.current = new Set();
    markingAllRef.current = false;
    setPendingReadIds(new Set());
    setMarkingAll(false);
    setLoading(Boolean(token));
  }, [token]);

  const loadNotifications = useCallback(
    async ({ refresh = false, signal } = {}) => {
      if (!token) {
        setLoading(false);
        return;
      }

      const requestVersion = ++requestVersionRef.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setRefreshError('');
      if (!refresh) setError('');

      try {
        const response = await getUserNotifications(token, { signal });
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;
        setNotifications(normalizeNotifications(response));
        hasLoadedDataRef.current = true;
        setError('');
      } catch (requestError) {
        if (!mountedRef.current || signal?.aborted || requestVersion !== requestVersionRef.current) return;
        const message = requestError.message || 'Unable to load notifications.';
        if (hasLoadedDataRef.current || refresh) setRefreshError(message);
        else setError(message);
      } finally {
        if (!mountedRef.current || signal?.aborted || requestVersion !== requestVersionRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      setPendingReadIds(new Set(pendingReadIdsRef.current));
      setMarkingAll(markingAllRef.current);
      const controller = new AbortController();
      const removeNotificationRefreshListener = addNotificationRefreshListener(() => {
        loadNotifications({ refresh: true });
      });
      loadNotifications({ signal: controller.signal });
      if (SHOULD_INITIALIZE_NATIVE_PUSH) {
        refreshAndroidNotificationPermission().catch(() => {});
      }
      return () => {
        mountedRef.current = false;
        requestVersionRef.current += 1;
        controller.abort();
        removeNotificationRefreshListener();
      };
    }, [loadNotifications])
  );

  const onRefresh = useCallback(() => {
    loadNotifications({ refresh: true });
  }, [loadNotifications]);

  const selectFilter = useCallback((filter) => {
    setSelectedFilter(filter);
    setPage(1);
  }, []);

  const changePage = useCallback((direction) => {
    setPage((current) => Math.max(1, Math.min(pagination.totalPages, current + direction)));
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [pagination.totalPages]);

  const handlePushPermissionAction = useCallback(async () => {
    if (updatingPushPermission) return;

    setUpdatingPushPermission(true);
    try {
      if (pushPermission.canAskAgain) await requestAndroidNotificationPermission();
      else await openAndroidNotificationSettings();
    } catch {
      Alert.alert(
        'Unable to change notification settings',
        'Open Android Settings and allow notifications for PeopleHRSync.'
      );
    } finally {
      setUpdatingPushPermission(false);
    }
  }, [pushPermission.canAskAgain, updatingPushPermission]);

  const handleMarkOne = useCallback(async (notification) => {
    if (notification?.isRead !== false || markingAllRef.current || !token) return;
    const idKey = String(notification.id);
    if (pendingReadIdsRef.current.has(idKey)) return;

    pendingReadIdsRef.current.add(idKey);
    setPendingReadIds((current) => new Set(current).add(idKey));
    try {
      await markNotificationAsRead(notification.id, token);
      if (!mountedRef.current) return;
      setNotifications((current) => current.map((item) => (
        String(item.id) === idKey ? { ...item, isRead: true } : item
      )));
      emitNotificationRefresh();
    } catch (requestError) {
      if (mountedRef.current) {
        Alert.alert('Unable to update', requestError.message || 'Please try again.');
      }
    } finally {
      pendingReadIdsRef.current.delete(idKey);
      if (mountedRef.current) {
        setPendingReadIds((current) => {
          const next = new Set(current);
          next.delete(idKey);
          return next;
        });
      }
    }
  }, [token]);

  const handleMarkAll = useCallback(async () => {
    if (!canMarkAll || markingAllRef.current || !token) return;

    markingAllRef.current = true;
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead(token);
      if (!mountedRef.current) return;
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      emitNotificationRefresh();
    } catch (requestError) {
      if (mountedRef.current) {
        Alert.alert('Unable to update', requestError.message || 'Please try again.');
      }
    } finally {
      markingAllRef.current = false;
      if (mountedRef.current) setMarkingAll(false);
    }
  }, [canMarkAll, token]);

  const renderNotification = ({ item }) => {
    const meta = getTypeMeta(item.type);
    const idKey = String(item.id);
    const isUnread = item.isRead === false;
    const isUpdating = pendingReadIds.has(idKey) || markingAll;
    const formattedDate = formatNotificationDate(item.timestamp);

    return (
      <TouchableOpacity
        style={[styles.notificationRow, !isUnread && styles.notificationRowRead]}
        onPress={() => handleMarkOne(item)}
        disabled={!isUnread || isUpdating}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.description}.${isUnread ? ' Mark as read.' : ''}`}
        accessibilityState={{ disabled: !isUnread, busy: isUpdating }}
      >
        <View style={[styles.typeIcon, { backgroundColor: meta.backgroundColor }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationTitleRow}>
            <Text
              style={[styles.notificationTitle, !isUnread && styles.notificationTitleRead]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {isUnread ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.notificationDescription}>{item.description}</Text>
          {isUpdating || formattedDate ? (
            <Text style={styles.notificationTime}>{isUpdating ? 'Updating...' : formattedDate}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      data={loading && !hasLoadedDataRef.current ? [] : pagination.items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderNotification}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={[
        styles.content,
        { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 2 },
      ]}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={styles.screenTitle}>My Notifications</Text>
              <Text style={styles.subtitle}>Stay updated with your activities</Text>
            </View>
            <TouchableOpacity
              style={[styles.markAllButton, !canMarkAll && styles.markAllButtonDisabled]}
              onPress={handleMarkAll}
              disabled={!canMarkAll}
              activeOpacity={0.78}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              accessibilityState={{ disabled: !canMarkAll, busy: markingAll }}
            >
              {markingAll ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={17}
                    color={canMarkAll ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.markAllText, !canMarkAll && styles.markAllTextDisabled]}>
                    Mark all
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.filterBar} accessibilityRole="tablist">
            {FILTER_OPTIONS.map((option) => {
              const selected = option.key === selectedFilter;
              const label = selected && option.key === NOTIFICATION_FILTERS.UNREAD
                ? `${option.label} (${unreadCount})`
                : option.label;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filterTab, selected && styles.filterTabSelected]}
                  onPress={() => selectFilter(option.key)}
                  activeOpacity={0.78}
                  accessibilityRole="tab"
                  accessibilityLabel={`${option.label} notifications`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterTabText, selected && styles.filterTabTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {SHOULD_INITIALIZE_NATIVE_PUSH && pushPermission.status === 'denied' ? (
            <View style={styles.permissionNotice}>
              <View style={styles.permissionIcon}>
                <Ionicons name="notifications-off-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.permissionCopy}>
                <Text style={styles.permissionTitle}>Notifications are turned off</Text>
                <Text style={styles.permissionText}>
                  Enable notifications to receive team assignments, reporting-day updates and employee alerts.
                </Text>
                <TouchableOpacity
                  style={styles.permissionButton}
                  onPress={handlePushPermissionAction}
                  disabled={updatingPushPermission}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={pushPermission.canAskAgain
                    ? 'Enable notifications'
                    : 'Open Android notification settings'}
                  accessibilityState={{ busy: updatingPushPermission }}
                >
                  {updatingPushPermission ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.permissionButtonText}>
                      {pushPermission.canAskAgain ? 'Enable notifications' : 'Open Settings'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {refreshError ? (
            <View style={styles.refreshError}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={styles.refreshErrorText} numberOfLines={2}>{refreshError}</Text>
              <TouchableOpacity onPress={onRefresh} accessibilityRole="button" accessibilityLabel="Retry refresh">
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {loading && !hasLoadedDataRef.current ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>Loading notifications...</Text>
            </View>
          ) : null}

          {error && !loading ? (
            <View style={styles.stateCard}>
              <View style={[styles.stateIcon, styles.stateIconError]}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
              </View>
              <Text style={styles.stateTitle}>Unable to load notifications</Text>
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => loadNotifications()}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Retry loading notifications"
              >
                <Ionicons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        !loading && !error ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}>
              <Ionicons name="notifications-off-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>{emptyState.title}</Text>
            <Text style={styles.stateText}>{emptyState.copy}</Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        !loading && !error && pagination.total > 0 ? (
          <View style={styles.paginationCard}>
            <TouchableOpacity
              style={[styles.pageButton, pagination.page === 1 && styles.pageButtonDisabled]}
              onPress={() => changePage(-1)}
              disabled={pagination.page === 1}
              accessibilityRole="button"
              accessibilityLabel="Previous notifications page"
              accessibilityState={{ disabled: pagination.page === 1 }}
            >
              <Ionicons name="chevron-back" size={16} color={pagination.page === 1 ? colors.placeholder : colors.primary} />
              <Text style={[styles.pageButtonText, pagination.page === 1 && styles.pageButtonTextDisabled]}>Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pageIndicator}>{pagination.page} / {pagination.totalPages}</Text>
            <TouchableOpacity
              style={[styles.pageButton, pagination.page === pagination.totalPages && styles.pageButtonDisabled]}
              onPress={() => changePage(1)}
              disabled={pagination.page === pagination.totalPages}
              accessibilityRole="button"
              accessibilityLabel="Next notifications page"
              accessibilityState={{ disabled: pagination.page === pagination.totalPages }}
            >
              <Text style={[styles.pageButtonText, pagination.page === pagination.totalPages && styles.pageButtonTextDisabled]}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color={pagination.page === pagination.totalPages ? colors.placeholder : colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.notifications.background },
  content: { flexGrow: 1, padding: spacing.screen, backgroundColor: colors.notifications.background },
  headerBlock: { marginBottom: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  titleCopy: { flex: 1, minWidth: 0 },
  screenTitle: { color: colors.textPrimary, fontSize: fontSizes.dashboardTitle, fontWeight: fontWeights.extraBold },
  subtitle: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: fontSizes.body, fontWeight: fontWeights.medium },
  filterBar: {
    flexDirection: 'row', padding: spacing.xs, borderRadius: radii.compactCard,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  filterTab: {
    flex: 1, minHeight: sizes.minTouchTarget, alignItems: 'center', justifyContent: 'center',
    borderRadius: radii.pill, paddingHorizontal: spacing.sm,
  },
  filterTabSelected: { backgroundColor: colors.primary },
  filterTabText: { color: colors.textSecondary, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  filterTabTextSelected: { color: colors.white },
  markAllButton: {
    flexShrink: 0,
    minHeight: sizes.minTouchTarget,
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    borderWidth: 1,
    borderColor: colors.notifications.readActionBorder,
    paddingHorizontal: spacing.md,
  },
  markAllButtonDisabled: { backgroundColor: colors.notifications.readActionDisabled },
  markAllText: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: fontWeights.extraBold },
  markAllTextDisabled: { color: colors.textMuted },
  permissionNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg,
    marginTop: spacing.lg, marginBottom: spacing.xl,
    padding: spacing.lg, borderRadius: radii.compactCard, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, ...shadows.subtle,
  },
  permissionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealTintSoft },
  permissionCopy: { flex: 1, minWidth: 0 },
  permissionTitle: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.extraBold },
  permissionText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: fontSizes.base, lineHeight: 19 },
  permissionButton: {
    alignSelf: 'flex-start', minHeight: sizes.minTouchTarget, minWidth: 132, marginTop: spacing.lg,
    paddingHorizontal: spacing.xl, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  permissionButtonText: { color: colors.white, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  refreshError: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg,
    padding: spacing.md, borderRadius: radii.compactCard, borderWidth: 1, borderColor: colors.error,
    backgroundColor: colors.dangerBackground,
  },
  refreshErrorText: { flex: 1, color: colors.textSecondary, fontSize: fontSizes.sm },
  notificationRow: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.primaryTintSoft,
    borderRadius: radii.compactCard, borderWidth: 1, borderColor: colors.notifications.rowBorder,
    padding: spacing.lg, marginBottom: spacing.md, ...shadows.subtle,
  },
  notificationRowRead: { backgroundColor: colors.surface },
  typeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, minWidth: 0 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notificationTitle: { flex: 1, color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.bold },
  notificationTitleRead: { fontWeight: fontWeights.semibold },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.notifications.unreadDot },
  notificationDescription: { marginTop: spacing.xs, color: colors.textSecondary, fontSize: fontSizes.base, lineHeight: 18 },
  notificationTime: { marginTop: spacing.sm, color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  loadingCard: {
    minHeight: 120, borderRadius: radii.compactCard, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, ...shadows.subtle,
  },
  stateCard: {
    minHeight: 132, borderRadius: radii.compactCard, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl, gap: spacing.md, ...shadows.subtle,
  },
  stateIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealTintSoft },
  stateIconError: { backgroundColor: colors.dangerBackground },
  stateTitle: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.extraBold, textAlign: 'center' },
  stateText: { color: colors.textSecondary, fontSize: fontSizes.base, textAlign: 'center', lineHeight: 19 },
  retryButton: {
    minHeight: sizes.minTouchTarget, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl,
  },
  retryText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  paginationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadows.subtle,
  },
  pageButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    paddingHorizontal: spacing.lg,
  },
  pageButtonDisabled: { backgroundColor: colors.mutedBackground },
  pageButtonText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  pageButtonTextDisabled: { color: colors.placeholder },
  pageIndicator: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.extraBold },
});
