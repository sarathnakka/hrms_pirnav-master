import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../../features/auth/AuthContext';
import PushNotificationManager from '../../features/notifications/PushNotificationManager';
import AppLoader from '../../shared/components/AppLoader';
import AppDrawerNavigator from './AppDrawerNavigator';
import AuthNavigator from './AuthNavigator';
import { navigationRef } from './navigationRef';
import { ROUTES } from './routeNames';

const Stack = createStackNavigator();

function AuthenticatedNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name={ROUTES.APP_DRAWER}
        component={AppDrawerNavigator}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);

  if (isInitializing) {
    return <AppLoader />;
  }

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => setNavigationReady(true)}
      >
        {isAuthenticated ? <AuthenticatedNavigator /> : <AuthNavigator />}
      </NavigationContainer>
      <PushNotificationManager navigationReady={navigationReady} />
    </>
  );
}
