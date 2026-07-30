import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';

function getDisplayName(user = {}) {
  return (
    user?.employeeName ||
    user?.name ||
    user?.fullName ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    user?.email ||
    'Employee'
  );
}

function getInitials(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'E';
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const displayName = getDisplayName(user);
  const email = user?.email || user?.emailAddress;
  const role = user?.role || user?.roleName || user?.designation || user?.employeeRole || 'Employee';

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of PIRNAV HRMS?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          </View>

          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
            {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
            {!!role && (
              <View style={styles.rolePill}>
                <Ionicons name="briefcase-outline" size={15} color={colors.primary} />
                <Text style={styles.roleText} numberOfLines={1}>{role}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={confirmLogout}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.navigation.logout} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.message}>This module is ready for feature integration.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navigation.screenBackground,
  },
  content: {
    padding: spacing.screen,
    paddingBottom: sizes.floatingTabHeight + spacing.xxxl * 3,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.navigation.profileCardBorder,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    ...shadows.card,
  },
  avatar: {
    width: sizes.profileAvatarLarge,
    height: sizes.profileAvatarLarge,
    borderRadius: sizes.profileAvatarLarge / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navigation.profileAvatarBackground,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  avatarText: {
    color: colors.primary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  profileText: {
    marginBottom: spacing.xxl,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 26,
  },
  email: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  rolePill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealTintSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleText: {
    color: colors.primary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  logoutButton: {
    minHeight: sizes.buttonHeight,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.navigation.logoutBackground,
    borderWidth: 1,
    borderColor: colors.navigation.logoutBorder,
  },
  logoutText: {
    color: colors.navigation.logout,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
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
