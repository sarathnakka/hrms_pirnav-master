import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import {
  downloadPayslip,
  getMyPayslips,
  getPayslipPreview,
} from './payslipApi';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.payslips)) return payload.payslips;

  const firstArray = Object.values(payload || {}).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray : [];
}

function resolvePayslipId(item) {
  const value =
    item?.id ??
    item?.payslipId ??
    item?.paySlipId ??
    item?.payslip_Id ??
    item?.salarySlipId ??
    null;

  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  return value;
}

function toAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  const amount = Math.max(0, toAmount(value));
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function getMonthNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && value >= 1 && value <= 12) return value;

  const text = String(value).trim();
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric;

  const normalized = text.toLowerCase();
  const index = MONTH_NAMES.findIndex((month) => month.toLowerCase().startsWith(normalized.slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

function getMonthLabel(monthValue, yearValue) {
  const monthNumber = getMonthNumber(monthValue);
  const monthName = monthNumber ? MONTH_NAMES[monthNumber - 1] : monthValue;
  const year = yearValue ? String(yearValue) : '';
  if (monthName && year) return `${monthName} ${year}`;
  if (monthName) return String(monthName);
  if (year) return year;
  return 'Payslip';
}

function parseDateScore(value) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sanitizeFilenamePart(value) {
  return String(value || 'Payslip')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function normalizePayslip(item, index) {
  const id = resolvePayslipId(item);
  const month =
    item?.month ??
    item?.salaryMonth ??
    item?.payMonth ??
    item?.monthName ??
    item?.payrollMonth ??
    '';
  const year = item?.year ?? item?.salaryYear ?? item?.payrollYear ?? '';
  const gross = toAmount(item?.grossSalary ?? item?.gross ?? item?.grossPay ?? item?.ctc);
  const deductions = toAmount(item?.totalDeductions ?? item?.deductions ?? item?.deduction ?? item?.totalDeduction);
  const rawNet = item?.netSalary ?? item?.netPay ?? item?.takeHomeSalary ?? item?.payableAmount;
  const net = rawNet === undefined || rawNet === null || rawNet === ''
    ? Math.max(0, gross - deductions)
    : Math.max(0, toAmount(rawNet));

  const monthNumber = getMonthNumber(month);
  const numericYear = Number(year);
  const dateScore =
    (Number.isFinite(numericYear) && monthNumber ? numericYear * 100 + monthNumber : 0) ||
    parseDateScore(item?.salaryDate || item?.generatedDate || item?.createdAt || item?.updatedAt);

  return {
    ...item,
    id,
    sourceIndex: index,
    month,
    year,
    monthLabel: getMonthLabel(month, year),
    gross,
    deductions,
    net,
    dateScore,
  };
}

function normalizePayslips(payload) {
  const normalized = extractCollection(payload).map(normalizePayslip);
  const hasReliableSort = normalized.some((item) => item.dateScore > 0);
  if (!hasReliableSort) return normalized;
  return [...normalized].sort((left, right) => {
    if (left.dateScore && right.dateScore) return right.dateScore - left.dateScore;
    if (left.dateScore) return -1;
    if (right.dateScore) return 1;
    return left.sourceIndex - right.sourceIndex;
  });
}

function getFileName(payslip) {
  return `PIRNAV-Payslip-${sanitizeFilenamePart(payslip?.monthLabel)}.pdf`;
}

export default function PayslipScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);

  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fileAction, setFileAction] = useState({ type: '', id: null });

  const isNarrow = width < 360;
  const currentPayslip = payslips[0] || null;
  const pastPayslips = useMemo(() => payslips.slice(1), [payslips]);
  const recordLabel = `${payslips.length} ${payslips.length === 1 ? 'Record' : 'Records'}`;

  const loadPayslips = useCallback(
    async ({ refresh = false } = {}) => {
      if (!token) {
        setPayslips([]);
        setLoading(false);
        return;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const response = await getMyPayslips(token, { signal: controller.signal });
        if (!mountedRef.current || controller.signal.aborted) return;
        setPayslips(normalizePayslips(response));
      } catch (requestError) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setError(requestError.message || 'Unable to load payslips.');
      } finally {
        if (!mountedRef.current || controller.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    mountedRef.current = true;
    setPayslips([]);
    loadPayslips();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [loadPayslips]);

  const shareFile = async (file, dialogTitle) => {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      throw new Error('No PDF viewer is available on this device.');
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle,
    });
  };

  const openPayslipFile = async (file) => {
    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(file.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: 'application/pdf',
        });
        return;
      } catch {
        await shareFile(file, 'View Payslip');
        return;
      }
    }

    await shareFile(file, 'View Payslip');
  };

  const shareOrSavePayslipFile = async (file) => {
    await shareFile(file, 'Save or share payslip');
  };

  const handleFileAction = async (payslip, type) => {
    if (payslip?.id === undefined || payslip?.id === null) {
      Alert.alert('Unavailable', 'This payslip document is not available yet.');
      return;
    }
    if (fileAction.type) return;

    const actionKey = { type, id: payslip.id };
    setFileAction(actionKey);

    try {
      const filename = getFileName(payslip);
      if (type === 'preview') {
        const file = await getPayslipPreview(payslip.id, token, { filename });
        await openPayslipFile(file);
      } else {
        const file = await downloadPayslip(payslip.id, token, { filename });
        await shareOrSavePayslipFile(file);
        Alert.alert('Payslip downloaded', 'Payslip downloaded and ready to save or share.');
      }
    } catch (requestError) {
      Alert.alert(
        type === 'preview' ? 'Unable to open payslip' : 'Unable to download payslip',
        requestError.message || 'Please try again.'
      );
    } finally {
      setFileAction({ type: '', id: null });
    }
  };

  const renderMetric = (label, value, icon, tone, backgroundColor, style) => (
    <View
      style={[styles.metricTile, { backgroundColor }, style]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.metricHeader}>
        <View style={[styles.metricIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name={icon} size={18} color={tone} />
        </View>
        <Text style={[styles.metricLabel, { color: tone }]}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );

  const renderActionButton = (payslip, type, label, icon, variant = 'secondary', compact = false) => {
    const isLoading = fileAction.type === type && fileAction.id === payslip?.id;
    const disabled = !payslip?.id || Boolean(fileAction.type);
    const isPrimary = variant === 'primary';

    return (
      <TouchableOpacity
        style={[
          styles.fileButton,
          compact && styles.fileButtonCompact,
          isPrimary ? styles.downloadButton : styles.previewButton,
          disabled && styles.fileButtonDisabled,
          isNarrow && !compact && styles.fileButtonStacked,
        ]}
        onPress={() => handleFileAction(payslip, type)}
        disabled={disabled}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={`${label} for ${payslip?.monthLabel || 'payslip'}`}
        accessibilityState={{ disabled, busy: isLoading }}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isPrimary ? colors.payslip.downloadText : colors.payslip.previewText} />
        ) : (
          <>
            <Ionicons
              name={icon}
              size={17}
              color={isPrimary ? colors.payslip.downloadText : colors.payslip.previewText}
            />
            {!compact && (
              <Text style={[styles.fileButtonText, isPrimary ? styles.downloadButtonText : styles.previewButtonText]} numberOfLines={1}>
                {label}
              </Text>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderCurrentPayslip = () => {
    if (!currentPayslip || loading) return null;

    return (
      <View style={styles.currentCard}>
        <View style={styles.currentTopRow}>
          <View style={styles.sectionTitleWrap}>
            <View style={styles.sectionIcon}>
              <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Current Payslip</Text>
          </View>
          <View style={styles.monthBadge}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={styles.monthBadgeText} numberOfLines={1}>{currentPayslip.monthLabel}</Text>
          </View>
        </View>

        <View style={[styles.metricGrid, isNarrow && styles.metricGridStacked]}>
          {renderMetric('Gross Salary', formatCurrency(currentPayslip.gross), 'cash-outline', colors.payslip.grossAccent, colors.payslip.grossBackground)}
          {renderMetric('Deductions', formatCurrency(currentPayslip.deductions), 'remove-circle-outline', colors.payslip.deductionAccent, colors.payslip.deductionBackground)}
          {renderMetric('Net Pay', formatCurrency(currentPayslip.net), 'checkmark-circle-outline', colors.payslip.netAccent, colors.payslip.netBackground, styles.netMetric)}
        </View>

        <View style={[styles.actionsRow, isNarrow && styles.actionsStacked]}>
          {renderActionButton(currentPayslip, 'preview', 'View Payslip', 'eye-outline')}
          {renderActionButton(currentPayslip, 'download', 'Download PDF', 'download-outline', 'primary')}
        </View>
      </View>
    );
  };

  const renderState = (title, message, onRetry) => (
    <View style={styles.stateBox}>
      <View style={styles.stateIcon}>
        <Ionicons name={onRetry ? 'alert-circle-outline' : 'receipt-outline'} size={24} color={onRetry ? colors.error : colors.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {!!message && <Text style={styles.stateText}>{message}</Text>}
      {!!onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payslips"
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderLoading = () => (
    <View style={styles.loadingWrap}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateText}>Loading payslips...</Text>
      <View style={styles.skeletonRow} />
      <View style={styles.skeletonRowSmall} />
    </View>
  );

  const renderPastPayslip = ({ item }) => (
    <View style={styles.pastRow}>
      <View style={styles.pastIcon}>
        <Ionicons name="document-text-outline" size={18} color={colors.primary} />
      </View>
      <View style={styles.pastCopy}>
        <Text style={styles.pastMonth} numberOfLines={1}>{item.monthLabel}</Text>
        <Text style={styles.pastMeta} numberOfLines={1}>
          Gross {formatCurrency(item.gross)} · Deductions {formatCurrency(item.deductions)}
        </Text>
        <Text style={styles.pastNet}>{formatCurrency(item.net)}</Text>
      </View>
      <View style={styles.pastActions}>
        {renderActionButton(item, 'preview', 'View Payslip', 'eye-outline', 'secondary', true)}
        {renderActionButton(item, 'download', 'Download PDF', 'download-outline', 'primary', true)}
      </View>
    </View>
  );

  const header = (
    <View>
      <View style={styles.headingRow} accessible accessibilityRole="header">
        <View style={styles.headingCopy}>
          <Text style={styles.screenTitle}>My Payslips</Text>
          <Text style={styles.subtitle}>Track your salary, deductions and payslip documents.</Text>
        </View>
        <View style={styles.recordBadge}>
          <Ionicons name="receipt-outline" size={15} color={colors.primary} />
          <Text style={styles.recordBadgeText}>{recordLabel}</Text>
        </View>
      </View>

      {loading && renderLoading()}
      {!!error && !loading && renderState('Unable to load payslips.', error, () => loadPayslips())}
      {!loading && !error && payslips.length === 0 && renderState('No payslips available', 'Your generated payslips will appear here.', null)}
      {renderCurrentPayslip()}

      {!loading && !error && payslips.length > 0 && (
        <View style={styles.pastHeader}>
          <Text style={styles.sectionTitle}>Past Payslips</Text>
          <Text style={styles.sectionSubtitle}>Previous salary documents</Text>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={!loading && !error ? pastPayslips : []}
      keyExtractor={(item) => String(item.id ?? `${item.monthLabel}-${item.sourceIndex}`)}
      renderItem={renderPastPayslip}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !loading && !error && payslips.length > 0
          ? renderState('No past payslips found', '', null)
          : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadPayslips({ refresh: true })}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={[
        styles.content,
        { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 3 },
      ]}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.screen,
    backgroundColor: colors.payslip.background,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: 20,
    fontWeight: fontWeights.medium,
  },
  recordBadge: {
    minHeight: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.payslip.monthBadgeBackground,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  recordBadgeText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  currentCard: {
    backgroundColor: colors.payslip.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    ...shadows.card,
  },
  currentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.tealTintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardSectionTitle,
    fontWeight: fontWeights.extraBold,
  },
  sectionSubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  monthBadge: {
    maxWidth: 142,
    minHeight: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.payslip.monthBadgeBackground,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  monthBadgeText: {
    flexShrink: 1,
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricGridStacked: {
    flexDirection: 'column',
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 126,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    padding: spacing.lg,
  },
  netMetric: {
    flexBasis: '100%',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  metricValue: {
    marginTop: spacing.lg,
    fontSize: fontSizes.dashboardMetricValue,
    fontWeight: fontWeights.extraBold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  fileButton: {
    flex: 1,
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minWidth: 0,
  },
  fileButtonStacked: {
    width: '100%',
  },
  fileButtonCompact: {
    width: sizes.minTouchTarget,
    flex: 0,
    paddingHorizontal: 0,
  },
  previewButton: {
    backgroundColor: colors.payslip.previewBackground,
    borderWidth: 1,
    borderColor: colors.payslip.border,
  },
  downloadButton: {
    backgroundColor: colors.payslip.downloadBackground,
  },
  fileButtonDisabled: {
    opacity: 0.55,
  },
  fileButtonText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  previewButtonText: {
    color: colors.payslip.previewText,
  },
  downloadButtonText: {
    color: colors.payslip.downloadText,
  },
  pastHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.payslip.surface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.payslip.rowDivider,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.subtle,
  },
  pastIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  pastCopy: {
    flex: 1,
    minWidth: 0,
  },
  pastMonth: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  pastMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  pastNet: {
    marginTop: spacing.xs,
    color: colors.payslip.netAccent,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  pastActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stateBox: {
    minHeight: 132,
    borderRadius: radii.compactCard,
    backgroundColor: colors.payslip.emptySurface,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  stateIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.surface,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  loadingWrap: {
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.payslip.border,
    backgroundColor: colors.payslip.surface,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    gap: spacing.md,
    alignItems: 'center',
    ...shadows.subtle,
  },
  skeletonRow: {
    alignSelf: 'stretch',
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.borderSoft,
  },
  skeletonRowSmall: {
    alignSelf: 'stretch',
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.borderSoft,
  },
});
