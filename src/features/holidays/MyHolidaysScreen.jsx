import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { getHolidays } from './holidaysApi';

const DEFAULT_BACKEND_DATE = '0001-01-01T00:00:00';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function extractHolidayCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    throw new Error('Unable to load company holidays.');
  }
  if (!payload || typeof payload !== 'object') return [];

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.holidays)) return payload.holidays;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.data?.holidays)) return payload.data.holidays;

  const firstArray = Object.values(payload).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray : [];
}

function parseHolidayDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === DEFAULT_BACKEND_DATE || text.startsWith('0001-01-01')) return null;

  const dateOnly = text.split('T')[0];
  const isoMatch = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return { date: parsed, dateOnly, year, month, day };
    }
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    date: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
    dateOnly: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function formatDate(parsedDate) {
  return `${String(parsedDate.day).padStart(2, '0')}/${String(parsedDate.month).padStart(2, '0')}/${parsedDate.year}`;
}

function holidayStatus(parsedDate) {
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const holidayOnly = parsedDate.date;

  if (holidayOnly.getTime() === todayOnly.getTime()) return 'today';
  if (holidayOnly.getTime() < todayOnly.getTime()) return 'past';
  return 'upcoming';
}

function displayText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function resolveHolidayId(item, index) {
  const value = item?.id ?? item?.holidayId ?? item?.holiday_Id ?? item?.holidayID;
  if (value === null || value === undefined || String(value).trim() === '') return `holiday-${index}`;
  return String(value);
}

function normalizeHoliday(item, index) {
  const name = displayText(item?.holiday_Name ?? item?.holidayName ?? item?.name ?? item?.title);
  const parsedDate = parseHolidayDate(item?.holiday_Date ?? item?.holidayDate ?? item?.date ?? item?.holidayOn);
  if (!name || !parsedDate) return null;

  const day =
    displayText(item?.day ?? item?.holidayDay ?? item?.dayName ?? item?.weekDay ?? item?.weekday) ||
    DAYS[parsedDate.date.getDay()];

  return {
    id: resolveHolidayId(item, index),
    name,
    parsedDate,
    formattedDate: formatDate(parsedDate),
    day,
    type: displayText(item?.type ?? item?.holidayType ?? item?.category),
    status: holidayStatus(parsedDate),
  };
}

function normalizeHolidays(payload) {
  const currentYear = new Date().getFullYear();
  return extractHolidayCollection(payload)
    .map(normalizeHoliday)
    .filter(Boolean)
    .filter((holiday) => holiday.parsedDate.year === currentYear)
    .sort((a, b) => a.parsedDate.date.getTime() - b.parsedDate.date.getTime());
}

function holidayCountLabel(count) {
  return `${count} ${count === 1 ? 'Holiday' : 'Holidays'} This Year`;
}

