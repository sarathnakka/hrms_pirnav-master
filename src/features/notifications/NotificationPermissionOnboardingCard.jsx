import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  shadows,
  spacing,
} from '../../theme';
import {
  dismissNotificationPermissionOnboarding,
  getNotificationPermissionSnapshot,
  markUpgradeNotificationOnboardingOffered,
  openAndroidNotificationSettings,
  requestAndroidNotificationPermission,
  subscribeToNotificationPermission,
} from './pushNotificationService';

export default function NotificationPermissionOnboardingCard() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const permission = useSyncExternalStore(
    subscribeToNotificationPermission,
    getNotificationPermissionSnapshot,
    getNotificationPermissionSnapshot
  );

  useEffect(() => {
    if (permission.showUpgradeOnboarding) {
      markUpgradeNotificationOnboardingOffered();
    }
  }, [permission.showUpgradeOnboarding]);

  if (!permission.showUpgradeOnboarding) {
    return null;
  }

  const handlePrimaryAction = async () => {
    if (busy) return;

    setBusy(true);
    try {
      if (permission.canAskAgain) {
        await requestAndroidNotificationPermission();
      } else {
        await openAndroidNotificationSettings();
      }
    } catch {
      Alert.alert(
        'Unable to update notifications',
        'Please try again or enable notifications from Android Settings.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNotNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dismissNotificationPermissionOnboarding();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { bottom: insets.bottom + 96 }]}>
      <View style={styles.icon}>
        <Ionicons name="notifications-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Stay updated with PeopleHRSync</Text>
        <Text style={styles.description}>
          Receive team assignments, reporting-day updates and important employee notifications.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleNotNow}
            disabled={busy}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePrimaryAction}
            disabled={busy}
            style={styles.primaryButton}
            accessibilityRole="button"
            accessibilityLabel={permission.canAskAgain
              ? 'Enable notifications'
              : 'Open Android settings'}
            accessibilityState={{ busy }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {permission.canAskAgain ? 'Enable notifications' : 'Open Settings'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 900,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.modal,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  description: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  secondaryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  primaryButton: {
    minWidth: 142,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
