import React from 'react';
import { NavigationContainer } from '@react-navigation/native';

import { useAuth } from '../../features/auth/AuthContext';
import AppLoader from '../../shared/components/AppLoader';
import AppDrawerNavigator from './AppDrawerNavigator';
import AuthNavigator from './AuthNavigator';

export default function RootNavigator() {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return <AppLoader />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppDrawerNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
