import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROUTES } from '../../app/navigation/routeNames';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, spacing } from '../../theme';
import {
  ActivityCard,
  AttendanceOverviewCard,
  BirthdaysModal,
  HolidaysCard,
  MetricsGrid,
  OverviewChip,
  QuickActions,
  SectionState,
  UpcomingBirthdaysCard,
} from './DashboardComponents';
import {
  getUpcomingBirthdays,
  getUserAttendanceOverview,
  getUserDashboard,
} from './dashboardApi';
import {
  normalizeActivity,
  normalizeAttendance,
  normalizeBirthdays,
  normalizeDashboardData,
  normalizeHoliday,
  unwrapPayload,
} from './dashboardMappers';

const EMPTY_DASHBOARD = {
  myTickets: 0,
  completedTickets: 0,
  pendingTickets: 0,
  attendance: 0,
  recentActivities: [],
  upcomingHolidays: [],
};

const EMPTY_ATTENDANCE = {
  attendancePercentage: 0,
  presentDays: 0,
  absentDays: 0,
  halfDays: 0,
  leaveDays: 0,
  todayWorkingHours: '',
  weeklyHours: [],
};

const SECTIONS = [
  'heading',
  'summary',
  'summaryError',
  'attendance',
  'birthdays',
  'activities',
  'holidays',
  'actions',
];

