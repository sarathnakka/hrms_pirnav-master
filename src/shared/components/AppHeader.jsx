import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthContext';
import { ROUTES } from '../../app/navigation/routeNames';
import { colors, fontSizes, fontWeights, shadows, sizes, spacing } from '../../theme';

const iconLogo = require('../../../assets/iconlogo.png');

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getDisplayName(user = {}) {
  return (
    user?.employeeName ||
    user?.name ||
    user?.fullName ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    user?.email ||
    ''
  );
}

function navigateToNotifications(navigation) {
  let target = navigation;

  while (target) {
    const routeNames = target.getState?.()?.routeNames || [];
    if (routeNames.includes(ROUTES.NOTIFICATIONS)) {
      target.navigate(ROUTES.NOTIFICATIONS);
      return;
    }
    target = target.getParent?.();
  }

  navigation.navigate(ROUTES.NOTIFICATIONS);
}

export default function AppHeader({
  navigation,
  title,
  showBackButton = false,
  showNotificationButton = true,
}) {
  const { user } = useAuth();
  const displayName = getDisplayName(user);
  const firstName = displayName.split(/\s+/)[0] || '';
  const headerTitle =
    title === 'Dashboard'
      ? `${getGreeting()}${firstName ? `, ${firstName}` : ''}`
      : title;

  const openDrawer = () => {
    if (showBackButton && navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={openDrawer}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={showBackButton ? 'Go back' : 'Open navigation drawer'}
        >
          <Ionicons
            name={showBackButton ? 'chevron-back' : 'menu'}
            size={sizes.headerIcon}
            color={colors.textPrimary}
          />
        </TouchableOpacity>

        <Image
          source={iconLogo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="PIRNAV logo"
        />

        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>

        {showNotificationButton && (
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigateToNotifications(navigation)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.navigation.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.subtle,
  },
  container: {
    minHeight: sizes.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    gap: spacing.md,
  },
  iconButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: sizes.minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navigation.headerIconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    flex: 1,
    color: colors.navigation.headerTitle,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'left',
  },
  logo: {
    width: sizes.headerLogoWidth,
    height: sizes.headerLogoHeight,
  },
  notificationButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: sizes.minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
