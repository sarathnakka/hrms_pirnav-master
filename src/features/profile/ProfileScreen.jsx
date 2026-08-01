import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROUTES } from '../../app/navigation/routeNames';
import { getMyEmployeeDetails } from '../employees/employeeProfileApi';
import { normalizeEmployeeProfile } from '../employees/employeeProfileMappers';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';

function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return '';
}

function fallbackName(user = {}) {
  return (
    text(user.employeeName) ||
    text(user.fullName) ||
    text(user.name) ||
    `${text(user.firstName)} ${text(user.lastName)}`.replace(/\s+/g, ' ').trim()
  );
}

function getFullName(profile, user) {
  const personal = profile?.personal || {};
  const apiName = `${text(personal.firstName)} ${text(personal.middleName)} ${text(personal.lastName)}`
    .replace(/\s+/g, ' ')
    .trim();
  return apiName || fallbackName(user) || 'Employee';
}

function getInitials(name) {
  return String(name || 'Employee')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'E';
}

function fallbackEmployeeId(user = {}) {
  return text(user.employeeId || user.employee_Id || user.employeeCode || user.userId);
}

function fallbackDesignation(user = {}) {
  return text(user.designation || user.roleName || user.employeeRole || user.role) || 'Employee';
}

function fallbackDepartment(user = {}) {
  return text(user.department || user.departmentName || user.department_Name);
}

function fallbackEmail(user = {}) {
  return text(user.email || user.emailAddress);
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || 'Not provided'}</Text>
      </View>
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View style={styles.profileCard}>
      <View style={styles.skeletonAvatar} />
      {[0, 1, 2, 3, 4].map((item) => (
        <View key={item} style={styles.skeletonRow}>
          <View style={styles.skeletonIcon} />
          <View style={styles.skeletonRowText}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLarge} />
          </View>
        </View>
      ))}
      <View style={styles.skeletonButton} />
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [logoutLoading, setLogoutLoading] = useState(false);

  const loadProfile = useCallback(async ({ refresh = false } = {}) => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current = controller;
    setError('');
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const payload = await getMyEmployeeDetails(token, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const normalizedProfile = normalizeEmployeeProfile(payload);
      setProfile(normalizedProfile);
    } catch (nextError) {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setError(nextError?.message || 'Unable to load complete employee details.');
      }
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      return () => abortRef.current?.abort();
    }, [loadProfile])
  );

  const details = useMemo(() => {
    const personal = profile?.personal || {};
    const fullName = getFullName(profile, user);
    const email = text(personal.email) || fallbackEmail(user);
    const fallbackIdentity = fallbackName(user) || fallbackEmail(user) || 'Employee';

    return {
      fullName,
      initials: getInitials(fullName === 'Employee' ? fallbackIdentity : fullName),
      employeeId: profile?.employeeId || text(personal.employeeId) || fallbackEmployeeId(user),
      designation: text(personal.designation) || fallbackDesignation(user),
      department: text(personal.department) || fallbackDepartment(user),
      email,
      hasApiProfile: Boolean(profile),
    };
  }, [profile, user]);

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of PIRNAV HRMS?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setLogoutLoading(true);
          try {
            await logout();
          } finally {
            setLogoutLoading(false);
          }
        },
      },
    ]);
  };

  const openEditProfile = () => {
    navigation.navigate(ROUTES.EDIT_EMPLOYEE);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 3 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadProfile({ refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading && !profile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{details.initials}</Text>
              </View>

              {!details.hasApiProfile && (
                <View style={styles.notice}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.noticeText}>Complete your employee details to keep your profile up to date.</Text>
                </View>
              )}

              {!!error && (
                <View style={styles.statusBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.profile.statusText} />
                  <Text style={styles.statusText}>Some profile details could not be refreshed.</Text>
                  <TouchableOpacity onPress={() => loadProfile({ refresh: true })} accessibilityRole="button">
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.infoBlock}>
                <InfoRow icon="person-outline" label="Full Name" value={details.fullName} />
                <InfoRow icon="id-card-outline" label="Employee ID" value={details.employeeId} />
                <InfoRow icon="mail-outline" label="Work Email" value={details.email} />
                <InfoRow icon="briefcase-outline" label="Designation" value={details.designation} />
                <InfoRow icon="business-outline" label="Department" value={details.department} />
              </View>

              <TouchableOpacity
                style={styles.editButton}
                onPress={openEditProfile}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Edit Profile Details"
              >
                <Ionicons name="create-outline" size={20} color={colors.white} />
                <Text style={styles.editButtonText}>Edit Profile Details</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.logoutSection}>
              <TouchableOpacity
                style={[styles.logoutButton, logoutLoading && styles.logoutButtonDisabled]}
                onPress={confirmLogout}
                disabled={logoutLoading}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Logout"
                accessibilityState={{ disabled: logoutLoading }}
              >
                {logoutLoading ? (
                  <ActivityIndicator color={colors.navigation.logout} />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={20} color={colors.navigation.logout} />
                    <Text style={styles.logoutText}>Logout</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.profile.background,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: spacing.screen,
  },
  profileCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.profile.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.profile.border,
    padding: spacing.xxl,
    ...shadows.dashboard,
  },
  avatar: {
    width: sizes.profileAvatarCompact,
    height: sizes.profileAvatarCompact,
    borderRadius: sizes.profileAvatarCompact / 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.profile.avatarBackground,
    borderWidth: 1,
    borderColor: colors.profile.avatarBorder,
    marginBottom: spacing.xxl,
  },
  avatarText: {
    color: colors.primary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.profile.noticeBackground,
    borderWidth: 1,
    borderColor: colors.profile.border,
  },
  noticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 18,
    fontWeight: fontWeights.medium,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.profile.statusBackground,
    borderWidth: 1,
    borderColor: colors.profile.statusBorder,
  },
  statusText: {
    flex: 1,
    color: colors.profile.statusText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  infoBlock: {
    marginTop: spacing.l,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.profile.border,
    backgroundColor: colors.profile.infoSurface,
    overflow: 'hidden',
  },
  infoRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.profile.divider,
  },
  infoIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.profile.iconBackground,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  infoValue: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    lineHeight: lineHeights.body,
  },
  editButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.profile.editButton,
    paddingHorizontal: spacing.xxl,
    ...shadows.primary,
  },
  editButtonText: {
    flexShrink: 1,
    color: colors.white,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  logoutSection: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: spacing.sectionGap,
  },
  logoutButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.navigation.logoutBackground,
    borderWidth: 1,
    borderColor: colors.navigation.logoutBorder,
  },
  logoutButtonDisabled: {
    opacity: 0.65,
  },
  logoutText: {
    color: colors.navigation.logout,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  skeletonAvatar: {
    width: sizes.profileAvatarCompact,
    height: sizes.profileAvatarCompact,
    borderRadius: sizes.profileAvatarCompact / 2,
    alignSelf: 'center',
    marginBottom: spacing.xxl,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.profile.divider,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonRowText: {
    flex: 1,
    minWidth: 0,
  },
  skeletonLineLarge: {
    width: '68%',
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonLineShort: {
    width: '34%',
    height: 12,
    marginBottom: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonButton: {
    height: sizes.buttonHeight,
    marginTop: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.profile.skeleton,
  },
});
