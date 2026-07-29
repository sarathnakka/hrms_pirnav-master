import React from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';

import { useAuth } from '../../features/auth/AuthContext';
import { colors, fontSizes, fontWeights, sizes, spacing } from '../../theme';
import { ROUTES } from '../../app/navigation/routeNames';

const headerLogo = require('../../../assets/headerlogo.png');

const DRAWER_ITEMS = [
  { label: 'Dashboard', icon: 'grid-outline', tab: ROUTES.DASHBOARD },
  { label: 'My Holidays', icon: 'calendar-outline', route: ROUTES.MY_HOLIDAYS },
  { label: 'Employees', icon: 'people-outline', route: ROUTES.EMPLOYEES },
  { label: 'Payslip', icon: 'receipt-outline', route: ROUTES.PAYSLIP },
  { label: 'My Attendance', icon: 'time-outline', tab: ROUTES.MY_ATTENDANCE },
  { label: 'Teams', icon: 'people-circle-outline', route: ROUTES.TEAMS },
  { label: 'Employee Leaves', icon: 'document-text-outline', tab: ROUTES.EMPLOYEE_LEAVES },
];

function getActiveRouteName(state) {
  const route = state.routes[state.index || 0];
  if (route?.state) return getActiveRouteName(route.state);
  return route?.name;
}

export default function AppDrawerContent(props) {
  const { navigation, state } = props;
  const { logout, user } = useAuth();
  const activeRoute = getActiveRouteName(state);

  const navigateToItem = (item) => {
    if (item.tab) {
      navigation.navigate(ROUTES.MAIN_TABS, { screen: item.tab });
    } else {
      navigation.navigate(item.route);
    }
    navigation.dispatch(DrawerActions.closeDrawer());
  };

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of PIRNAV HRMS?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const displayName = user?.fullName || user?.name || user?.email || 'PIRNAV User';
  const role = user?.role || user?.roleName || user?.designation;
  const email = user?.email;
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.container}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image source={headerLogo} style={styles.logo} resizeMode="contain" />
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              {role && <Text style={styles.userRole} numberOfLines={1}>{role}</Text>}
              {email && email !== displayName && <Text style={styles.userEmail} numberOfLines={1}>{email}</Text>}
            </View>
            <TouchableOpacity
              style={styles.logoutPill}
              onPress={confirmLogout}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={20} color={colors.navigation.logout} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.items}>
          {DRAWER_ITEMS.map((item) => {
            const target = item.tab || item.route;
            const isActive =
              activeRoute === target ||
              (activeRoute === ROUTES.MAIN_TABS && item.tab === ROUTES.DASHBOARD);

            return (
              <TouchableOpacity
                key={item.label}
                style={[styles.item, isActive && styles.itemActive]}
                onPress={() => navigateToItem(item)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${item.label}`}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={isActive ? colors.navigation.drawerActiveIcon : colors.navigation.drawerInactiveIcon}
                />
                <Text style={[styles.itemText, isActive && styles.itemTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </DrawerContentScrollView>

      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.footerText}>Secure session active</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navigation.drawerBackground,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    backgroundColor: colors.navigation.drawerHeaderBackground,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.navigation.drawerDivider,
  },
  logo: {
    width: '100%',
    height: 70,
  },
  profileCard: {
    marginTop: spacing.lg,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navigation.profileBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.navigation.drawerDivider,
    padding: spacing.lg,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navigation.profileAvatarBackground,
    marginRight: spacing.lg,
  },
  avatarText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  profileText: {
    flex: 1,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  userRole: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  userEmail: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  logoutPill: {
    minWidth: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    marginLeft: spacing.md,
  },
  logoutText: {
    marginLeft: spacing.xs,
    color: colors.navigation.logout,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  items: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  item: {
    minHeight: sizes.drawerItemHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.sm,
  },
  itemActive: {
    backgroundColor: colors.navigation.drawerActiveBackground,
  },
  itemText: {
    marginLeft: spacing.lg,
    color: colors.navigation.drawerInactiveText,
    fontSize: fontSizes.drawerLabel,
    fontWeight: fontWeights.semibold,
  },
  itemTextActive: {
    color: colors.navigation.drawerActiveText,
    fontWeight: fontWeights.extraBold,
  },
  footerNote: {
    borderTopWidth: 1,
    borderTopColor: colors.navigation.drawerDivider,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  footerText: {
    marginLeft: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