function HolidayState({ title, message, loading = false, onRetry }) {
  return (
    <View style={styles.stateBox}>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="calendar-outline" size={24} color={colors.primary} />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {onRetry ? (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Retry loading company holidays"
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function HolidayRow({ holiday, index }) {
  const isPast = holiday.status === 'past';
  const isToday = holiday.status === 'today';
  const accessibilityDate = `${holiday.day}, ${holiday.formattedDate}`;

  return (
    <View
      style={[styles.holidayRow, isPast && styles.holidayRowPast]}
      accessibilityLabel={`${holiday.name}, ${accessibilityDate}${holiday.type ? `, ${holiday.type} holiday` : ''}.`}
    >
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{String(holiday.parsedDate.day).padStart(2, '0')}</Text>
        <Text style={styles.dateMonth}>{MONTHS[holiday.parsedDate.month - 1]}</Text>
      </View>

      <View style={styles.holidayContent}>
        <View style={styles.holidayTitleRow}>
          <Text style={[styles.holidayName, isPast && styles.pastText]}>{holiday.name}</Text>
          {isToday ? (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Today</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, isPast && styles.pastText]}>{holiday.day}</Text>
          {holiday.type ? (
            <>
              <View style={styles.metaDot} />
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{holiday.type}</Text>
              </View>
            </>
          ) : null}
          {isPast ? (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.pastBadgeText}>Past</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.rightDateWrap}>
        <Text style={[styles.serialText, isPast && styles.pastText]}>{String(index + 1).padStart(2, '0')}</Text>
        <Text style={[styles.fullDate, isPast && styles.pastText]}>{holiday.formattedDate}</Text>
      </View>
    </View>
  );
}

export default function MyHolidaysScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const abortRef = useRef(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const currentYear = new Date().getFullYear();

  const loadHolidays = useCallback(async ({ refresh = false } = {}) => {
    if (!token) {
      setHolidays([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await getHolidays(token, { signal: controller.signal });
      const normalized = normalizeHolidays(response);
      if (!controller.signal.aborted) {
        setHolidays(normalized);
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError?.message || 'Unable to load company holidays.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    setHolidays([]);
    loadHolidays();
    return () => abortRef.current?.abort();
  }, [loadHolidays]);

  const header = useMemo(() => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      <View style={styles.headingTopRow}>
        <View style={styles.headingText}>
          <Text style={styles.title} accessibilityRole="header">Company Holidays</Text>
          <Text style={styles.subtitle} accessibilityLabel={holidayCountLabel(holidays.length)}>
            {holidayCountLabel(holidays.length)}
          </Text>
        </View>
        <View style={styles.yearBadge}>
          <Ionicons name="calendar" size={15} color={colors.primary} />
          <Text style={styles.yearText}>{currentYear}</Text>
        </View>
      </View>
    </View>
  ), [contentWidth, currentYear, holidays.length]);

  const emptyState = () => {
    if (loading) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <HolidayState title="Loading holidays" message="Fetching this year's company holiday calendar." loading />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <HolidayState
            title="Unable to load company holidays."
            message="Please check your connection and try again."
            onRetry={() => loadHolidays()}
          />
        </View>
      );
    }

    return (
      <View style={[styles.stateWrap, { width: contentWidth }]}>
        <HolidayState
          title="No company holidays available."
          message="Published holidays will appear here."
        />
      </View>
    );
  };

  const renderHoliday = useCallback(({ item, index }) => (
    <View style={{ width: contentWidth }}>
      <HolidayRow holiday={item} index={index} />
    </View>
  ), [contentWidth]);

  return (
    <FlatList
      data={error ? [] : holidays}
      keyExtractor={(item) => item.id}
      renderItem={renderHoliday}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyState}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingBottom: insets.bottom + sizes.floatingTabHeight + spacing.screenVertical,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadHolidays({ refresh: true })}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    alignItems: 'center',
    padding: spacing.screen,
    backgroundColor: colors.holidays.background,
  },
  headerContent: {
    maxWidth: 680,
    marginBottom: spacing.lg,
  },
  headingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  headingText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 31,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.semibold,
  },
  yearBadge: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.holidays.yearBadgeBackground,
    borderWidth: 1,
    borderColor: colors.holidays.border,
  },
  yearText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  holidayRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.compactCard,
    backgroundColor: colors.holidays.surface,
    borderWidth: 1,
    borderColor: colors.holidays.border,
    ...shadows.subtle,
  },
  holidayRowPast: {
    backgroundColor: colors.holidays.pastSurface,
  },
  dateBlock: {
    width: 52,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.holidays.dateBlockBackground,
    borderWidth: 1,
    borderColor: colors.holidays.border,
  },
  dateDay: {
    color: colors.primary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  dateMonth: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.8,
  },
  holidayContent: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  holidayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  holidayName: {
    flex: 1,
    minWidth: 0,
    color: colors.holidays.title,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaText: {
    color: colors.holidays.metaText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.holidays.metaDot,
  },
  typeBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.holidays.typeBadgeBackground,
  },
  typeText: {
    color: colors.holidays.typeBadgeText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  todayBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.holidays.todayBadgeBackground,
  },
  todayBadgeText: {
    color: colors.holidays.todayBadgeText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  pastBadgeText: {
    color: colors.holidays.pastText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  rightDateWrap: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  serialText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  fullDate: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  pastText: {
    color: colors.holidays.pastText,
  },
  stateWrap: {
    maxWidth: 680,
    marginTop: spacing.md,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    borderRadius: radii.compactCard,
    backgroundColor: colors.holidays.emptySurface,
    borderWidth: 1,
    borderColor: colors.holidays.border,
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
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  separator: {
    height: spacing.md,
  },
});
