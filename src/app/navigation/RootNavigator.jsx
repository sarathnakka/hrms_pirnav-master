import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../../features/auth/AuthContext';
import AppLoader from '../../shared/components/AppLoader';
import AppDrawerNavigator from './AppDrawerNavigator';
import AuthNavigator from './AuthNavigator';
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

  if (isInitializing) {
    return <AppLoader />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AuthenticatedNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
