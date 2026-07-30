import React, { useCallback, useMemo, useRef, useState } from 'react';
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

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.result)) return payload.result;

  const firstArray = Object.values(payload || {}).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray : [];
}

function normalizeNotification(item) {
  const id = item?.id ?? item?.notificationId;
  const isRead = Boolean(item?.isRead ?? item?.read ?? item?.isread ?? false);

  return {
    id,
    isRead,
    title: item?.title || 'Notification',
    description: item?.description || item?.message || 'No message',
    type: item?.type || 'info',
    time: item?.timeAgo || item?.createdAt || item?.createdOn || item?.date || '',
  };
}

function normalizeNotifications(payload) {
  return extractCollection(payload)
    .map(normalizeNotification)
    .filter((item) => item.id !== undefined && item.id !== null && !item.isRead);
}

function getTypeMeta(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'success') {
    return { icon: 'checkmark-circle-outline', color: colors.notifications.successIcon, backgroundColor: colors.successBackground };
  }
  if (normalized === 'warning') {
    return { icon: 'warning-outline', color: colors.notifications.warningIcon, backgroundColor: colors.warningBackground };
  }
  if (normalized === 'info') {
    return { icon: 'information-circle-outline', color: colors.notifications.infoIcon, backgroundColor: colors.infoBackground };
  }
  return { icon: 'notifications-outline', color: colors.primary, backgroundColor: colors.tealTintSoft };
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.length;
  const canMarkAll = unreadCount > 0 && !markingAll;

  const loadNotifications = useCallback(
    async ({ refresh = false, signal } = {}) => {
      if (!token) return;
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const response = await getUserNotifications(token, { signal });
        if (!mountedRef.current) return;
        setNotifications(normalizeNotifications(response));
      } catch (requestError) {
        if (!mountedRef.current || signal?.aborted) return;
        setError(requestError.message || 'Unable to load notifications.');
      } finally {
        if (!mountedRef.current || signal?.aborted) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      const controller = new AbortController();
      loadNotifications({ signal: controller.signal });
      return () => {
        mountedRef.current = false;
        controller.abort();
      };
    }, [loadNotifications])
  );

  const onRefresh = useCallback(() => {
    loadNotifications({ refresh: true });
  }, [loadNotifications]);

  const handleMarkOne = async (notification) => {
    if (notification?.id === undefined || notification?.id === null || updatingId === notification.id || markingAll) return;

    const previous = notifications;
    setUpdatingId(notification.id);
    setNotifications((current) => current.filter((item) => item.id !== notification.id));

    try {
      await markNotificationAsRead(notification.id, token);
    } catch (requestError) {
      setNotifications(previous);
      Alert.alert('Unable to update', requestError.message || 'Please try again.');
      loadNotifications({ refresh: true });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMarkAll = async () => {
    if (!canMarkAll) return;

    const previous = notifications;
    setMarkingAll(true);
    setNotifications([]);

    try {
      await markAllNotificationsAsRead(token);
    } catch (requestError) {
      setNotifications(previous);
      Alert.alert('Unable to update', requestError.message || 'Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const renderNotification = ({ item }) => {
    const meta = getTypeMeta(item.type);
    const isUpdating = updatingId === item.id || markingAll;

    return (
      <TouchableOpacity
        style={styles.notificationRow}
        onPress={() => handleMarkOne(item)}
        disabled={isUpdating}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.description}. Mark as read.`}
        accessibilityState={{ busy: isUpdating }}
      >
        <View style={[styles.typeIcon, { backgroundColor: meta.backgroundColor }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationTitleRow}>
            <Text style={styles.notificationTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.unreadDot} />
          </View>
          <Text style={styles.notificationDescription} numberOfLines={2}>{item.description}</Text>
          {!!item.time && <Text style={styles.notificationTime}>{isUpdating ? 'Updating...' : item.time}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const listData = useMemo(() => (loading ? [] : notifications), [loading, notifications]);

  return (
    <FlatList
      data={listData}
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
              <Text style={styles.subtitle}>
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.markAllButton, !canMarkAll && styles.markAllButtonDisabled]}
              onPress={handleMarkAll}
              disabled={!canMarkAll}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              accessibilityState={{ disabled: !canMarkAll, busy: markingAll }}
            >
              {markingAll ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.markAllText, !canMarkAll && styles.markAllTextDisabled]}>
                  Mark all as read
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>Loading notifications...</Text>
            </View>
          )}

          {!!error && !loading && (
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
          )}
        </View>
      }
      ListEmptyComponent={
        !loading && !error ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}>
              <Ionicons name="notifications-off-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>No notifications</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screen,
    backgroundColor: colors.notifications.background,
  },
  headerBlock: {
    marginBottom: spacing.sectionGap,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  markAllButton: {
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.notifications.readActionBackground,
    borderWidth: 1,
    borderColor: colors.notifications.readActionBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  markAllButtonDisabled: {
    backgroundColor: colors.notifications.readActionDisabled,
  },
  markAllText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  markAllTextDisabled: {
    color: colors.textMuted,
  },
  notificationRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: colors.notifications.unreadRow,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.notifications.rowBorder,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    ...shadows.subtle,
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notificationTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.notifications.unreadDot,
  },
  notificationDescription: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
  },
  notificationTime: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  loadingCard: {
    minHeight: 120,
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    ...shadows.subtle,
  },
  stateCard: {
    minHeight: 132,
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadows.subtle,
  },
  stateIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  stateIconError: {
    backgroundColor: colors.dangerBackground,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
