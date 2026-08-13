import React from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/app/navigation/RootNavigator';
import { AuthProvider } from './src/features/auth/AuthContext';
import { StartupGate } from './src/shared/components/StartupAnimation';
import { colors } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.statusBar} />
      <AuthProvider>
        <StartupGate>
          <RootNavigator />
        </StartupGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.statusBar,
  },
});
