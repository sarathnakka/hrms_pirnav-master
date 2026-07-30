import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';

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
  const activeRoute = getActiveRouteName(state);

  const navigateToItem = (item) => {
    if (item.tab) {
      navigation.navigate(ROUTES.MAIN_TABS, { screen: item.tab });
    } else {
      navigation.navigate(item.route);
    }
    navigation.dispatch(DrawerActions.closeDrawer());
  };

  return (
    <View style={styles.container}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image source={headerLogo} style={styles.logo} resizeMode="contain" />
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
});
