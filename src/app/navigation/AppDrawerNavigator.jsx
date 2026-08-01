import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';

import AppDrawerContent from '../../shared/components/AppDrawerContent';
import AppHeader from '../../shared/components/AppHeader';
import { colors, sizes } from '../../theme';
import AppTabNavigator from './AppTabNavigator';
import { ROUTES } from './routeNames';

const Drawer = createDrawerNavigator();

export default function AppDrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={({ navigation, route }) => ({
        headerShown: route.name !== ROUTES.MAIN_TABS,
        header: route.name === ROUTES.MAIN_TABS
          ? undefined
          : () => <AppHeader navigation={navigation} title={route.name} />,
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
    </Drawer.Navigator>
  );
}
