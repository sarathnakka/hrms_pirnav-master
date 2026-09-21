import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';

import { colors, fontSizes, fontWeights, sizes, spacing } from '../../theme';
import { ROUTES } from '../../app/navigation/routeNames';

const headerLogo = require('../../../assets/headerlogo.png');

const DRAWER_ITEMS = [
  { label: 'Dashboard', icon: 'grid-outline', tab: ROUTES.DASHBOARD },
  { label: 'My Holidays', icon: 'calendar-outline', tab: ROUTES.MY_HOLIDAYS },
  {
    label: 'Employees',
    icon: 'people-outline',
    group: 'employees',
    children: [
      { label: 'Add Employee Details', icon: 'person-add-outline', tab: ROUTES.EDIT_EMPLOYEE },
    ],
  },
  { label: 'Payslip', icon: 'receipt-outline', tab: ROUTES.PAYSLIP },
  { label: 'My Tickets', icon: 'ticket-outline', tab: ROUTES.MY_TICKETS },
  { label: 'My Attendance', icon: 'time-outline', tab: ROUTES.MY_ATTENDANCE },
  { label: 'Teams', icon: 'people-circle-outline', tab: ROUTES.TEAMS_FLOW, nestedScreen: ROUTES.TEAMS },
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
  const [expandedGroups, setExpandedGroups] = useState({
    employees: activeRoute === ROUTES.EDIT_EMPLOYEE,
  });

  useEffect(() => {
    if (activeRoute === ROUTES.EDIT_EMPLOYEE) {
      setExpandedGroups((current) => ({ ...current, employees: true }));
    }
  }, [activeRoute]);

  const navigateToItem = (item) => {
    if (item.tab) {
      navigation.navigate(ROUTES.MAIN_TABS, {
        screen: item.tab,
        params: item.nestedScreen ? { screen: item.nestedScreen } : undefined,
      });
    } else if (item.route) {
      navigation.navigate(item.route);
    }
    navigation.dispatch(DrawerActions.closeDrawer());
  };

  const toggleGroup = (group) => {
    setExpandedGroups((current) => ({
      ...current,
      [group]: !current[group],
    }));
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
            if (item.children) {
              const isExpanded = Boolean(expandedGroups[item.group]);
              const isGroupActive = item.children.some((child) => activeRoute === child.tab);

              return (
                <View key={item.label}>
                  <TouchableOpacity
                    style={[styles.item, isGroupActive && styles.itemActive]}
                    onPress={() => toggleGroup(item.group)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                    accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                  >
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={isGroupActive ? colors.navigation.drawerActiveIcon : colors.navigation.drawerInactiveIcon}
                    />
                    <Text style={[styles.itemText, isGroupActive && styles.itemTextActive]}>
                      {item.label}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={18}
                      color={isGroupActive ? colors.navigation.drawerActiveIcon : colors.navigation.drawerInactiveIcon}
                      style={styles.chevron}
                    />
                  </TouchableOpacity>

                  {isExpanded && item.children.map((child) => {
                    const isChildActive = activeRoute === child.tab;

                    return (
                      <TouchableOpacity
                        key={child.label}
                        style={[styles.subItem, isChildActive && styles.subItemActive]}
                        onPress={() => navigateToItem(child)}
                        activeOpacity={0.78}
                        accessibilityRole="button"
                        accessibilityLabel={`Navigate to ${child.label}`}
                      >
                        <Ionicons
                          name={child.icon}
                          size={20}
                          color={isChildActive ? colors.navigation.drawerActiveIcon : colors.navigation.drawerInactiveIcon}
                        />
                        <Text style={[styles.subItemText, isChildActive && styles.itemTextActive]}>
                          {child.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            }

            const target = item.tab || item.route;
            const isActive =
              activeRoute === target ||
              (item.tab === ROUTES.TEAMS_FLOW && activeRoute === ROUTES.TEAMS) ||
              (item.tab === ROUTES.TEAMS_FLOW && activeRoute === ROUTES.TEAM_DETAILS) ||
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navigation.drawerHeaderBackground,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.navigation.drawerDivider,
  },
  logo: {
    width: '92%',
    height: 48,
  },
  items: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
    flex: 1,
    marginLeft: spacing.lg,
    color: colors.navigation.drawerInactiveText,
    fontSize: fontSizes.drawerLabel,
    fontWeight: fontWeights.semibold,
  },
  itemTextActive: {
    color: colors.navigation.drawerActiveText,
    fontWeight: fontWeights.extraBold,
  },
  chevron: {
    marginLeft: spacing.md,
  },
  subItem: {
    minHeight: sizes.drawerItemHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.xxl * 2,
    borderRadius: 16,
    marginBottom: spacing.sm,
  },
  subItemActive: {
    backgroundColor: colors.navigation.drawerActiveBackground,
  },
  subItemText: {
    flex: 1,
    marginLeft: spacing.lg,
    color: colors.navigation.drawerInactiveText,
    fontSize: fontSizes.drawerLabel,
    fontWeight: fontWeights.semibold,
  },
});
