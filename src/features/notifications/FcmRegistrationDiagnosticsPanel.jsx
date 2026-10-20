import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSizes, fontWeights, radii, shadows, spacing } from '../../theme';
import {
  FCM_REGISTRATION_DIAGNOSTICS_ENABLED,
  getFcmDiagnosticsSnapshot,
  subscribeToFcmDiagnostics,
} from './fcmRegistrationDiagnostics';

const DIAGNOSTIC_ROWS = [
  ['Manager mounted', 'managerMounted'],
  ['Employee authenticated', 'employeeAuthenticated'],
  ['JWT available', 'jwtAvailable'],
  ['Expo permission', 'permission'],
  ['Native FCM token', 'nativeToken'],
  ['Installation ID', 'installationId'],
  ['Registration triggered', 'registrationTriggered'],
  ['Registration skipped', 'registrationSkipped'],
  ['API session validation', 'sessionValidation'],
  ['HTTP request started', 'httpRequestStarted'],
  ['API endpoint', 'endpoint'],
  ['API host', 'apiHost'],
  ['HTTP result', 'httpResult'],
  ['Backend registration', 'backendRegistration'],
];

export default function FcmRegistrationDiagnosticsPanel() {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(true);
  const diagnostics = useSyncExternalStore(
    subscribeToFcmDiagnostics,
    getFcmDiagnosticsSnapshot,
    getFcmDiagnosticsSnapshot
  );

  if (!FCM_REGISTRATION_DIAGNOSTICS_ENABLED) {
    return null;
  }

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.collapsedButton, { top: insets.top + spacing.md }]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Expand FCM registration diagnostics"
      >
        <Ionicons name="pulse-outline" size={17} color={colors.white} />
        <Text style={styles.collapsedText}>FCM diagnostics</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.panel, { top: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>FCM Registration Diagnostics</Text>
          <Text style={styles.stage} numberOfLines={1}>{diagnostics.lastStage}</Text>
        </View>
        <TouchableOpacity
          style={styles.collapseButton}
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Collapse FCM registration diagnostics"
        >
          <Ionicons name="chevron-up" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
        {DIAGNOSTIC_ROWS.map(([label, key]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value} selectable>{diagnostics[key]}</Text>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.notice}>Sensitive values are intentionally redacted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    maxHeight: 430,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.modal,
  },
  header: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.navigation.headerIconBackground,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stage: {
    marginTop: 2,
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  collapseButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: { maxHeight: 320 },
  row: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  label: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  value: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'right',
  },
  notice: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  collapsedButton: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 1000,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryDark,
    ...shadows.card,
  },
  collapsedText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
});
