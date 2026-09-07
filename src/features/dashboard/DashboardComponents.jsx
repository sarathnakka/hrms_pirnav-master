import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import { formatWorkingHours, normalizeNumber } from './dashboardMappers';

const CARD_ICON_SIZE = sizes.dashboardMetricIcon;
const RING_SIZE = 164;
const RING_STROKE = 14;
const CHART_HEIGHT = 158;
const CHART_PADDING = { top: 14, right: 12, bottom: 27, left: 27 };
const DONUT_SEGMENT_GAP = 3;

export function SectionCard({ children, style }) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
}

export function DashboardLoading() {
  return (
    <View style={styles.loadingWrap} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>Loading employee dashboard...</Text>
    </View>
  );
}

export function SectionState({ icon = 'alert-circle-outline', title, message, actionLabel, onAction, tone = 'default' }) {
  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, tone === 'error' && styles.stateIconError]}>
        <Ionicons name={icon} size={22} color={tone === 'error' ? colors.error : colors.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {!!message && <Text style={styles.stateMessage}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable
          style={styles.retryButton}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function OverviewChip() {
  return (
    <View style={styles.overviewChip} accessibilityLabel="HRMS Overview">
      <Ionicons name="people" size={13} color={colors.primary} />
      <Text style={styles.overviewChipText}>HRMS Overview</Text>
    </View>
  );
}

export function MetricCard({ title, value, helper, icon, tone = 'primary', loading = false }) {
  const toneStyle = getToneStyle(tone);
  return (
    <View style={styles.metricCard} accessible accessibilityLabel={`${title}: ${value}. ${helper}`}>
      <View style={styles.metricCopy}>
        <View style={[styles.metricIcon, { backgroundColor: toneStyle.soft }]}>
          <Ionicons name={icon} size={16} color={toneStyle.background} />
        </View>
        <Text style={styles.metricTitle} numberOfLines={1}>{title}</Text>
        {loading ? (
          <View style={styles.metricSkeleton} />
        ) : (
          <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
        )}
        <Text style={styles.metricHelper} numberOfLines={1}>{helper}</Text>
      </View>
    </View>
  );
}

export function MetricsGrid({ data, loading }) {
  const cards = [
    {
      key: 'tickets',
      title: 'My Tickets',
      value: normalizeNumber(data?.myTickets, 0),
      helper: `${normalizeNumber(data?.pendingTickets, 0)} pending`,
      icon: 'ticket',
      tone: 'info',
    },
    {
      key: 'completed',
      title: 'Completed Tickets',
      value: normalizeNumber(data?.completedTickets, 0),
      helper: 'Completed',
      icon: 'checkmark-circle',
      tone: 'success',
    },
    {
      key: 'pending',
      title: 'Pending Tickets',
      value: normalizeNumber(data?.pendingTickets, 0),
      helper: 'Need attention',
      icon: 'time',
      tone: 'warning',
    },
    {
      key: 'attendance',
      title: 'Attendance',
      value: `${normalizeNumber(data?.attendance, 0)}%`,
      helper: 'This month',
      icon: 'calendar',
      tone: 'primary',
    },
  ];

  return (
    <View style={styles.metricsGrid}>
      {cards.map(({ key, ...metricProps }) => (
        <View key={key} style={styles.metricCell}>
          <MetricCard {...metricProps} loading={loading} />
        </View>
      ))}
    </View>
  );
}

export function AttendanceRing({ percentage, presentDays = 0, absentDays = 0, halfDays = 0, leaveDays = 0 }) {
  const safePercentage = Math.min(100, Math.max(0, normalizeNumber(percentage, 0)));
  const counts = [
    { key: 'present', value: Math.max(0, normalizeNumber(presentDays, 0)), color: colors.dashboard.present },
    { key: 'absent', value: Math.max(0, normalizeNumber(absentDays, 0)), color: colors.dashboard.absent },
    { key: 'halfDays', value: Math.max(0, normalizeNumber(halfDays, 0)), color: colors.dashboard.halfDay },
    { key: 'leave', value: Math.max(0, normalizeNumber(leaveDays, 0)), color: colors.dashboard.leave },
  ];
  const totalDays = counts.reduce((sum, item) => sum + item.value, 0);
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  let segmentCursor = 0;

  return (
    <View style={styles.ringWrap} accessible accessibilityLabel={`Attendance percentage ${Math.round(safePercentage)} percent`}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={colors.dashboard.ringTrack}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {totalDays > 0 &&
          counts.map((segment) => {
            if (segment.value <= 0) return null;
            const segmentLength = (segment.value / totalDays) * circumference;
            const visibleLength = Math.max(0, segmentLength - DONUT_SEGMENT_GAP);
            const dashOffset = -segmentCursor;
            segmentCursor += segmentLength;
            if (visibleLength <= 0) return null;

            return (
              <Circle
                key={segment.key}
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                stroke={segment.color}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                strokeDashoffset={dashOffset}
                fill="none"
                rotation="-90"
                origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
              />
            );
          })}
      </Svg>
      <View style={styles.ringCopy}>
        <Text style={styles.ringValue}>{Math.round(safePercentage)}%</Text>
        <Text style={styles.ringLabel}>Attendance</Text>
      </View>
    </View>
  );
}

export function AttendanceOverviewCard({ data, hasData, error, loading, onRetry, chartWidth }) {
  if (loading) {
    return (
      <SectionCard>
        <CardHeader
          title="Attendance Overview"
          description="Monitor attendance, absence trends, and today's working hours."
          chipLabel="Live Attendance"
          chipIcon="calendar"
        />
        <DashboardLoading />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard>
        <CardHeader
          title="Attendance Overview"
          description="Monitor attendance, absence trends, and today's working hours."
          chipLabel="Live Attendance"
          chipIcon="calendar"
        />
        <SectionState
          tone="error"
          icon="refresh"
          title="Unable to load attendance summary"
          message={error}
          actionLabel="Retry"
          onAction={onRetry}
        />
      </SectionCard>
    );
  }

  if (!hasData) {
    return (
      <SectionCard>
        <CardHeader
          title="Attendance Overview"
          description="Monitor attendance, absence trends, and today's working hours."
          chipLabel="Live Attendance"
          chipIcon="calendar"
        />
        <SectionState
          icon="calendar-outline"
          title="No attendance summary yet"
          message="Attendance insights will appear once your dashboard data is available."
          actionLabel="Refresh"
          onAction={onRetry}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <CardHeader
        title="Attendance Overview"
        description="Monitor attendance, absence trends, and today's working hours."
        chipLabel="Live Attendance"
        chipIcon="calendar"
      />
      <View style={styles.attendanceSpotlight}>
        <View style={styles.progressCard}>
          <AttendanceRing
            percentage={data.attendancePercentage}
            presentDays={data.presentDays}
            absentDays={data.absentDays}
            halfDays={data.halfDays}
            leaveDays={data.leaveDays}
          />
          <AttendanceLegend />
        </View>
        <View style={styles.miniGrid}>
          <AttendanceMiniMetric title="Present" value={data.presentDays} helper="Working days" icon="checkmark-circle" tone="success" />
          <AttendanceMiniMetric title="Absent" value={data.absentDays} helper="Missed days" icon="close-circle" tone="error" />
          <AttendanceMiniMetric title="Half Days" value={data.halfDays} helper="Partial days" icon="contrast" tone="warning" />
          <AttendanceMiniMetric title="Leave" value={data.leaveDays} helper="Approved leave" icon="calendar-clear" tone="primary" />
        </View>
        <View style={styles.workingHoursRow} accessible accessibilityLabel={`Today's working hours ${formatWorkingHours(data.todayWorkingHours)}`}>
          <View style={styles.workingHoursLabelWrap}>
            <View style={styles.inlineIcon}>
              <Ionicons name="time" size={14} color={colors.primary} />
            </View>
            <View style={styles.workingHoursTextWrap}>
              <Text style={styles.workingHoursLabel}>Today's working hours</Text>
              <Text style={styles.workingHoursMetaText}>Auto-calculated from attendance logs</Text>
            </View>
          </View>
          <Text style={styles.workingHoursValue}>{formatWorkingHours(data.todayWorkingHours)}</Text>
        </View>
        <WeeklyAttendanceGraph data={data.weeklyHours} width={chartWidth} />
      </View>
    </SectionCard>
  );
}

function AttendanceLegend() {
  const items = [
    { label: 'Present', color: colors.dashboard.present },
    { label: 'Absent', color: colors.dashboard.absent },
    { label: 'Half Day', color: colors.dashboard.halfDay },
    { label: 'Leave', color: colors.dashboard.leave },
  ];

  return (
    <View style={styles.legendWrap}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AttendanceMiniMetric({ title, value, helper, icon, tone }) {
  const toneStyle = getToneStyle(tone);
  return (
    <View style={[styles.miniMetric, { backgroundColor: toneStyle.soft }]} accessible accessibilityLabel={`${title}: ${normalizeNumber(value, 0)}. ${helper}`}>
      <View style={[styles.statusDot, { backgroundColor: toneStyle.background }]}>
        <Ionicons name={icon} size={12} color={colors.white} />
      </View>
      <View style={styles.miniMetricCopy}>
        <Text style={styles.miniLabel}>{title}</Text>
        <Text style={styles.miniValue}>{normalizeNumber(value, 0)}</Text>
        <Text style={styles.miniHelper}>{helper}</Text>
      </View>
    </View>
  );
}

export function WeeklyAttendanceGraph({ data = [], width }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.hours))) : [];
  const chartWidth = Math.max(260, width || 320);
  const innerWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxHours = Math.max(12, ...chartData.map((item) => Number(item.hours) || 0));
  const hasData = chartData.length > 0;

  if (!hasData) {
    return (
      <View style={styles.chartShell}>
        <ChartHeader />
        <View style={styles.chartEmpty}>
          <Ionicons name="analytics-outline" size={26} color={colors.primary} />
          <Text style={styles.stateMessage}>No weekly graph data available yet.</Text>
        </View>
      </View>
    );
  }

  const xForIndex = (index) =>
    CHART_PADDING.left + (chartData.length === 1 ? innerWidth / 2 : (index / (chartData.length - 1)) * innerWidth);
  const yForHours = (hours) => CHART_PADDING.top + innerHeight - (Math.min(maxHours, Math.max(0, hours)) / maxHours) * innerHeight;
  const points = chartData.map((item, index) => ({ x: xForIndex(index), y: yForHours(Number(item.hours) || 0), ...item }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT - CHART_PADDING.bottom} L ${points[0].x} ${CHART_HEIGHT - CHART_PADDING.bottom} Z`;
  const ticks = [0, Math.round(maxHours / 4), Math.round(maxHours / 2), Math.round((maxHours * 3) / 4), Math.round(maxHours)];
  const chartSummary = chartData.map((item) => `${item.day} ${formatWorkingHours(item.hours)}`).join(', ');

  return (
    <View style={styles.chartShell} accessible accessibilityLabel={`Weekly working hours: ${chartSummary}`}>
      <ChartHeader />
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="dashboardAttendanceGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0.03" />
          </LinearGradient>
        </Defs>
        {ticks.map((tick) => {
          const y = yForHours(tick);
          return (
            <React.Fragment key={tick}>
              <Line
                x1={CHART_PADDING.left}
                y1={y}
                x2={chartWidth - CHART_PADDING.right}
                y2={y}
                stroke={colors.dashboard.chartGrid}
                strokeWidth="1"
                strokeDasharray="4 8"
              />
            </React.Fragment>
          );
        })}
        <Path d={areaPath} fill="url(#dashboardAttendanceGradient)" />
        <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <Circle key={`${point.day}-${point.x}`} cx={point.x} cy={point.y} r="4" fill={colors.dashboard.cardSurface} stroke={colors.primary} strokeWidth="2" />
        ))}
      </Svg>
      <View style={styles.chartYAxis}>
        {ticks.slice().reverse().map((tick) => (
          <Text key={tick} style={styles.axisLabel}>{tick}</Text>
        ))}
      </View>
      <View style={styles.chartLabels}>
        {chartData.map((item) => (
          <Text key={item.day} style={styles.axisLabel}>{item.day}</Text>
        ))}
      </View>
    </View>
  );
}

function ChartHeader() {
  return (
    <View style={styles.chartHeader}>
      <Text style={styles.chartTitle}>Weekly Working Hours</Text>
      <Text style={styles.chartDescription}>Working-hour trend for the current week</Text>
    </View>
  );
}

function formatBirthday(value) {
  const normalized = String(value || '').trim();
  return normalized || '--';
}

export function UpcomingBirthdaysCard({
  birthdays = [],
  loading = false,
  error = '',
  onRetry,
  onViewAll,
}) {
  const safeBirthdays = Array.isArray(birthdays) ? birthdays : [];
  const visibleBirthdays = safeBirthdays.slice(0, 6);
  return (
    <SectionCard>
      <CardHeader
        title="Upcoming Birthdays"
        description="Keep celebrations visible with the next birthdays coming up."
        actionLabel="View All Birthdays"
        actionIcon="chevron-forward"
        onAction={onViewAll}
        actionDisabled={loading || safeBirthdays.length === 0}
      />
      {loading ? (
        <DashboardLoading />
      ) : error ? (
        <SectionState tone="error" icon="refresh" title="Unable to load upcoming birthdays" message={error} actionLabel="Retry" onAction={onRetry} />
      ) : visibleBirthdays.length === 0 ? (
        <SectionState icon="gift-outline" title="No upcoming birthdays" message="Birthday information will appear here when the API returns employees." />
      ) : (
        <View style={styles.birthdayList}>
          {visibleBirthdays.map((birthday) => (
            <BirthdayItem key={`${birthday.employeeId}-${birthday.employeeName}`} birthday={birthday} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function BirthdayItem({ birthday }) {
  const badgeText = birthday.daysRemaining === 0 ? 'Today' : `${birthday.daysRemaining} ${birthday.daysRemaining === 1 ? 'day' : 'days'} left`;
  const birthdayText = formatBirthday(birthday.birthday);
  return (
    <View
      style={styles.birthdayItem}
      accessible
      accessibilityLabel={`${birthday.employeeName}, ${birthday.employeeId || 'Employee'}, birthday ${birthdayText}, ${badgeText}`}
    >
      <View style={styles.avatar}>
        {birthday.imageUrl ? (
          <Image source={{ uri: birthday.imageUrl }} style={styles.avatarImage} resizeMode="cover" accessibilityLabel={`${birthday.employeeName} photo`} />
        ) : (
          <Text style={styles.avatarText}>{birthday.initials}</Text>
        )}
      </View>
      <View style={styles.birthdayCopy}>
        <Text style={styles.birthdayName} numberOfLines={1}>{birthday.employeeName}</Text>
        <Text style={styles.birthdayMeta} numberOfLines={1}>{birthday.employeeId || 'Employee'}</Text>
        <Text style={styles.birthdayDate}>{birthdayText}</Text>
      </View>
      <View style={[styles.birthdayBadge, birthday.daysRemaining === 0 && styles.birthdayBadgeToday]}>
        <Text style={styles.birthdayBadgeText}>{badgeText}</Text>
      </View>
    </View>
  );
}

export function BirthdaysModal({ visible, birthdays = [], onClose }) {
  const safeBirthdays = Array.isArray(birthdays) ? birthdays : [];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Upcoming Birthdays</Text>
              <Text style={styles.sectionDescription}>{safeBirthdays.length} loaded from the API</Text>
            </View>
            <Pressable style={styles.modalClose} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close birthdays">
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
          <FlatList
            data={safeBirthdays}
            keyExtractor={(item) => `${item.employeeId}-${item.employeeName}-modal`}
            renderItem={({ item }) => <BirthdayItem birthday={item} />}
            ListEmptyComponent={<SectionState icon="gift-outline" title="No birthdays to display" message="The birthdays API did not return employees." />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalList}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function ActivityCard({ activities, error, onRetry }) {
  return (
    <SectionCard style={styles.infoPanel}>
      <View style={styles.infoHeader}>
        <Text style={styles.sectionTitle}>My Recent Activities</Text>
      </View>
      {error ? (
        <SectionState tone="error" icon="refresh" title="Activity feed unavailable" message={error} actionLabel="Retry" onAction={onRetry} />
      ) : activities.length === 0 ? (
        <SectionState icon="ticket-outline" title="No recent activities" message="Your recent actions will appear here once they are logged." />
      ) : (
        <View style={styles.rowsWrap}>
          {activities.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <View style={styles.activityMarker} />
              <View style={styles.rowCopy}>
                <Text style={styles.activityMessage} numberOfLines={2}>{activity.message}</Text>
                {!!activity.time && <Text style={styles.rowDate}>{activity.time}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export function HolidaysCard({ holidays, onViewAll }) {
  return (
    <SectionCard style={styles.infoPanel}>
      <CardHeader
        title="Upcoming Holidays"
        actionLabel="View All"
        actionIcon="chevron-forward"
        onAction={onViewAll}
      />
      {holidays.length === 0 ? (
        <SectionState icon="calendar-outline" title="No upcoming holidays" message="Holiday information will show here when the dashboard API returns it." />
      ) : (
        <View style={styles.rowsWrap}>
          {holidays.map((holiday) => (
            <View key={`${holiday.id}-${holiday.date}`} style={styles.holidayRow}>
              <View style={styles.dateBadge}>
                <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              </View>
              <Text style={styles.holidayName} numberOfLines={1}>{holiday.name}</Text>
              <Text style={styles.rowDate}>{holiday.date}</Text>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export function QuickActions({ actions }) {
  const { width } = useWindowDimensions();
  const stackActions = width < 350;

  if (!actions.length) return null;
  return (
    <View style={[styles.actionsWrap, stackActions && styles.actionsWrapStack]}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          style={styles.actionButton}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <View style={styles.actionIconWrap}>
            <Ionicons name={action.icon} size={16} color={colors.primary} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionText} numberOfLines={1}>{action.label}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textSecondary} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function CardHeader({ title, description, chipLabel, chipIcon, actionLabel, actionIcon, onAction, actionDisabled }) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderTopRow}>
        <Text style={[styles.sectionTitle, styles.cardHeaderTitle]} numberOfLines={2}>{title}</Text>
        {!!chipLabel && (
          <View style={styles.cardChip}>
            <Ionicons name={chipIcon} size={14} color={colors.primary} />
            <Text style={styles.cardChipText}>{chipLabel}</Text>
          </View>
        )}
        {!!actionLabel && (
          <Pressable
            style={[styles.viewAllButton, actionDisabled && styles.disabledAction]}
            onPress={onAction}
            disabled={actionDisabled}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: actionDisabled }}
          >
            <Text style={styles.viewAllText}>{actionLabel}</Text>
            {!!actionIcon && <Ionicons name={actionIcon} size={15} color={colors.textPrimary} />}
          </Pressable>
        )}
      </View>
      {!!description && <Text style={styles.sectionDescription}>{description}</Text>}
    </View>
  );
}

function getToneStyle(tone) {
  if (tone === 'success') return { background: colors.success, soft: colors.successBackground };
  if (tone === 'warning') return { background: colors.warning, soft: colors.warningBackground };
  if (tone === 'error') return { background: colors.error, soft: colors.dangerBackground };
  if (tone === 'info') return { background: colors.info, soft: colors.infoBackground };
  return { background: colors.primary, soft: colors.tealTintSoft };
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: colors.dashboard.cardSurface,
    borderRadius: radii.dashboardCard,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    padding: spacing.xxl,
    ...shadows.dashboard,
  },
  loadingWrap: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  overviewChip: {
    minHeight: 28,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    backgroundColor: colors.tealTintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexShrink: 0,
  },
  overviewChipText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.dashboardGap,
  },
  metricCell: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 136,
  },
  metricCard: {
    minHeight: 106,
    backgroundColor: colors.dashboard.metricSurface,
    borderRadius: radii.dashboardMetric,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    padding: spacing.xxl,
    overflow: 'hidden',
    ...shadows.subtle,
  },
  metricCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  metricTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardMetricValue,
    lineHeight: 28,
    fontWeight: fontWeights.extraBold,
  },
  metricHelper: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  metricSkeleton: {
    width: 54,
    height: 24,
    borderRadius: radii.md,
    backgroundColor: colors.dashboard.skeleton,
  },
  metricIcon: {
    width: CARD_ICON_SIZE,
    height: CARD_ICON_SIZE,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardHeader: {
    marginBottom: spacing.xxl,
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardSectionTitle,
    fontWeight: fontWeights.extraBold,
  },
  cardHeaderTitle: {
    flex: 1,
    minWidth: 0,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    fontWeight: fontWeights.medium,
    marginTop: spacing.sm,
  },
  cardChip: {
    minHeight: 30,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.tealTint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardChipText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  viewAllButton: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    flexShrink: 0,
  },
  viewAllText: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  disabledAction: {
    opacity: 0.55,
  },
  attendanceSpotlight: {
    borderRadius: radii.dashboardMetric,
    backgroundColor: colors.dashboard.progressSurface,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    overflow: 'hidden',
  },
  progressCard: {
    minHeight: 228,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCopy: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringValue: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: fontWeights.extraBold,
  },
  ringLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.dashboardGap,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  miniMetric: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 132,
    minHeight: 78,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  miniMetricCopy: {
    flex: 1,
    minWidth: 0,
  },
  miniLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
    flexWrap: 'wrap',
  },
  miniValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    lineHeight: 22,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.xs,
  },
  miniHelper: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 15,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  workingHoursRow: {
    borderTopWidth: 1,
    borderTopColor: colors.dashboard.cardBorder,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  workingHoursLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inlineIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workingHoursTextWrap: {
    flex: 1,
  },
  workingHoursLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  workingHoursValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    lineHeight: 22,
    fontWeight: fontWeights.extraBold,
  },
  workingHoursMetaText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
  },
  chartShell: {
    borderTopWidth: 1,
    borderTopColor: colors.dashboard.cardBorder,
    backgroundColor: colors.dashboard.sectionSurface,
    paddingTop: spacing.lg,
    overflow: 'hidden',
  },
  chartHeader: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  chartDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
  },
  chartEmpty: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.dashboard.emptySurface,
  },
  chartYAxis: {
    position: 'absolute',
    left: spacing.md,
    top: 62,
    height: CHART_HEIGHT - CHART_PADDING.bottom,
    justifyContent: 'space-between',
  },
  chartLabels: {
    position: 'absolute',
    left: CHART_PADDING.left,
    right: CHART_PADDING.right,
    bottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  birthdayList: {
    marginTop: spacing.md,
  },
  birthdayItem: {
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.dashboard.birthdayDivider,
  },
  avatar: {
    width: sizes.dashboardAvatar,
    height: sizes.dashboardAvatar,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: colors.white,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  birthdayCopy: {
    flex: 1,
    minWidth: 0,
  },
  birthdayName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  birthdayMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    marginTop: spacing.xs,
  },
  birthdayDate: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.xs,
  },
  birthdayBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.dashboard.birthdayBadge,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexShrink: 0,
  },
  birthdayBadgeToday: {
    backgroundColor: colors.infoBackground,
  },
  birthdayBadgeText: {
    color: colors.success,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  rowsWrap: {
    marginTop: spacing.md,
  },
  infoPanel: {
    paddingVertical: spacing.xxl,
  },
  infoHeader: {
    marginBottom: spacing.sm,
  },
  activityRow: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    flexDirection: 'row',
    gap: spacing.lg,
  },
  activityMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.dashboard.activityMarker,
    marginTop: 6,
  },
  rowCopy: {
    flex: 1,
  },
  activityMessage: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  rowDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  holidayRow: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  dateBadge: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: colors.dashboard.holidayDateBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holidayName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.medium,
  },
  actionsWrap: {
    flexDirection: 'row',
    gap: spacing.dashboardGap,
  },
  actionsWrapStack: {
    flexDirection: 'column',
  },
  actionButton: {
    minHeight: sizes.minTouchTarget,
    flex: 1,
    borderRadius: radii.dashboardMetric,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    backgroundColor: colors.dashboard.cardSurface,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    minWidth: 0,
    ...shadows.subtle,
  },
  actionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: colors.tealTintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: colors.primaryDark,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stateBox: {
    minHeight: 112,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.dashboard.emptySurface,
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  stateIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateIconError: {
    backgroundColor: colors.dangerBackground,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dashboard.cardBorder,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxxl,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.screen,
  },
  modalCard: {
    maxHeight: '88%',
    borderRadius: radii.card,
    backgroundColor: colors.dashboard.cardSurface,
    padding: spacing.xxxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
    marginBottom: spacing.xxxl,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  modalClose: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.lg,
    backgroundColor: colors.mutedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: {
    gap: spacing.sectionGap,
    paddingBottom: spacing.xxxl,
  },
});
