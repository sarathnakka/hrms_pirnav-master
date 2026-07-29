import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import CreateAccountScreen from '../../features/auth/screens/CreateAccountScreen';
import ForgotPasswordScreen from '../../features/auth/screens/ForgotPasswordScreen';
import LoginScreen from '../../features/auth/screens/LoginScreen';
import ResetPasswordScreen from '../../features/auth/screens/ResetPasswordScreen';
import VerifyOtpScreen from '../../features/auth/screens/VerifyOtpScreen';
import { colors } from '../../theme';
import { ROUTES } from './routeNames';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ROUTES.LOGIN}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} />
      <Stack.Screen name={ROUTES.FORGOT_PASSWORD} component={ForgotPasswordScreen} />
      <Stack.Screen name={ROUTES.VERIFY_OTP} component={VerifyOtpScreen} />
      <Stack.Screen name={ROUTES.RESET_PASSWORD} component={ResetPasswordScreen} />
      <Stack.Screen name={ROUTES.CREATE_ACCOUNT} component={CreateAccountScreen} />
    </Stack.Navigator>
  );
}
