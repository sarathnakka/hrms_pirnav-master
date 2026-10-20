import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const NATIVE_FCM_PUSH_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_FCM_PUSH === 'true';

export const FCM_REGISTRATION_DIAGNOSTICS_ENABLED =
  NATIVE_FCM_PUSH_ENABLED &&
  process.env.EXPO_PUBLIC_FCM_REGISTRATION_DIAGNOSTICS === 'true';

export const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const SHOULD_INITIALIZE_NATIVE_PUSH =
  NATIVE_FCM_PUSH_ENABLED && Platform.OS === 'android' && !IS_EXPO_GO;
