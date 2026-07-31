import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';

import EmployeesScreen from '../../features/employees/EmployeesScreen';
import AppDrawerContent from '../../shared/components/AppDrawerContent';
import AppHeader from '../../shared/components/AppHeader';
import { colors, sizes } from '../../theme';
import AppTabNavigator from './AppTabNavigator';
import { ROUTES } from './routeNames';

const Drawer = createDrawerNavigator();

const DRAWER_TITLES = {
  [ROUTES.EMPLOYEES]: 'Employees',
};

export default function AppDrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={({ navigation, route }) => ({
        headerShown: route.name !== ROUTES.MAIN_TABS,
        header: route.name === ROUTES.MAIN_TABS
          ? undefined
          : () => <AppHeader navigation={navigation} title={DRAWER_TITLES[route.name] || route.name} />,
        drawerType: 'front',
        drawerStyle: {
          width: sizes.drawerWidth,
          backgroundColor: colors.navigation.drawerBackground,
        },
        overlayColor: colors.overlay,
        sceneStyle: { backgroundColor: colors.navigation.screenBackground },
        swipeEnabled: true,
      })}
    >
      <Drawer.Screen
        name={ROUTES.MAIN_TABS}
        component={AppTabNavigator}
        options={{ title: 'Dashboard' }}
      />
      <Drawer.Screen
        name={ROUTES.EMPLOYEES}
        component={EmployeesScreen}
        options={{ title: 'Employees' }}
      />
    </Drawer.Navigator>
  );
}