export default function DashboardScreen({ navigation }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const controllerRef = useRef(null);

  const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD);
  const [attendanceData, setAttendanceData] = useState(EMPTY_ATTENDANCE);
  const [attendanceHasData, setAttendanceHasData] = useState(false);
  const [birthdays, setBirthdays] = useState([]);
  const [showBirthdaysModal, setShowBirthdaysModal] = useState(false);
  const [loading, setLoading] = useState({
    screen: true,
    dashboard: true,
    attendance: true,
    birthdays: true,
    refreshing: false,
  });
  const [errors, setErrors] = useState({
    dashboard: '',
    attendance: '',
    birthdays: '',
  });

  const contentWidth = Math.min(width - spacing.screen * 2, 560);
  const chartWidth = Math.max(260, contentWidth - spacing.xxxl * 2);

  const setLoadingPatch = useCallback((patch) => {
    setLoading((current) => ({ ...current, ...patch }));
  }, []);

  const setErrorPatch = useCallback((patch) => {
    setErrors((current) => ({ ...current, ...patch }));
  }, []);

  const loadDashboard = useCallback(
    async ({ scope = 'all', refresh = false } = {}) => {
      if (!token) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const shouldLoadDashboard = scope === 'all' || scope === 'dashboard';
      const shouldLoadAttendance = scope === 'all' || scope === 'attendance';
      const shouldLoadBirthdays = scope === 'all' || scope === 'birthdays';

      setLoadingPatch({
        screen: !refresh && scope === 'all',
        refreshing: refresh,
        dashboard: shouldLoadDashboard,
        attendance: shouldLoadAttendance,
        birthdays: shouldLoadBirthdays,
      });
      setErrorPatch({
        ...(shouldLoadDashboard ? { dashboard: '' } : {}),
        ...(shouldLoadAttendance ? { attendance: '' } : {}),
        ...(shouldLoadBirthdays ? { birthdays: '' } : {}),
      });

      const requests = [
        shouldLoadDashboard ? getUserDashboard(token, { signal: controller.signal }) : Promise.resolve(null),
        shouldLoadAttendance ? getUserAttendanceOverview(token, { signal: controller.signal }) : Promise.resolve(null),
        shouldLoadBirthdays ? getUpcomingBirthdays(token, { signal: controller.signal }) : Promise.resolve(null),
      ];

      const [dashboardResult, attendanceResult, birthdaysResult] = await Promise.allSettled(requests);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      if (shouldLoadDashboard) {
        if (dashboardResult.status === 'fulfilled') {
          setDashboardData(normalizeDashboardData(dashboardResult.value));
        } else {
          setDashboardData((current) => current || EMPTY_DASHBOARD);
          setErrorPatch({ dashboard: dashboardResult.reason?.message || 'Unable to load dashboard summary.' });
        }
      }

      if (shouldLoadAttendance) {
        if (attendanceResult.status === 'fulfilled') {
          const source = unwrapPayload(attendanceResult.value || {});
          setAttendanceData(normalizeAttendance(source));
          setAttendanceHasData(Object.keys(source || {}).length > 0);
        } else {
          setAttendanceData((current) => current || EMPTY_ATTENDANCE);
          setAttendanceHasData(false);
          setErrorPatch({ attendance: attendanceResult.reason?.message || 'Unable to load attendance summary.' });
        }
      }

      if (shouldLoadBirthdays) {
        if (birthdaysResult.status === 'fulfilled') {
          setBirthdays(normalizeBirthdays(birthdaysResult.value));
        } else {
          setBirthdays([]);
          setErrorPatch({ birthdays: birthdaysResult.reason?.message || 'Unable to load upcoming birthdays.' });
        }
      }

      setLoadingPatch({
        screen: false,
        refreshing: false,
        dashboard: false,
        attendance: false,
        birthdays: false,
      });
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    },
    [setErrorPatch, setLoadingPatch, token]
  );

  useEffect(() => {
    mountedRef.current = true;
    loadDashboard();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [loadDashboard]);

  const recentActivities = useMemo(
    () =>
      (Array.isArray(dashboardData.recentActivities) ? dashboardData.recentActivities : [])
        .map(normalizeActivity)
        .sort((left, right) => String(right.time).localeCompare(String(left.time)))
        .slice(0, 6),
    [dashboardData.recentActivities]
  );

  const upcomingHolidays = useMemo(
    () =>
      (Array.isArray(dashboardData.upcomingHolidays) ? dashboardData.upcomingHolidays : [])
        .map(normalizeHoliday)
        .slice(0, 6),
    [dashboardData.upcomingHolidays]
  );

  const quickActions = useMemo(
    () => [
      {
        label: 'Apply Leave',
        icon: 'airplane',
        onPress: () => navigation.navigate(ROUTES.EMPLOYEE_LEAVES),
      },
      {
        label: 'Mark Attendance',
        icon: 'calendar',
        onPress: () => navigation.navigate(ROUTES.MY_ATTENDANCE),
      },
    ],
    [navigation]
  );

  const renderSection = useCallback(
    ({ item }) => {
      if (item === 'heading') {
        return (
          <View style={styles.heading} accessible accessibilityRole="header">
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
            >
              Employee Dashboard
            </Text>
            <View style={styles.overviewRow}>
              <OverviewChip />
            </View>
            <Text style={styles.subtitle}>
              Track attendance, celebrate milestones, and stay updated with today's work.
            </Text>
          </View>
        );
      }

      if (item === 'summary') {
        return (
          <MetricsGrid
            data={dashboardData}
            loading={loading.dashboard && !loading.refreshing}
            onTicketsPress={() => navigation.navigate(ROUTES.MY_TICKETS)}
          />
        );
      }

      if (item === 'summaryError') {
        if (!errors.dashboard) return null;
        return (
          <SectionState
            tone="error"
            icon="refresh"
            title="Unable to load dashboard summary"
            message={errors.dashboard}
            actionLabel="Retry"
            onAction={() => loadDashboard({ scope: 'dashboard' })}
          />
        );
      }

      if (item === 'attendance') {
        return (
          <AttendanceOverviewCard
            data={attendanceData}
            hasData={attendanceHasData}
            error={errors.attendance}
            loading={loading.attendance && !loading.refreshing}
            onRetry={() => loadDashboard({ scope: 'attendance' })}
            chartWidth={chartWidth}
          />
        );
      }

      if (item === 'birthdays') {
        return (
          <UpcomingBirthdaysCard
            birthdays={birthdays}
            loading={loading.birthdays && !loading.refreshing}
            error={errors.birthdays}
            onRetry={() => loadDashboard({ scope: 'birthdays' })}
            onViewAll={() => setShowBirthdaysModal(true)}
          />
        );
      }

      if (item === 'activities') {
        return (
          <ActivityCard
            activities={recentActivities}
            error={errors.dashboard && recentActivities.length === 0 ? errors.dashboard : ''}
            onRetry={() => loadDashboard({ scope: 'dashboard' })}
          />
        );
      }

      if (item === 'holidays') {
        return (
          <HolidaysCard
            holidays={upcomingHolidays}
            onViewAll={() => navigation.navigate(ROUTES.MY_HOLIDAYS)}
          />
        );
      }

      if (item === 'actions') {
        return <QuickActions actions={quickActions} />;
      }

      return null;
    },
    [
      attendanceData,
      attendanceHasData,
      birthdays,
      chartWidth,
      dashboardData,
      errors,
      loadDashboard,
      loading,
      navigation,
      quickActions,
      recentActivities,
      upcomingHolidays,
    ]
  );

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        data={SECTIONS}
        renderItem={renderSection}
        keyExtractor={(item) => item}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading.refreshing}
            onRefresh={() => loadDashboard({ scope: 'all', refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
            paddingBottom: Math.max(insets.bottom, spacing.tabBottomOffset) + 112,
          },
        ]}
      />
      <BirthdaysModal
        visible={showBirthdaysModal}
        birthdays={birthdays}
        onClose={() => setShowBirthdaysModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dashboard.background,
    alignItems: 'center',
  },
  list: {
    width: '100%',
  },
  content: {
    gap: spacing.dashboardSectionGap,
    paddingTop: spacing.xxl,
    paddingHorizontal: 0,
    alignSelf: 'center',
  },
  heading: {
    gap: spacing.sm,
  },
  overviewRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-front',
  },
  title: {
    width: '100%',
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    lineHeight: 29,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    fontWeight: fontWeights.medium,
  },
});
