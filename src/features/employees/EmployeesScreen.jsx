import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, spacing } from '../../theme';

export default function EmployeesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Employees</Text>
      <Text style={styles.message}>This module is ready for feature integration.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navigation.screenBackground,
    padding: spacing.screen,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  message: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
});
