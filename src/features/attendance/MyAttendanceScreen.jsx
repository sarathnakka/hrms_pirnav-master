import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Modal,
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

import AppTextInput from '../../shared/components/AppTextInput';
import { getCurrentLocation } from '../../services/locationService';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  shadows,
  sizes,
  spacing,
} from '../../theme';
import {
  checkInAttendance,
  checkOutAttendance,
  getAttendanceHistory,
  getAttendanceSettings,
} from './attendanceApi';

const DEFAULT_CHECK_IN_START_TIME = '08:55:00';
const REASON_SUBMISSION_STATE = {
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  VERIFYING: 'verifying',
  UNCONFIRMED: 'unconfirmed',
  COMPLETED: 'completed',
};

function parseTimeToSeconds(value) {
  const normalized = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function getCurrentLocalSeconds(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function isBeforeConfiguredTime(date, configuredTime) {
  const configuredSeconds = parseTimeToSeconds(configuredTime);
  if (configuredSeconds === null) return false;

  return getCurrentLocalSeconds(date) < configuredSeconds;
}

function formatBackendTime12h(value) {
  const seconds = parseTimeToSeconds(value);
  if (seconds === null) return '';

  const hours24 = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatTime12h(timeStr) {
  if (!timeStr || timeStr === '--' || timeStr === '-') return '--';
  try {
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
      return timeStr;
    }
    const dateObj = new Date(timeStr);
    if (isNaN(dateObj.getTime())) {
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours || 12;
        const formattedHours = hours < 10 ? `0${hours}` : hours;
        return `${formattedHours}:${minutes} ${ampm}`;
      }
      return timeStr;
    }
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return timeStr;
  }
}

function getStatusBadgeStyle(status) {
  const s = (status || '').toLowerCase();
  if (s === 'lmc' || s.includes('late & missed checkout') || s.includes('late missed checkout')) {
    return { bg: colors.warningBackground, color: colors.warning };
  } else if (s === 'mc' || s.includes('missed checkout')) {
    return { bg: colors.warningBackground, color: colors.warning };
  }
  if (s.includes('present')) {
    return { bg: colors.successBackground, color: colors.success };
  } else if (s.includes('absent')) {
    return { bg: colors.dangerBorder, color: colors.error };
  } else if (s.includes('late')) {
    return { bg: colors.warningBackground, color: colors.warning };
  } else if (s.includes('half') || s.includes('leave') || s.includes('loss')) {
    return { bg: colors.indigoBackground, color: colors.indigo };
  } else if (s.includes('weekend') || s.includes('holiday')) {
    return { bg: colors.divider, color: colors.textSecondary };
  }
  return { bg: colors.mutedBackground, color: colors.placeholder };
}

function formatAttendanceStatusLabel(status) {
  const normalized = String(status || '').trim();
  const lower = normalized.toLowerCase();
  if (lower === 'mc' || lower === 'missed checkout') {
    return 'Missed Checkout';
  }
  if (
    lower === 'lmc' ||
    lower === 'late & missed checkout' ||
    lower === 'late missed checkout'
  ) {
    return 'Late & Missed Checkout';
  }
  return normalized || '--';
}

function getHistoryRecordDisplayValues(record = {}) {
  const statusVal = record.status || record.attendanceStatus || '-';

  return {
    dayName: record.day || record.dayName || 'Day',
    dateVal: record.date || record.attendanceDate || '--',
    inVal: formatTime12h(record.checkIn || record.checkInTime),
    outVal: formatTime12h(record.checkOut || record.checkOutTime),
    hoursVal: record.hours || record.totalHours || '--',
    statusVal,
    statusLabel: formatAttendanceStatusLabel(statusVal),
  };
}

function AttendanceDetailRow({ icon, label, value }) {
  return (
    <View style={styles.attendanceDetailRow}>
      <View style={styles.attendanceDetailIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.attendanceDetailCopy}>
        <Text style={styles.attendanceDetailLabel}>{label}</Text>
        <Text style={styles.attendanceDetailValue}>{value || '--'}</Text>
      </View>
    </View>
  );
}

function getCurrentStatusMeta(isCheckedIn, isCheckedOut) {
  if (isCheckedOut) {
    return {
      label: 'Checked out',
      bg: colors.attendance.checkedOutBackground,
      color: colors.attendance.checkedOutText,
      icon: 'checkmark-done-outline',
    };
  }
  if (isCheckedIn) {
    return {
      label: 'Live attendance',
      bg: colors.attendance.checkedInBackground,
      color: colors.success,
      icon: null,
    };
  }
  return {
    label: 'Pending check-in',
    bg: colors.attendance.statusPendingBackground,
    color: colors.attendance.statusPendingText,
    icon: 'time-outline',
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getAttendanceDateKey(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const numericMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (numericMatch) {
    return [
      numericMatch[3],
      String(numericMatch[2]).padStart(2, '0'),
      String(numericMatch[1]).padStart(2, '0'),
    ].join('-');
  }

  const namedMonthMatch = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (namedMonthMatch) {
    const months = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };
    const month = months[namedMonthMatch[2].slice(0, 3).toLowerCase()];

    if (month) {
      return [
        namedMonthMatch[3],
        String(month).padStart(2, '0'),
        String(namedMonthMatch[1]).padStart(2, '0'),
      ].join('-');
    }
  }

  return '';
}

function hasValidAttendanceTime(value) {
  const normalized = String(value ?? '').trim();
  return normalized !== '' && normalized !== '--' && normalized !== '-';
}

function findTodayRecordFromCurrentWeek(records, now = new Date()) {
  if (!Array.isArray(records)) return null;

  const explicitlyToday = records.find((record) => record?.isToday === true);
  if (explicitlyToday) return explicitlyToday;

  const todayDateKey = getLocalDateKey(now);
  const exactDateRecord = records.find((record) => {
    const recordDate =
      record?.date ??
      record?.attendanceDate ??
      record?.attendanceDay ??
      '';

    return getAttendanceDateKey(recordDate) === todayDateKey;
  });

  if (exactDateRecord) return exactDateRecord;

  /*
   * Weekday fallback is safe only for the CURRENT WEEK response.
   * Never use this path for Last Week, Month, or Last Month data.
   */
  const currentDayLong = now
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();
  const currentDayShort = now
    .toLocaleDateString('en-US', { weekday: 'short' })
    .toLowerCase();

  return (
    records.find((record) => {
      const day = String(record?.day ?? record?.dayName ?? '')
        .trim()
        .toLowerCase();

      return day === currentDayLong || day === currentDayShort;
    }) || null
  );
}

function formatLocalTimeForState(date = new Date()) {
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
}

export default function MyAttendanceScreen() {
  const { width } = useWindowDimensions();
  const isSmallDevice = width < 360;
  const isTablet = width >= 768;
  const horizontalPadding = isSmallDevice ? spacing.lg : isTablet ? 28 : spacing.screen;

  const [activeTab, setActiveTab] = useState('Week');
  const [historyList, setHistoryList] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [checkInTime, setCheckInTime] = useState('--');
  const [checkOutTime, setCheckOutTime] = useState('--');
  const [totalHours, setTotalHours] = useState('--');
  const [isLoadingToday, setIsLoadingToday] = useState(true);
  const [todayError, setTodayError] = useState('');
  const [attendanceSettings, setAttendanceSettings] = useState(null);
  const [isLoadingAttendanceSettings, setIsLoadingAttendanceSettings] = useState(true);
  const [attendanceSettingsError, setAttendanceSettingsError] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const [isReasonModalVisible, setIsReasonModalVisible] = useState(false);
  const [locationReason, setLocationReason] = useState('');
  const [lastCapturedLocation, setLastCapturedLocation] = useState(null);
  const [isSubmittingReason, setIsSubmittingReason] = useState(false);
  const [isVerifyingReasonSubmission, setIsVerifyingReasonSubmission] = useState(false);
  const [reasonSubmissionState, setReasonSubmissionState] = useState(REASON_SUBMISSION_STATE.IDLE);
  const [reasonSubmissionError, setReasonSubmissionError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const historyRequestIdRef = useRef(0);
  const todayRequestIdRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const reasonSubmissionLockRef = useRef(false);
  const checkoutReasonAttemptIdRef = useRef(null);
  const attendanceMutationGuardRef = useRef(null);

  const effectiveCheckInStartTime =
    attendanceSettings?.checkInStartTime || DEFAULT_CHECK_IN_START_TIME;
  const checkInOpeningLabel =
    formatBackendTime12h(effectiveCheckInStartTime) || '8:55 AM';
  const isBeforeCheckInStartTime = isBeforeConfiguredTime(
    currentTime,
    effectiveCheckInStartTime
  );
  const isCheckInDisabled =
    isCheckedIn ||
    isCheckedOut ||
    isLoadingToday ||
    isCheckingIn ||
    isCheckingOut ||
    isLoadingAttendanceSettings ||
    isBeforeCheckInStartTime;
  const isCheckOutDisabled =
    isLoadingToday ||
    isCheckingIn ||
    isCheckingOut ||
    !isCheckedIn ||
    isCheckedOut;
  const attendanceSubtitle = isCheckedOut
    ? 'Your checkout has been recorded for today.'
    : isCheckedIn
      ? 'Checkout remains available after your workday.'
      : isLoadingAttendanceSettings
        ? 'Loading attendance timing...'
        : isBeforeCheckInStartTime
          ? `Check-in opens at ${checkInOpeningLabel}.`
          : 'Check-in is available now.';
  const isReasonSubmissionBusy =
    reasonSubmissionState === REASON_SUBMISSION_STATE.SUBMITTING ||
    reasonSubmissionState === REASON_SUBMISSION_STATE.VERIFYING ||
    isSubmittingReason ||
    isVerifyingReasonSubmission;
  const isReasonSubmissionUnconfirmed =
    reasonSubmissionState === REASON_SUBMISSION_STATE.UNCONFIRMED;

  const clearExpiredAttendanceMutationGuard = useCallback((now = new Date()) => {
    const guard = attendanceMutationGuardRef.current;
    if (guard && guard.dateKey !== getLocalDateKey(now)) {
      attendanceMutationGuardRef.current = null;
      return null;
    }
    return guard;
  }, []);

  const setAttendanceMutationGuard = useCallback((guard) => {
    attendanceMutationGuardRef.current = {
      dateKey: getLocalDateKey(new Date()),
      createdAt: Date.now(),
      ...guard,
    };
  }, []);

  const applyTodayRecord = useCallback((record) => {
    const guard = clearExpiredAttendanceMutationGuard(new Date());
    const rawCheckIn =
      record?.checkIn ??
      record?.checkInTime ??
      record?.checkinTime ??
      record?.inTime ??
      '';

    const rawCheckOut =
      record?.checkOut ??
      record?.checkOutTime ??
      record?.checkoutTime ??
      record?.outTime ??
      '';

    const rawHours =
      record?.hours ??
      record?.totalHours ??
      record?.workingHours ??
      record?.workedHours ??
      record?.duration ??
      '--';

    const checkedIn = hasValidAttendanceTime(rawCheckIn);
    const checkedOut = hasValidAttendanceTime(rawCheckOut);
    let nextCheckedIn = checkedIn;
    let nextCheckedOut = checkedOut;
    let nextCheckInTime = checkedIn ? formatTime12h(rawCheckIn) : '--';
    let nextCheckOutTime = checkedOut ? formatTime12h(rawCheckOut) : '--';

    if (guard?.type === 'checkin') {
      if (!nextCheckedIn && hasValidAttendanceTime(guard.checkInTime)) {
        nextCheckedIn = true;
        nextCheckInTime = formatTime12h(guard.checkInTime);
      } else if (nextCheckedIn) {
        attendanceMutationGuardRef.current = null;
      }
    }

    if (guard?.type === 'checkout') {
      if (!nextCheckedOut && hasValidAttendanceTime(guard.checkOutTime)) {
        nextCheckedIn = true;
        nextCheckedOut = true;
        nextCheckOutTime = formatTime12h(guard.checkOutTime);
      } else if (nextCheckedOut) {
        attendanceMutationGuardRef.current = null;
      }
    }

    setIsCheckedIn(nextCheckedIn);
    setIsCheckedOut(nextCheckedOut);
    setCheckInTime(nextCheckInTime);
    setCheckOutTime(nextCheckOutTime);
    setTotalHours(
      rawHours !== null &&
        rawHours !== undefined &&
        String(rawHours).trim() !== ''
        ? String(rawHours)
        : '--'
    );
  }, [clearExpiredAttendanceMutationGuard]);

  const resetTodayStatus = useCallback(() => {
    setIsCheckedIn(false);
    setIsCheckedOut(false);
    setCheckInTime('--');
    setCheckOutTime('--');
    setTotalHours('--');
  }, []);

  const loadTodayStatus = useCallback(async ({ silent = false } = {}) => {
    const requestId = todayRequestIdRef.current + 1;
    todayRequestIdRef.current = requestId;
    if (!silent) setIsLoadingToday(true);

    try {
      const res = await getAttendanceHistory('Week');

      if (requestId !== todayRequestIdRef.current) return;

      if (!res.success || !Array.isArray(res.data)) {
        setTodayError(res.message || 'Unable to load today attendance.');
        return;
      }

      const todayRecord = findTodayRecordFromCurrentWeek(res.data, new Date());

      // if (__DEV__) {
      //   console.log('[Attendance Today from Week]', {
      //     found: Boolean(todayRecord),
      //     isToday: todayRecord?.isToday,
      //     day: todayRecord?.day,
      //     date: todayRecord?.date ?? todayRecord?.attendanceDate,
      //     checkIn: todayRecord?.checkIn ?? todayRecord?.checkInTime,
      //     checkOut: todayRecord?.checkOut ?? todayRecord?.checkOutTime,
      //     hours: todayRecord?.hours ?? todayRecord?.totalHours,
      //   });
      // }

      if (!todayRecord) {
        if (clearExpiredAttendanceMutationGuard(new Date())) {
          setTodayError('');
          return;
        }
        resetTodayStatus();
        setTodayError('');
        return;
      }

      applyTodayRecord(todayRecord);
      setTodayError('');
    } catch (error) {
      setTodayError(error?.message || 'Unable to load today attendance.');
    } finally {
      if (requestId === todayRequestIdRef.current) {
        setIsLoadingToday(false);
      }
    }
  }, [applyTodayRecord, clearExpiredAttendanceMutationGuard, resetTodayStatus]);

  const loadAttendanceSettings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoadingAttendanceSettings(true);

    try {
      const result = await getAttendanceSettings();

      if (result.success && result.data?.checkInStartTime) {
        setAttendanceSettings(result.data);
        setAttendanceSettingsError('');
      } else {
        setAttendanceSettingsError(result.message || 'Unable to load attendance timing.');
      }
    } finally {
      setIsLoadingAttendanceSettings(false);
    }
  }, []);

  const loadHistoryData = useCallback(async (period, { silent = false } = {}) => {
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;
    if (!silent) setIsLoadingHistory(true);
    setHistoryError('');

    try {
      const res = await getAttendanceHistory(period);

      if (requestId !== historyRequestIdRef.current) return;

      if (res.success && Array.isArray(res.data)) {
        setHistoryList(res.data);
        setHistoryError('');
      } else {
        if (!silent) {
          setHistoryList([]);
        }
        setHistoryError(res.message || 'Unable to load attendance history.');
      }
    } catch (error) {
      if (requestId === historyRequestIdRef.current) {
        if (!silent) {
          setHistoryList([]);
        }
        setHistoryError(error?.message || 'Unable to load attendance history.');
      }
    } finally {
      if (requestId === historyRequestIdRef.current) {
        setIsLoadingHistory(false);
      }
    }
  }, []);

  const releaseReasonSubmissionLock = useCallback(() => {
    reasonSubmissionLockRef.current = false;
    setIsSubmittingReason(false);
    setIsVerifyingReasonSubmission(false);
    setReasonSubmissionState(REASON_SUBMISSION_STATE.IDLE);
  }, []);

  const closeReasonModal = useCallback(() => {
    if (reasonSubmissionLockRef.current) return;

    setIsReasonModalVisible(false);
    setLocationReason('');
    setLastCapturedLocation(null);
    setReasonSubmissionError('');
    setReasonSubmissionState(REASON_SUBMISSION_STATE.IDLE);
    checkoutReasonAttemptIdRef.current = null;
  }, []);

  const verifyCheckoutRecorded = useCallback(async ({ attempts = 3, delayMs = 1500 } = {}) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const result = await getAttendanceHistory('Week');

      if (result.success && Array.isArray(result.data)) {
        const todayRecord = findTodayRecordFromCurrentWeek(result.data, new Date());
        const checkoutValue =
          todayRecord?.checkOut ??
          todayRecord?.checkOutTime ??
          todayRecord?.checkoutTime ??
          '';

        if (hasValidAttendanceTime(checkoutValue)) {
          return {
            confirmed: true,
            record: todayRecord,
          };
        }
      }
    }

    return {
      confirmed: false,
      record: null,
    };
  }, []);

  const completeReasonCheckoutSuccess = useCallback(
    async (source, message) => {
      const rawCheckOut =
        source?.checkOut ??
        source?.checkOutTime ??
        source?.checkoutTime ??
        source?.data?.checkOut ??
        source?.data?.checkOutTime ??
        '';
      const successfulCheckOutTime = hasValidAttendanceTime(rawCheckOut)
        ? rawCheckOut
        : formatLocalTimeForState(new Date());

      const rawHours =
        source?.hours ??
        source?.workingHours ??
        source?.totalHours ??
        source?.data?.hours ??
        source?.data?.workingHours ??
        source?.data?.totalHours ??
        '';

      setIsCheckedIn(true);
      setIsCheckedOut(true);
      setAttendanceMutationGuard({
        type: 'checkout',
        checkOutTime: successfulCheckOutTime,
      });

      setCheckOutTime(formatTime12h(successfulCheckOutTime));

      if (rawHours !== null && rawHours !== undefined && String(rawHours).trim()) {
        setTotalHours(String(rawHours));
      }

      setIsReasonModalVisible(false);
      setLocationReason('');
      setLastCapturedLocation(null);
      setReasonSubmissionError('');
      setReasonSubmissionState(REASON_SUBMISSION_STATE.COMPLETED);
      checkoutReasonAttemptIdRef.current = null;
      releaseReasonSubmissionLock();

      Alert.alert(
        'Check-Out Submitted',
        message || 'Your location reason and checkout were recorded.'
      );

      await Promise.all([
        loadTodayStatus({ silent: true }),
        loadHistoryData(activeTabRef.current, { silent: true }),
      ]);
    },
    [loadHistoryData, loadTodayStatus, releaseReasonSubmissionLock, setAttendanceMutationGuard]
  );

  const reconcileAlreadyCheckedOut = useCallback(async () => {
    setReasonSubmissionState(REASON_SUBMISSION_STATE.VERIFYING);
    setIsVerifyingReasonSubmission(true);
    const verification = await verifyCheckoutRecorded();
    setIsVerifyingReasonSubmission(false);

    if (verification.confirmed) {
      await completeReasonCheckoutSuccess(
        verification.record,
        'Your checkout has already been recorded.'
      );
      return true;
    }

    setReasonSubmissionState(REASON_SUBMISSION_STATE.IDLE);
    return false;
  }, [completeReasonCheckoutSuccess, verifyCheckoutRecorded]);

  const handleVerifyUnconfirmedCheckout = useCallback(async () => {
    if (reasonSubmissionState !== REASON_SUBMISSION_STATE.UNCONFIRMED) {
      return;
    }

    setReasonSubmissionState(REASON_SUBMISSION_STATE.VERIFYING);
    setIsVerifyingReasonSubmission(true);
    setReasonSubmissionError('');

    try {
      const verification = await verifyCheckoutRecorded({
        attempts: 3,
        delayMs: 1500,
      });

      if (verification.confirmed) {
        await completeReasonCheckoutSuccess(
          verification.record,
          'Your checkout has already been recorded.'
        );
        return;
      }

      setReasonSubmissionError(
        'Checkout status could not be confirmed. Refresh attendance before attempting checkout again.'
      );
      setReasonSubmissionState(REASON_SUBMISSION_STATE.UNCONFIRMED);
    } finally {
      setIsVerifyingReasonSubmission(false);
    }
  }, [completeReasonCheckoutSuccess, reasonSubmissionState, verifyCheckoutRecorded]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1)), useNativeDriver: true }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [fadeAnim, pulseAnim, slideAnim]);

  useFocusEffect(
    useCallback(() => {
      setCurrentTime(new Date());
      loadTodayStatus();
      loadHistoryData(activeTabRef.current);
      loadAttendanceSettings();
    }, [loadAttendanceSettings, loadHistoryData, loadTodayStatus])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      clearExpiredAttendanceMutationGuard(new Date());
    }, 15000);

    return () => clearInterval(timer);
  }, [clearExpiredAttendanceMutationGuard]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setCurrentTime(new Date());
        clearExpiredAttendanceMutationGuard(new Date());
        loadTodayStatus({ silent: true });
        loadAttendanceSettings({ silent: true });
        loadHistoryData(activeTabRef.current, { silent: true });
      }
    });

    return () => subscription.remove();
  }, [clearExpiredAttendanceMutationGuard, loadAttendanceSettings, loadHistoryData, loadTodayStatus]);

  const handleTabChange = (tabName) => {
    setSelectedHistoryRecord(null);
    activeTabRef.current = tabName;
    setActiveTab(tabName);
    loadHistoryData(tabName);
  };

  const openAttendanceDetails = useCallback((record) => {
    setSelectedHistoryRecord(record);
  }, []);

  const closeAttendanceDetails = useCallback(() => {
    setSelectedHistoryRecord(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadTodayStatus({ silent: true }),
        loadHistoryData(activeTab, { silent: true }),
        loadAttendanceSettings({ silent: true }),
      ]);
      setCurrentTime(new Date());
      clearExpiredAttendanceMutationGuard(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, clearExpiredAttendanceMutationGuard, loadAttendanceSettings, loadHistoryData, loadTodayStatus]);

  const handleCheckInPress = async () => {
    const now = new Date();
    const configuredStartTime =
      attendanceSettings?.checkInStartTime || DEFAULT_CHECK_IN_START_TIME;

    // Device time gates the UI, but backend validation remains authoritative.
    if (isBeforeConfiguredTime(now, configuredStartTime)) {
      Alert.alert(
        'Check-In Restricted',
        `Check-in opens at ${formatBackendTime12h(configuredStartTime) || '8:55 AM'}.`
      );
      return;
    }

    if (isCheckedIn) {
      Alert.alert('Already Checked In', 'You have already checked in for today.');
      return;
    }

    setIsCheckingIn(true);

    try {
      const locResult = await getCurrentLocation();
      if (!locResult.success) {
        return;
      }

      const res = await checkInAttendance(locResult.location);

      if (res.success) {
        const rawServerCheckIn =
          res.data?.checkIn ??
          res.data?.checkInTime ??
          res.data?.data?.checkIn ??
          res.data?.data?.checkInTime ??
          '';
        const successfulCheckInTime = rawServerCheckIn || formatLocalTimeForState(now);
        const serverTime = formatTime12h(successfulCheckInTime);

        setIsCheckedIn(true);
        setIsCheckedOut(false);
        setCheckInTime(serverTime);
        setCheckOutTime('--');
        setAttendanceMutationGuard({
          type: 'checkin',
          checkInTime: successfulCheckInTime,
        });
        if (totalHours === '--' || !totalHours) {
          setTotalHours('0h 0m');
        }

        Alert.alert('Check-In Successful!', res.message || `Checked in at ${serverTime}`);
        await Promise.all([
          loadTodayStatus({ silent: true }),
          loadHistoryData(activeTab, { silent: true }),
        ]);
      } else {
        if ((res.message || '').toLowerCase().includes('already checked in')) {
          loadTodayStatus({ silent: true });
        }
        Alert.alert('Check-In Failed', res.message || 'Unable to check in. Please try again.');
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOutPress = async () => {
    if (!isCheckedIn) {
      Alert.alert('Check-In Required', 'You must check in first before checking out.');
      return;
    }
    if (isCheckedOut) {
      Alert.alert('Already Checked Out', 'You have already checked out for today.');
      return;
    }

    setIsCheckingOut(true);

    try {
      const locResult = await getCurrentLocation();
      if (!locResult.success) {
        return;
      }

      setLastCapturedLocation(locResult.location);

      const res = await checkOutAttendance(locResult.location);

      if (res.success) {
        const now = new Date();
        const rawServerCheckOut =
          res.data?.checkOut ??
          res.data?.checkOutTime ??
          res.data?.data?.checkOut ??
          res.data?.data?.checkOutTime ??
          '';
        const rawServerHours =
          res.data?.hours ??
          res.data?.workingHours ??
          res.data?.totalHours ??
          res.data?.data?.hours ??
          res.data?.data?.workingHours ??
          res.data?.data?.totalHours ??
          '';
        const successfulCheckOutTime = rawServerCheckOut || formatLocalTimeForState(now);
        const serverTime = formatTime12h(successfulCheckOutTime);

        setIsCheckedIn(true);
        setIsCheckedOut(true);
        setCheckOutTime(serverTime);
        setAttendanceMutationGuard({
          type: 'checkout',
          checkOutTime: successfulCheckOutTime,
        });
        if (rawServerHours !== null && rawServerHours !== undefined && String(rawServerHours).trim()) {
          setTotalHours(String(rawServerHours));
        }

        Alert.alert('Check-Out Successful!', res.message || `Checked out at ${serverTime}`);
        await Promise.all([
          loadTodayStatus({ silent: true }),
          loadHistoryData(activeTab, { silent: true }),
        ]);
      } else if (res.requiresReason) {
        checkoutReasonAttemptIdRef.current =
          `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        setReasonSubmissionError('');
        setReasonSubmissionState(REASON_SUBMISSION_STATE.IDLE);
        setIsReasonModalVisible(true);
      } else {
        if ((res.message || '').toLowerCase().includes('already checked out')) {
          loadTodayStatus({ silent: true });
        }
        Alert.alert('Check-Out Failed', res.message || 'Unable to check out. Please try again.');
      }
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleSubmitLocationReason = async () => {
    if (
      reasonSubmissionState === REASON_SUBMISSION_STATE.UNCONFIRMED ||
      reasonSubmissionState === REASON_SUBMISSION_STATE.VERIFYING ||
      reasonSubmissionLockRef.current ||
      isSubmittingReason
    ) {
      return;
    }

    if (isCheckedOut) {
      setIsReasonModalVisible(false);
      setLocationReason('');
      setLastCapturedLocation(null);
      setReasonSubmissionError('');
      setReasonSubmissionState(REASON_SUBMISSION_STATE.COMPLETED);
      checkoutReasonAttemptIdRef.current = null;
      Alert.alert('Already Checked Out', 'Your checkout has already been recorded.');
      return;
    }

    const trimmedReason = locationReason.trim();

    if (!trimmedReason || trimmedReason.length < 10) {
      Alert.alert('Reason Too Short', 'Please provide a detailed reason (minimum 10 characters).');
      return;
    }

    if (!lastCapturedLocation) {
      Alert.alert(
        'Location Required',
        'Your checkout location is unavailable. Close this message and try Check Out again.'
      );
      return;
    }

    reasonSubmissionLockRef.current = true;
    setReasonSubmissionState(REASON_SUBMISSION_STATE.SUBMITTING);
    setIsSubmittingReason(true);
    setReasonSubmissionError('');

    const payload = {
      ...lastCapturedLocation,
      locationChangeReason: trimmedReason,
    };

    if (__DEV__) {
      console.log('[Attendance checkout reason]', {
        attemptId: checkoutReasonAttemptIdRef.current,
        phase: 'submit-start',
      });
    }

    let shouldReleaseLock = true;

    try {
      const res = await checkOutAttendance(payload);

      if (res.success) {
        shouldReleaseLock = false;
        await completeReasonCheckoutSuccess(
          res.data,
          'Your location reason and checkout were recorded.'
        );
        return;
      }

      if (res.code === 'SESSION_EXPIRED') {
        shouldReleaseLock = false;
        return;
      }

      const lowerMessage = String(res.message || '').toLowerCase();
      const alreadyCheckedOut =
        lowerMessage.includes('already checked out') ||
        lowerMessage.includes('checkout already completed') ||
        lowerMessage.includes('attendance already checked out');

      if (alreadyCheckedOut) {
        const reconciled = await reconcileAlreadyCheckedOut();
        if (reconciled) {
          shouldReleaseLock = false;
          return;
        }
      }

      const outcomeUnknown =
        res.isOutcomeUnknown ||
        res.code === 'REQUEST_TIMEOUT' ||
        res.code === 'NETWORK_ERROR' ||
        Number(res.status) >= 500 ||
        lowerMessage.includes('timed out');

      if (outcomeUnknown) {
        shouldReleaseLock = false;
        setReasonSubmissionState(REASON_SUBMISSION_STATE.VERIFYING);
        setIsSubmittingReason(false);
        setIsVerifyingReasonSubmission(true);
        const verification = await verifyCheckoutRecorded();
        setIsVerifyingReasonSubmission(false);

        if (verification.confirmed) {
          shouldReleaseLock = false;
          await completeReasonCheckoutSuccess(
            verification.record,
            'Checkout was completed successfully.'
          );
          return;
        }

        setReasonSubmissionError(
          'Checkout status could not be confirmed. Refresh attendance before attempting checkout again.'
        );
        setReasonSubmissionState(REASON_SUBMISSION_STATE.UNCONFIRMED);
        Alert.alert(
          'Checkout Status Unconfirmed',
          'The server did not return a clear result. Refresh checkout status before attempting checkout again.'
        );
        return;
      }

      setReasonSubmissionError(res.message || 'Failed to submit location reason. Please try again.');
      Alert.alert('Submission Failed', res.message || 'Failed to submit location reason. Please try again.');
    } finally {
      if (shouldReleaseLock) {
        releaseReasonSubmissionLock();
      }
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const currentStatus = getCurrentStatusMeta(isCheckedIn, isCheckedOut);

  const attendanceSummary = useMemo(() => {
    const summary = {
      present: 0,
      late: 0,
      leave: 0,
      absent: 0,
      total: historyList.length,
    };

    historyList.forEach((record) => {
      const status = (record.status || record.attendanceStatus || '').toLowerCase();
      if (status.includes('present')) summary.present += 1;
      if (status.includes('late')) summary.late += 1;
      if (status.includes('leave') || status.includes('half') || status.includes('loss')) summary.leave += 1;
      if (status.includes('absent')) summary.absent += 1;
    });

    return summary;
  }, [historyList]);

  const renderMetric = (label, value, icon, toneColor = colors.primary) => (
    <View style={styles.metricTile}>
      <View style={styles.metricHeader}>
        <Ionicons name={icon} size={16} color={toneColor} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue} numberOfLines={1}>{value || '--'}</Text>
    </View>
  );

  const renderSummaryItem = (label, value, icon, styleName, textColor, isTotal = false) => (
    <View style={[styles.summaryItem, styles[styleName], isTotal && styles.summaryItemTotal]}>
      <View style={styles.summaryIconRow}>
        <Ionicons
          name={icon}
          size={15}
          color={textColor}
        />
        <Text
          style={[styles.summaryLabel, { color: textColor }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
      </View>
      <Text style={[styles.summaryValue, isTotal && styles.summaryValueTotal, { color: textColor }]}>
        {value}
      </Text>
    </View>
  );

  const renderHistoryItem = ({ item }) => {
    const {
      dayName,
      dateVal,
      inVal,
      outVal,
      hoursVal,
      statusVal,
      statusLabel,
    } = getHistoryRecordDisplayValues(item);
    const badgeStyle = getStatusBadgeStyle(statusVal);

    return (
      <TouchableOpacity
        style={styles.historyRow}
        onPress={() => openAttendanceDetails(item)}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={`View attendance details for ${dayName}, ${dateVal}`}
      >
        <View style={styles.historyDate}>
          <Text style={styles.historyDay} numberOfLines={1}>{dayName}</Text>
          <Text style={styles.historySubText} numberOfLines={1}>{dateVal}</Text>
        </View>
        <View style={styles.historyTimes}>
          <Text style={styles.historyTimeText}>In {inVal}</Text>
          <Text style={styles.historyTimeText}>Out {outVal}</Text>
        </View>
        <View style={styles.historyTrailing}>
          <Text style={styles.historyHours}>{hoursVal}</Text>
          <View style={[styles.statusBadge, { backgroundColor: badgeStyle.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badgeStyle.color }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAttendanceDetailsModal = () => {
    const record = selectedHistoryRecord;
    const {
      dayName,
      dateVal,
      inVal,
      outVal,
      hoursVal,
      statusLabel,
    } = getHistoryRecordDisplayValues(record || {});

    return (
      <Modal
        visible={Boolean(record)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeAttendanceDetails}
      >
        <View style={styles.attendanceDetailsOverlay}>
          <View style={[styles.attendanceDetailsCard, { width: Math.min(width - spacing.xl * 2, 460) }]}>
            <View style={styles.attendanceDetailsHeader}>
              <Text style={styles.attendanceDetailsTitle}>Attendance Details</Text>
              <TouchableOpacity
                style={styles.attendanceDetailsCloseButton}
                onPress={closeAttendanceDetails}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close attendance details"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.attendanceDetailsBody}
              showsVerticalScrollIndicator={false}
            >
              <AttendanceDetailRow icon="calendar-outline" label="Day" value={dayName} />
              <AttendanceDetailRow icon="calendar-number-outline" label="Date" value={dateVal} />
              <AttendanceDetailRow icon="log-in-outline" label="Check In" value={inVal} />
              <AttendanceDetailRow icon="log-out-outline" label="Check Out" value={outVal} />
              <AttendanceDetailRow icon="timer-outline" label="Working Hours" value={hoursVal} />
              <AttendanceDetailRow icon="information-circle-outline" label="Status" value={statusLabel} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const listHeader = (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.eyebrow}>TODAY</Text>
            <Text style={styles.dateText}>{todayFormatted}</Text>
          </View>
          <View style={[styles.currentBadge, { backgroundColor: currentStatus.bg }]}>
            {isCheckedIn && !isCheckedOut && (
              <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            )}
            {!!currentStatus.icon && (
              <Ionicons name={currentStatus.icon} size={15} color={currentStatus.color} />
            )}
            <Text style={[styles.currentBadgeText, { color: currentStatus.color }]}>
              {currentStatus.label}
            </Text>
          </View>
        </View>

        <View style={styles.heroStatusRow}>
          <View style={styles.statusCopy}>
            <Text style={styles.heroTitle}>
              {isCheckedOut ? 'Workday completed' : isCheckedIn ? 'You are checked in' : 'Ready for attendance'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {attendanceSubtitle}
            </Text>
            {!!attendanceSettingsError && (
              <View style={styles.settingsNotice}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                <Text style={styles.settingsNoticeText} numberOfLines={2}>
                  {attendanceSettingsError}
                </Text>
              </View>
            )}
            {!!todayError && (
              <View style={styles.settingsNotice}>
                <Ionicons name="refresh-circle-outline" size={15} color={colors.warning} />
                <Text style={styles.settingsNoticeText} numberOfLines={2}>
                  {todayError}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.metricsGrid}>
          {renderMetric('Check in', checkInTime, 'log-in-outline', colors.success)}
          {renderMetric('Check out', checkOutTime, 'log-out-outline', colors.info)}
          {renderMetric('Duration', totalHours, 'timer-outline', colors.primary)}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.checkInButton,
              isCheckInDisabled && styles.actionDisabled,
            ]}
            onPress={handleCheckInPress}
            disabled={isCheckInDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check in"
            accessibilityState={{ disabled: isCheckInDisabled }}
          >
            {isCheckingIn ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={18} color={colors.white} />
                <Text style={styles.actionButtonText}>Check In</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.checkOutButton,
              isCheckOutDisabled && styles.actionDisabled,
            ]}
            onPress={handleCheckOutPress}
            disabled={isCheckOutDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check out"
            accessibilityState={{ disabled: isCheckOutDisabled }}
          >
            {isCheckingOut ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color={colors.white} />
                <Text style={styles.actionButtonText}>Check Out</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {historyList.length > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Attendance Summary</Text>
          <View style={styles.summaryGrid}>
            {renderSummaryItem('Present', attendanceSummary.present, 'checkmark-circle-outline', 'summaryPresent', colors.attendance.summaryPresentText)}
            {renderSummaryItem('Late', attendanceSummary.late, 'time-outline', 'summaryLate', colors.attendance.summaryLateText)}
            {renderSummaryItem('Leave', attendanceSummary.leave, 'calendar-outline', 'summaryLeave', colors.attendance.summaryLeaveText)}
            {renderSummaryItem('Absent', attendanceSummary.absent, 'close-circle-outline', 'summaryAbsent', colors.attendance.summaryAbsentText)}
            {renderSummaryItem('Total', attendanceSummary.total, 'layers-outline', 'summaryTotal', colors.attendance.summaryTotalText, true)}
          </View>
        </View>
      )}

      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.sectionTitle}>Attendance History</Text>
          <Text style={styles.sectionSubtitle}>Review records by period</Text>
        </View>
      </View>

      <View style={styles.filterPillContainer}>
        {['Week', 'Last Week', 'Month', 'Last Month'].map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterPill, isActive && styles.activeFilterPill]}
              onPress={() => handleTabChange(tab)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Show ${tab} attendance`}
            >
              <Text style={[styles.filterPillText, isActive && styles.activeFilterPillText, isSmallDevice && styles.filterPillTextSmall]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoadingHistory && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading history records...</Text>
        </View>
      )}
      {!!historyError && (
        <View style={styles.historyErrorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.historyErrorText}>{historyError}</Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={isLoadingHistory ? [] : historyList}
        keyExtractor={(item, index) => String(item.id || item.attendanceId || `${item.date || item.attendanceDate || 'record'}-${index}`)}
        renderItem={renderHistoryItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!isLoadingHistory ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={28} color={colors.placeholder} />
            <Text style={styles.emptyTitle}>No attendance records</Text>
            <Text style={styles.emptyText}>Pull down to refresh or choose another period.</Text>
          </View>
        ) : null}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: horizontalPadding },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />

      {renderAttendanceDetailsModal()}

      <Modal
        visible={isReasonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (isReasonSubmissionBusy || isReasonSubmissionUnconfirmed) {
            return;
          }

          closeReasonModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: Math.min(width - 32, 440) }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="location" size={24} color={colors.warning} style={styles.modalIcon} />
              <Text style={styles.modalTitle}>Location Change Detected</Text>
            </View>

            <Text style={styles.modalDescription}>
              Your checkout location is more than 500 meters away from your check-in location. Please provide a reason for this change.
            </Text>

            <AppTextInput
              style={styles.modalTextInput}
              value={locationReason}
              onChangeText={setLocationReason}
              placeholder="Enter reason for location change (minimum 10 characters)..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
              editable={!isReasonSubmissionBusy && !isReasonSubmissionUnconfirmed}
            />
            <Text style={styles.characterCountText}>
              {locationReason.length}/500 characters (min 10)
            </Text>
            {!!reasonSubmissionError && (
              <Text style={styles.reasonSubmissionError}>
                {reasonSubmissionError}
              </Text>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  (isReasonSubmissionBusy || isReasonSubmissionUnconfirmed) && styles.modalActionDisabled,
                ]}
                onPress={closeReasonModal}
                disabled={isReasonSubmissionBusy || isReasonSubmissionUnconfirmed}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel location reason"
                accessibilityState={{ disabled: isReasonSubmissionBusy || isReasonSubmissionUnconfirmed }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  isReasonSubmissionBusy && styles.modalActionDisabled,
                ]}
                onPress={isReasonSubmissionUnconfirmed ? handleVerifyUnconfirmedCheckout : handleSubmitLocationReason}
                disabled={isReasonSubmissionBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isReasonSubmissionUnconfirmed ? 'Refresh checkout status' : 'Submit location reason'}
                accessibilityState={{ disabled: isReasonSubmissionBusy, busy: isReasonSubmissionBusy }}
              >
                {isReasonSubmissionBusy ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {isReasonSubmissionUnconfirmed ? 'Refresh Checkout Status' : 'Submit Reason'}
                  </Text>
                )}
                {isReasonSubmissionBusy && (
                  <Text style={styles.modalSubmitText}>
                    {isVerifyingReasonSubmission ? 'Verifying checkout...' : 'Submitting...'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.attendance.background,
  },
  listContent: {
    paddingTop: spacing.xxl,
    paddingBottom: 132,
  },
  heroCard: {
    backgroundColor: colors.attendance.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.attendance.border,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    ...shadows.subtle,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: fontSizes.metricLabel,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
  },
  dateText: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.xs,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    gap: spacing.xs,
  },
  currentBadgeText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  heroStatusRow: {
    marginTop: spacing.xxl,
  },
  statusCopy: {
    flex: 1,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: fontWeights.extraBold,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  settingsNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.warningBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsNoticeText: {
    flex: 1,
    minWidth: 0,
    color: colors.warning,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  metricTile: {
    flex: 1,
    minHeight: 78,
    backgroundColor: colors.attendance.metricBackground,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.attendance.border,
    padding: spacing.lg,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.metricLabel,
    fontWeight: fontWeights.bold,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metricValue,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  actionButton: {
    flex: 1,
    minHeight: sizes.attendanceActionHeight,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.primary,
  },
  checkInButton: {
    backgroundColor: colors.attendance.checkInAction,
  },
  checkOutButton: {
    backgroundColor: colors.attendance.checkOutAction,
  },
  actionDisabled: {
    backgroundColor: colors.attendance.disabledAction,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  summaryCard: {
    backgroundColor: colors.attendance.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.attendance.border,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  summaryItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '47%',
    minWidth: 118,
    minHeight: 82,
    borderRadius: radii.xl,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.attendance.border,
  },
  summaryItemTotal: {
    flexBasis: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
    maxWidth: '100%',
  },
  summaryPresent: {
    backgroundColor: colors.attendance.summaryPresentBackground,
    borderColor: colors.successBackground,
  },
  summaryLate: {
    backgroundColor: colors.attendance.summaryLateBackground,
    borderColor: colors.warningBackground,
  },
  summaryLeave: {
    backgroundColor: colors.attendance.summaryLeaveBackground,
    borderColor: colors.border,
  },
  summaryAbsent: {
    backgroundColor: colors.attendance.summaryAbsentBackground,
    borderColor: colors.dangerBorder,
  },
  summaryTotal: {
    backgroundColor: colors.attendance.summaryTotalBackground,
    borderColor: colors.borderSoft,
  },
  summaryValue: {
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.lg,
  },
  summaryValueTotal: {
    marginTop: 0,
  },
  summaryLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    flexShrink: 1,
  },
  historyHeader: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  filterPillContainer: {
    flexDirection: 'row',
    backgroundColor: colors.attendanceTabBackground,
    borderRadius: radii.pill,
    padding: spacing.xs,
    marginBottom: spacing.lg,
  },
  filterPill: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
  },
  activeFilterPill: {
    backgroundColor: colors.white,
    ...shadows.subtle,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
  filterPillTextSmall: {
    fontSize: fontSizes.sm,
  },
  activeFilterPillText: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
  loadingBox: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    marginTop: spacing.md,
  },
  historyErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.warningBackground,
  },
  historyErrorText: {
    flex: 1,
    minWidth: 0,
    color: colors.warning,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.attendance.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.attendance.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  historyDate: {
    flex: 0.95,
    minWidth: 78,
  },
  historyDay: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  historySubText: {
    color: colors.placeholder,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  historyTimes: {
    flex: 1.1,
    gap: spacing.xs,
  },
  historyTimeText: {
    color: colors.textHeading,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  historyTrailing: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  historyHours: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  statusBadge: {
    maxWidth: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  statusBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  attendanceDetailsOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  attendanceDetailsCard: {
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: radii.card,
    overflow: 'hidden',
    ...shadows.modal,
  },
  attendanceDetailsHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingLeft: spacing.xxl,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  attendanceDetailsTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: fontWeights.extraBold,
  },
  attendanceDetailsCloseButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mutedBackground,
  },
  attendanceDetailsBody: {
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  attendanceDetailRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.attendance.border,
    backgroundColor: colors.attendance.surface,
  },
  attendanceDetailIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  attendanceDetailCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  attendanceDetailLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  attendanceDetailValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    lineHeight: 21,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.screenVertical,
    ...shadows.modal,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalIcon: {
    marginRight: spacing.md,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  modalDescription: {
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xxl,
  },
  modalTextInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: radii.xl,
    borderWidth: 1.2,
    borderColor: colors.disabled,
    padding: spacing.xl,
    height: 100,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  characterCountText: {
    fontSize: fontSizes.sm,
    color: colors.placeholder,
    textAlign: 'right',
    marginBottom: spacing.md,
    fontWeight: fontWeights.medium,
  },
  reasonSubmissionError: {
    color: colors.warning,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    lineHeight: 17,
    marginBottom: spacing.lg,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.divider,
  },
  modalCancelText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  modalActionDisabled: {
    opacity: 0.7,
  },
  modalSubmitText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
