import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { ROUTES } from '../../app/navigation/routeNames';
import { getMyEmployeeDetails } from '../employees/employeeProfileApi';
import { normalizeEmployeeProfile } from '../employees/employeeProfileMappers';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';

const PRIVACY_POLICY_URL = 'https://peoplehrsync.com/privacy-policy';
const ACCOUNT_DELETION_URL = 'https://peoplehrsync.com/account-deletion';

const PROFILE_ROWS = [
  { key: 'fullName', label: 'Full Name', icon: 'person-outline' },
  { key: 'employeeId', label: 'Employee ID', icon: 'id-card-outline' },
  { key: 'email', label: 'Work Email', icon: 'mail-outline' },
  { key: 'designation', label: 'Designation', icon: 'briefcase-outline' },
  { key: 'department', label: 'Department', icon: 'business-outline' },
];

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

function ProfileHero({ details, compact }) {
  return (
    <View style={styles.heroShadowContainer}>
      <View style={[styles.heroClipContainer, compact && styles.heroCompact]}>
        <Svg
          style={StyleSheet.absoluteFillObject}
          width="100%"
          height="100%"
          viewBox="0 0 1000 400"
          preserveAspectRatio="xMidYMid slice"
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id="profileHero" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.profile.heroStart} />
              <Stop offset="0.55" stopColor={colors.profile.heroMiddle} />
              <Stop offset="1" stopColor={colors.profile.heroEnd} />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1000" height="400" fill="url(#profileHero)" />
          <Circle cx="930" cy="-25" r="170" fill={colors.profile.heroDecoration} />
          <Circle cx="950" cy="430" r="230" fill={colors.profile.heroDecorationSoft} />
          <Circle cx="-30" cy="420" r="190" fill={colors.profile.heroDecorationSoft} />
        </Svg>

        <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
          <View style={[styles.heroAvatar, compact && styles.heroAvatarCompact]}>
            <Text style={[styles.heroAvatarText, compact && styles.heroAvatarTextCompact]}>
              {details.initials}
            </Text>
          </View>

          <View style={styles.heroDetails}>
            <Text style={[styles.heroName, compact && styles.heroNameCompact]}>
              {details.fullName}
            </Text>
            <View style={styles.employeeIdBadge}>
              <Text style={styles.employeeIdBadgeText}>{details.employeeId || 'Not provided'}</Text>
            </View>
            <Text style={styles.heroMeta}>{details.designation || 'Not provided'}</Text>
            <Text style={styles.heroMeta}>{details.department || 'Not provided'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, isLast }) {
  return (
    <View style={[styles.infoRow, isLast && styles.infoRowLast]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color={colors.profile.icon} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || 'Not provided'}</Text>
      </View>
    </View>
  );
}

function ActionCard({ icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity
      style={styles.actionCard}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={21} color={colors.profile.icon} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.profile.actionChevron} />
    </TouchableOpacity>
  );
}

