import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import { formatRequestDate } from './teamDateUtils';
import { sameEmployeeId } from './teamRequestMappers';

function statusTone(status) {
  if (status === 'approved') return styles.statusApproved;
  if (String(status).startsWith('rejected')) return styles.statusRejected;
  if (status === 'cancelled' || status === 'expired') return styles.statusNeutral;
  return styles.statusPending;
}

function StatusBadge({ status, label }) {
  const textTone = status === 'approved'
    ? styles.statusApprovedText
    : String(status).startsWith('rejected')
      ? styles.statusRejectedText
      : status === 'cancelled' || status === 'expired'
        ? styles.statusNeutralText
        : styles.statusPendingText;
  return (
    <View style={[styles.statusBadge, statusTone(status)]}>
      <Text style={[styles.statusText, textTone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DetailLine({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Progress({ status, type }) {
  const steps = type === 'swap'
    ? ['Sent', 'Colleague', 'Admin', 'Updated']
    : ['Sent', 'Admin', 'Decision'];
  const rejected = String(status).startsWith('rejected');
  const completeThrough = type === 'swap'
    ? status === 'approved' ? 3 : status === 'pendingadmin' ? 1 : 0
    : status === 'approved' ? 2 : 0;
  const current = type === 'swap'
    ? status === 'pendingemployee' ? 1 : status === 'pendingadmin' ? 2 : -1
    : status === 'pending' ? 1 : -1;

  return (
    <View style={styles.progressRow} accessibilityLabel={`Request progress: ${steps.join(', ')}`}>
      {steps.map((step, index) => {
        const done = index <= completeThrough;
        const active = index === current;
        const failed = rejected && active;
        return (
          <View key={step} style={styles.progressStep}>
            <View style={[
              styles.progressDot,
              done && styles.progressDotDone,
              active && styles.progressDotActive,
              failed && styles.progressDotFailed,
            ]}>
              {done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
            </View>
            <Text style={styles.progressText} numberOfLines={1}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SwapCard({ request, employeeId, acting, onAccept, onReject }) {
  const canRespond = request.status === 'pendingemployee' && sameEmployeeId(request.toEmployeeId, employeeId);
  const fromName = request.fromEmployeeName || request.fromEmployeeId || 'Requester';
  const toName = request.toEmployeeName || request.toEmployeeId || 'Recipient';
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestTopRow}>
        <Text style={styles.requestTitle} numberOfLines={1}>Swap #{request.id}</Text>
        <StatusBadge status={request.status} label={request.statusLabel} />
      </View>
      <DetailLine label="Employees" value={`${fromName} to ${toName}`} />
      <DetailLine label="Date" value={formatRequestDate(request.date)} />
      <DetailLine
        label="Shifts"
        value={`${request.currentShiftName || `Shift #${request.currentShiftId || '-'}`} to ${request.requestedShiftName || `Shift #${request.requestedShiftId || '-'}`}`}
      />
      <DetailLine label="Reason" value={request.reason} />
      {request.remarks && String(request.status).startsWith('rejected') ? (
        <DetailLine label="Remarks" value={request.remarks} />
      ) : null}
      <Progress status={request.status} type="swap" />
      {canRespond ? (
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => onReject(request)}
            disabled={acting}
            accessibilityRole="button"
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => onAccept(request)}
            disabled={acting}
            accessibilityRole="button"
          >
            {acting ? <ActivityIndicator size="small" color={colors.white} /> : null}
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function ChangeCard({ request, acting, onCancel }) {
  const date = request.isPermanent
    ? `${formatRequestDate(request.effectiveFrom)} onward`
    : `${formatRequestDate(request.effectiveFrom)} - ${formatRequestDate(request.effectiveTo)}`;
  return (
    <View style={styles.requestCard}>
      <View style={styles.requestTopRow}>
        <Text style={styles.requestTitle} numberOfLines={1}>Change #{request.id}</Text>
        <StatusBadge status={request.status} label={request.statusLabel} />
      </View>
      <DetailLine
        label="Shift"
        value={`${request.currentShiftName || `Shift #${request.currentShiftId || '-'}`} to ${request.requestedShiftName || `Shift #${request.requestedShiftId || '-'}`}`}
      />
      <DetailLine label="Effective" value={date} />
      <DetailLine label="Type" value={request.isPermanent ? 'Permanent' : 'Temporary'} />
      <DetailLine label="Reason" value={request.reason} />
      {request.remarks && request.status === 'rejected' ? <DetailLine label="Remarks" value={request.remarks} /> : null}
      <Progress status={request.status} type="change" />
      {request.status === 'pending' ? (
        <TouchableOpacity
          style={styles.cancelRequestButton}
          onPress={() => onCancel(request)}
          disabled={acting}
          accessibilityRole="button"
        >
          {acting ? <ActivityIndicator size="small" color={colors.error} /> : null}
          <Text style={styles.cancelRequestText}>{acting ? 'Cancelling...' : 'Cancel request'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function TeamRequestsPanel({
  view,
  onViewChange,
  swaps,
  changes,
  employeeId,
  loading,
  error,
  onRetry,
  actingKey,
  onAccept,
  onReject,
  onCancelChange,
}) {
  const displayed = useMemo(() => {
    const records = view === 'swap' ? swaps : changes;
    const pending = records.filter((request) => (
      view === 'swap'
        ? request.status === 'pendingemployee' || request.status === 'pendingadmin'
        : request.status === 'pending'
    ));
    const decided = records.filter((request) => !pending.includes(request));
    return { pending, decided };
  }, [changes, swaps, view]);

  const renderRequest = (request) => {
    const key = `${view}-${request.id}`;
    return view === 'swap' ? (
      <SwapCard
        key={key}
        request={request}
        employeeId={employeeId}
        acting={actingKey === key}
        onAccept={onAccept}
        onReject={onReject}
      />
    ) : (
      <ChangeCard
        key={key}
        request={request}
        acting={actingKey === key}
        onCancel={onCancelChange}
      />
    );
  };

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={styles.kicker}>Team Requests</Text>
          <Text style={styles.panelTitle}>My Requests</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[styles.segment, view === 'swap' && styles.segmentActive]}
          onPress={() => onViewChange('swap')}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === 'swap' }}
        >
          <Text style={[styles.segmentText, view === 'swap' && styles.segmentTextActive]}>Shift Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, view === 'change' && styles.segmentActive]}
          onPress={() => onViewChange('change')}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === 'change' }}
        >
          <Text style={[styles.segmentText, view === 'change' && styles.segmentTextActive]}>Shift Change</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.requestError}>
          <Text style={styles.requestErrorText}>{error}</Text>
          <TouchableOpacity onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!error ? (
        <>
          <Text style={styles.sectionLabel}>Pending / Active</Text>
          {displayed.pending.length ? displayed.pending.map(renderRequest) : (
            <Text style={styles.emptyText}>No active {view === 'swap' ? 'shift swap' : 'shift change'} requests.</Text>
          )}
          <Text style={styles.sectionLabel}>Recently Decided</Text>
          {displayed.decided.length ? displayed.decided.map(renderRequest) : (
            <Text style={styles.emptyText}>No recently decided requests.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

export function MemberActionsModal({ visible, onClose, onShiftSwap, onShiftChange }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionOverlay} onPress={onClose}>
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>My Shift Actions</Text>
          <TouchableOpacity style={styles.actionRow} onPress={onShiftSwap} accessibilityRole="button">
            <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Shift Swap</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={onShiftChange} accessibilityRole="button">
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Shift Change</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.teams.border,
    borderRadius: radii.compactCard,
    backgroundColor: colors.teams.surface,
    ...shadows.subtle,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  kicker: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: fontWeights.extraBold, textTransform: 'uppercase' },
  panelTitle: { marginTop: spacing.xs, color: colors.textPrimary, fontSize: fontSizes.headerTitle, fontWeight: fontWeights.extraBold },
  segmented: { flexDirection: 'row', padding: spacing.xs, borderRadius: radii.md, backgroundColor: colors.mutedBackground },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textSecondary, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  segmentTextActive: { color: colors.white },
  sectionLabel: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: fontWeights.extraBold, textTransform: 'uppercase' },
  emptyText: { color: colors.textMuted, fontSize: fontSizes.base, lineHeight: 19 },
  requestCard: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.mutedBackground },
  requestTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  requestTitle: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.extraBold },
  statusBadge: { flexShrink: 1, maxWidth: '62%', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusPending: { backgroundColor: colors.warningBackground },
  statusApproved: { backgroundColor: colors.successBackground },
  statusRejected: { backgroundColor: colors.dangerBackground },
  statusNeutral: { backgroundColor: colors.mutedBackground },
  statusText: { color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: fontWeights.extraBold },
  statusApprovedText: { color: colors.success },
  statusRejectedText: { color: colors.error },
  statusPendingText: { color: colors.warning },
  statusNeutralText: { color: colors.textSecondary },
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailLabel: { width: 66, color: colors.textSecondary, fontSize: fontSizes.sm, fontWeight: fontWeights.bold },
  detailValue: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: fontSizes.base, lineHeight: 18, fontWeight: fontWeights.semibold },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
  progressStep: { flex: 1, alignItems: 'center', gap: spacing.xs },
  progressDot: { width: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.inputBorderMuted, backgroundColor: colors.surface },
  progressDotDone: { borderColor: colors.success, backgroundColor: colors.success },
  progressDotActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  progressDotFailed: { borderColor: colors.error, backgroundColor: colors.dangerBackground },
  progressText: { color: colors.textSecondary, fontSize: 10, fontWeight: fontWeights.semibold },
  requestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm },
  rejectButton: { minHeight: sizes.minTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.xxl, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radii.md, backgroundColor: colors.dangerBackground },
  rejectButtonText: { color: colors.error, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  acceptButton: { minHeight: sizes.minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl, borderRadius: radii.md, backgroundColor: colors.primary },
  acceptButtonText: { color: colors.white, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  cancelRequestButton: { minHeight: sizes.minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radii.md, backgroundColor: colors.dangerBackground },
  cancelRequestText: { color: colors.error, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  requestError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.dangerBackground },
  requestErrorText: { flex: 1, color: colors.error, fontSize: fontSizes.base },
  retryText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  actionOverlay: { flex: 1, justifyContent: 'flex-end', padding: spacing.screen, backgroundColor: colors.overlay },
  actionCard: { width: '100%', maxWidth: 520, alignSelf: 'center', overflow: 'hidden', borderRadius: radii.compactCard, backgroundColor: colors.surface, ...shadows.modal },
  actionTitle: { padding: spacing.xxl, color: colors.textPrimary, fontSize: fontSizes.headerTitle, fontWeight: fontWeights.extraBold, borderBottomWidth: 1, borderBottomColor: colors.border },
  actionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  actionText: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.bold },
});