function ProfileSkeleton({ compact }) {
  return (
    <View accessible accessibilityLabel="Loading employee profile">
      <View style={styles.heroShadowContainer}>
        <View style={[styles.heroClipContainer, compact && styles.heroCompact, styles.skeletonHero]}>
          <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
            <View style={[styles.skeletonAvatar, compact && styles.heroAvatarCompact]} />
            <View style={styles.skeletonHeroCopy}>
              <View style={styles.skeletonHeroName} />
              <View style={styles.skeletonHeroBadge} />
              <View style={styles.skeletonHeroMeta} />
              <View style={styles.skeletonHeroMetaShort} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.detailsCardShadow}>
        <View style={[styles.detailsCard, styles.skeletonDetailsCard]}>
          {PROFILE_ROWS.map((item, index) => (
            <View
              key={item.key}
              style={[styles.skeletonRow, index === PROFILE_ROWS.length - 1 && styles.infoRowLast]}
            >
              <View style={styles.skeletonIcon} />
              <View style={styles.skeletonRowText}>
                <View style={styles.skeletonLineShort} />
                <View style={styles.skeletonLineLarge} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {[0, 1, 2].map((item) => <View key={item} style={styles.skeletonAction} />)}
      <View style={styles.skeletonLogout} />
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 360;
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
      setProfile(normalizeEmployeeProfile(payload));
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
    const fallbackIdentity = fallbackName(user) || fallbackEmail(user) || 'Employee';

    return {
      fullName,
      initials: getInitials(fullName === 'Employee' ? fallbackIdentity : fullName),
      employeeId: profile?.employeeId || text(personal.employeeId) || fallbackEmployeeId(user),
      designation: text(personal.designation) || fallbackDesignation(user),
      department: text(personal.department) || fallbackDepartment(user),
      email: text(personal.email) || fallbackEmail(user),
      hasApiProfile: Boolean(profile),
    };
  }, [profile, user]);

  const openWebsite = useCallback(async (url, pageName) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open page', `Please try opening the ${pageName} again.`);
    }
  }, []);

  const confirmLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of PeopleHRSync?', [
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 2 },
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
          <ProfileSkeleton compact={compact} />
        ) : (
          <>
            <ProfileHero details={details} compact={compact} />

            <View style={styles.detailsCardShadow}>
              <View style={styles.detailsCard}>
                {PROFILE_ROWS.map((item, index) => (
                  <InfoRow
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    value={details[item.key]}
                    isLast={index === PROFILE_ROWS.length - 1}
                  />
                ))}
              </View>
            </View>

            {!details.hasApiProfile && (
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.noticeText}>
                  Complete your employee details to keep your profile up to date.
                </Text>
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

            <View style={styles.actions}>
              <ActionCard
                icon="create-outline"
                title="Edit Profile Details"
                subtitle="Update your personal and professional information"
                onPress={() => navigation.navigate(ROUTES.EDIT_EMPLOYEE)}
              />
              <ActionCard
                icon="shield-checkmark-outline"
                title="Privacy Policy"
                subtitle="Read our Privacy Policy"
                onPress={() => openWebsite(PRIVACY_POLICY_URL, 'Privacy Policy')}
              />
              <ActionCard
                icon="document-text-outline"
                title="Account Deletion"
                subtitle="Request account deletion or deactivation"
                onPress={() => openWebsite(ACCOUNT_DELETION_URL, 'Account Deletion page')}
              />
            </View>

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
                <ActivityIndicator color={colors.profile.logout} />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={23} color={colors.profile.logout} />
                  <Text style={styles.logoutText}>Logout</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.footer} accessible accessibilityRole="text">
              <View style={styles.footerLine} />
              <Text style={styles.footerText}>Powered by Pirnav Software Solutions Private Limited</Text>
              <View style={styles.footerLine} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.profile.background },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
  },
  heroShadowContainer: {
    width: '100%',
    borderRadius: radii.compactCard,
    backgroundColor: colors.profile.heroMiddle,
    ...shadows.dashboard,
  },
  heroClipContainer: {
    width: '100%',
    minHeight: 172,
    overflow: 'hidden',
    borderRadius: radii.compactCard,
    backgroundColor: colors.profile.heroMiddle,
  },
  heroCompact: { minHeight: 164 },
  heroContent: {
    minHeight: 172,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.xxl,
    paddingBottom: 34,
  },
  heroContentCompact: {
    minHeight: 164,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 32,
  },
  heroAvatar: {
    width: 84,
    height: 84,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 42,
    backgroundColor: colors.profile.heroAvatarBackground,
    borderWidth: 4,
    borderColor: colors.profile.heroAvatarBorder,
  },
  heroAvatarCompact: { width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  heroAvatarText: {
    color: colors.profile.heroAvatarText,
    fontSize: 24,
    fontWeight: fontWeights.extraBold,
  },
  heroAvatarTextCompact: { fontSize: 21 },
  heroDetails: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  heroName: {
    width: '100%',
    color: colors.profile.valueText,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: fontWeights.extraBold,
  },
  heroNameCompact: { fontSize: 17, lineHeight: 21 },
  employeeIdBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.profile.heroBadgeBackground,
  },
  employeeIdBadgeText: {
    color: colors.profile.heroBadgeText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  heroMeta: {
    width: '100%',
    marginTop: spacing.xs,
    color: colors.profile.metaText,
    fontSize: fontSizes.base,
    lineHeight: 18,
    fontWeight: fontWeights.medium,
  },
  detailsCardShadow: {
    marginTop: -22,
    marginHorizontal: spacing.lg,
    borderRadius: radii.compactCard,
    backgroundColor: colors.profile.surface,
    ...shadows.card,
  },
  detailsCard: {
    overflow: 'hidden',
    backgroundColor: colors.profile.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.profile.border,
  },
  infoRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.profile.divider,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.profile.iconBackground,
  },
  infoText: { flex: 1, minWidth: 0 },
  infoLabel: {
    color: colors.profile.labelText,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  infoValue: {
    marginTop: 2,
    color: colors.profile.valueText,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.body,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sectionGap,
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
    marginTop: spacing.sectionGap,
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
  retryText: { color: colors.primaryDark, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  actions: { gap: spacing.md, marginTop: spacing.xxl },
  actionCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.profile.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.profile.border,
    ...shadows.dashboard,
  },
  actionIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.profile.iconBackground,
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: {
    color: colors.profile.valueText,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  actionSubtitle: {
    marginTop: spacing.xs,
    color: colors.profile.labelText,
    fontSize: fontSizes.base,
    lineHeight: 18,
    fontWeight: fontWeights.medium,
  },
  logoutButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.profile.logoutBackground,
    borderWidth: 1,
    borderColor: colors.profile.logoutBorder,
  },
  logoutButtonDisabled: { opacity: 0.65 },
  logoutText: {
    color: colors.profile.logout,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: colors.profile.footerLine },
  footerText: {
    flexShrink: 1,
    color: colors.profile.footerText,
    fontSize: fontSizes.sm,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  skeletonHero: {
    backgroundColor: colors.profile.skeleton,
  },
  skeletonAvatar: {
    width: 84,
    height: 84,
    flexShrink: 0,
    borderRadius: 42,
    backgroundColor: colors.profile.skeletonHighlight,
  },
  skeletonHeroCopy: { flex: 1, minWidth: 0, gap: spacing.md },
  skeletonHeroName: {
    width: '78%',
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeletonHighlight,
  },
  skeletonHeroBadge: {
    width: 64,
    height: 24,
    borderRadius: radii.md,
    backgroundColor: colors.profile.skeletonHighlight,
  },
  skeletonHeroMeta: {
    width: '88%',
    height: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeletonHighlight,
  },
  skeletonHeroMetaShort: {
    width: '54%',
    height: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeletonHighlight,
  },
  skeletonDetailsCard: { backgroundColor: colors.profile.surface },
  skeletonRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.profile.divider,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonRowText: { flex: 1, minWidth: 0 },
  skeletonLineLarge: {
    width: '68%',
    height: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonLineShort: {
    width: '34%',
    height: 11,
    marginBottom: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonAction: {
    height: 70,
    marginTop: spacing.md,
    borderRadius: radii.compactCard,
    backgroundColor: colors.profile.skeleton,
  },
  skeletonLogout: {
    height: sizes.buttonHeight,
    marginTop: spacing.xxl,
    borderRadius: radii.xl,
    backgroundColor: colors.profile.skeleton,
  },
});
