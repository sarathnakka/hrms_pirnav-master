import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { MemberRow, ReportingDayChips, SummaryRow, TeamsState } from './TeamsComponents';
import {
  acceptShiftSwap, cancelShiftChange, createShiftChange, createShiftSwap,
  getActiveShifts, getMyTeam, getShiftChangeRequests, getShiftSwaps, rejectShiftSwap,
} from './teamsApi';
import { normalizeMyTeam, normalizeShifts } from './teamMappers';
import { normalizeShiftChanges, normalizeShiftSwaps, sameEmployeeId } from './teamRequestMappers';
import { addWeeks, formatWeekRange, sameDate, startOfWeek, toDateOnly } from './teamDateUtils';
import { ShiftChangeModal, ShiftSwapModal } from './ShiftRequestModals';
import { MemberActionsModal, TeamRequestsPanel } from './TeamRequestComponents';

const employeeIdOf = (user) => String(
  user?.employeeId ?? user?.employee_Id ?? user?.employeeCode ?? ''
).trim();

function errorMessage(error, fallback) {
  if (error?.status === 403) return 'You do not have permission to perform this action.';
  if (error?.status === 404) return 'The requested record is no longer available.';
  return error?.message || fallback;
}

export default function TeamDetailsScreen({ route }) {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scheduleAbortRef = useRef(null);
  const requestAbortRef = useRef(null);
  const generationRef = useRef(0);
  const employeeId = employeeIdOf(user);
  const initialTeam = route?.params?.initialTeam || null;
  const [selectedWeek, setSelectedWeek] = useState(() => startOfWeek(new Date()));
  const [reloadKey, setReloadKey] = useState(0);
  const [teamResult, setTeamResult] = useState({ token, team: initialTeam });
  const [loadedWeekKey, setLoadedWeekKey] = useState('');
  const [loading, setLoading] = useState(!initialTeam);
  const [weekLoading, setWeekLoading] = useState(Boolean(initialTeam));
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftsError, setShiftsError] = useState('');
  const [swapPayload, setSwapPayload] = useState([]);
  const [changePayload, setChangePayload] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState('');
  const [requestView, setRequestView] = useState('swap');
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [requestForm, setRequestForm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actingKey, setActingKey] = useState('');

  const selectedWeekKey = toDateOnly(selectedWeek);
  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const team = teamResult.token === token ? teamResult.team : null;
  const members = team?.members || [];
  const ownMember = members.find((member) => sameEmployeeId(member.employeeId, employeeId)) || null;
  const scheduleMatches = loadedWeekKey === selectedWeekKey;
  const selectedWeekPending = weekLoading || (!scheduleMatches && !scheduleError);
  const swaps = useMemo(() => normalizeShiftSwaps(swapPayload).filter((request) => (
    sameEmployeeId(request.fromEmployeeId, employeeId) || sameEmployeeId(request.toEmployeeId, employeeId)
  )), [employeeId, swapPayload]);
  const changes = useMemo(() => normalizeShiftChanges(changePayload, shifts).filter((request) => (
    !request.employeeId || sameEmployeeId(request.employeeId, employeeId)
  )), [changePayload, employeeId, shifts]);

  const loadSchedule = useCallback(async ({ refresh = false } = {}) => {
    scheduleAbortRef.current?.abort();
    const controller = new AbortController();
    const generation = ++generationRef.current;
    scheduleAbortRef.current = controller;
    if (refresh) setRefreshing(true); else setWeekLoading(true);
    setScheduleError('');
    try {
      const response = await getMyTeam(token, { date: selectedWeekKey, signal: controller.signal });
      if (!controller.signal.aborted && generationRef.current === generation) {
        setTeamResult({ token, team: normalizeMyTeam(response) });
        setLoadedWeekKey(selectedWeekKey);
      }
    } catch (error) {
      if (!controller.signal.aborted && generationRef.current === generation) {
        if (error?.status === 404 || error?.status === 204) {
          setTeamResult({ token, team: null });
          setLoadedWeekKey(selectedWeekKey);
        } else setScheduleError(errorMessage(error, 'Unable to load the selected week.'));
      }
    } finally {
      if (!controller.signal.aborted && generationRef.current === generation) {
        setLoading(false); setWeekLoading(false); setRefreshing(false);
      }
    }
  }, [selectedWeekKey, token]);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true); setShiftsError('');
    try { setShifts(normalizeShifts(await getActiveShifts(token))); }
    catch (error) { setShiftsError(errorMessage(error, 'Unable to load active shifts.')); }
    finally { setShiftsLoading(false); }
  }, [token]);

  const loadRequests = useCallback(async () => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setRequestsLoading(true); setRequestsError('');
    const results = await Promise.allSettled([
      getShiftSwaps(token, { employeeId, includePendingEmployee: true, signal: controller.signal }),
      getShiftChangeRequests(token, employeeId, { signal: controller.signal }),
    ]);
    if (controller.signal.aborted) return;
    const failures = [];
    if (results[0].status === 'fulfilled') setSwapPayload(results[0].value);
    else failures.push(errorMessage(results[0].reason, 'Unable to load shift swaps.'));
    if (results[1].status === 'fulfilled') setChangePayload(results[1].value);
    else failures.push(errorMessage(results[1].reason, 'Unable to load shift changes.'));
    setRequestsError([...new Set(failures)].join(' '));
    setRequestsLoading(false);
  }, [employeeId, token]);

  useEffect(() => {
    loadSchedule();
    return () => scheduleAbortRef.current?.abort();
  }, [loadSchedule, reloadKey]);
  useEffect(() => { loadShifts(); }, [loadShifts]);
  useEffect(() => {
    if (employeeId) loadRequests();
    else { setRequestsLoading(false); setRequestsError('Unable to identify the authenticated employee.'); }
    return () => requestAbortRef.current?.abort();
  }, [employeeId, loadRequests]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([loadSchedule({ refresh: true }), loadShifts(), employeeId ? loadRequests() : Promise.resolve()]);
  }, [employeeId, loadRequests, loadSchedule, loadShifts]);

  const submitSwap = useCallback(async (payload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await createShiftSwap(token, payload);
      setRequestForm('');
      await loadRequests();
      Alert.alert('Request submitted', response?.message || 'Your shift swap request was submitted.');
    } catch (error) { throw new Error(errorMessage(error, 'Unable to submit the shift swap request.')); }
    finally { setSubmitting(false); }
  }, [loadRequests, submitting, token]);

  const submitChange = useCallback(async (payload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await createShiftChange(token, payload);
      setRequestForm('');
      await loadRequests();
      Alert.alert('Request submitted', response?.message || 'Your shift change request was submitted.');
    } catch (error) { throw new Error(errorMessage(error, 'Unable to submit the shift change request.')); }
    finally { setSubmitting(false); }
  }, [loadRequests, submitting, token]);

  const actOnSwap = useCallback(async (request, action) => {
    if (actingKey) return;
    setActingKey(`swap-${request.id}`);
    try {
      if (action === 'accept') await acceptShiftSwap(token, request.id);
      else await rejectShiftSwap(token, request.id, 'Declined by recipient');
      await loadRequests();
      Alert.alert(action === 'accept' ? 'Swap accepted' : 'Swap rejected', action === 'accept' ? 'The request is now waiting for admin approval.' : 'The requester has been notified.');
    } catch (error) {
      Alert.alert('Unable to update request', errorMessage(error, 'Please try again.'));
      await loadRequests();
    } finally { setActingKey(''); }
  }, [actingKey, loadRequests, token]);

  const confirmSwapAction = useCallback((request, action) => {
    Alert.alert(action === 'accept' ? 'Accept shift swap?' : 'Reject shift swap?', action === 'accept' ? 'This sends the request to admin for final approval.' : 'This declines the request and notifies the requester.', [
      { text: 'Keep', style: 'cancel' },
      { text: action === 'accept' ? 'Accept' : 'Reject', style: action === 'reject' ? 'destructive' : 'default', onPress: () => actOnSwap(request, action) },
    ]);
  }, [actOnSwap]);

  const confirmCancelChange = useCallback((request) => {
    Alert.alert('Cancel shift change?', 'This pending request will be removed.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => {
        if (actingKey) return;
        setActingKey(`change-${request.id}`);
        try { await cancelShiftChange(token, request.id); await loadRequests(); }
        catch (error) { Alert.alert('Unable to cancel request', errorMessage(error, 'Please try again.')); await loadRequests(); }
        finally { setActingKey(''); }
      } },
    ]);
  }, [actingKey, loadRequests, token]);

  const renderHeader = () => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      {team ? <>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <Text style={styles.kickerText}>Team Summary</Text>
            <View style={styles.teamNumberBadge}><Text style={styles.teamNumberText}>{team.teamNumber}</Text></View>
          </View>
          <Text style={styles.teamName} accessibilityRole="header">{team.teamName}</Text>
          <Text style={styles.description}>Members, project alignment and reporting setup.</Text>
          <View style={styles.summaryList}>
            <SummaryRow label="Reporting Manager" value={team.reportingManager} icon="person-outline" />
            <SummaryRow label="Project Name" value={team.projectName} icon="git-network-outline" />
            <SummaryRow label="Engagement Type" value={team.engagementType} icon="briefcase-outline" />
          </View>
          <View style={styles.reportingBlock}><Text style={styles.reportingTitle}>Reporting Days</Text><ReportingDayChips days={team.reportingDays} /></View>
        </View>

        <TeamRequestsPanel
          view={requestView} onViewChange={setRequestView} swaps={swaps} changes={changes}
          employeeId={employeeId} loading={requestsLoading} error={requestsError} onRetry={loadRequests}
          actingKey={actingKey} onAccept={(request) => confirmSwapAction(request, 'accept')}
          onReject={(request) => confirmSwapAction(request, 'reject')} onCancelChange={confirmCancelChange}
        />

        <View style={styles.membersHeader}>
          <Text style={styles.membersTitle}>Members</Text>
          <View style={styles.membersCountBadge}><Text style={styles.membersCountText}>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</Text></View>
        </View>
        <View style={styles.weekCard}>
          <View style={styles.weekRow}>
            <TouchableOpacity style={styles.weekButton} onPress={() => { setScheduleError(''); setWeekLoading(true); setSelectedWeek((week) => addWeeks(week, -1)); }} accessibilityRole="button" accessibilityLabel="Previous week"><Ionicons name="chevron-back" size={20} color={colors.primary} /></TouchableOpacity>
            <View style={styles.weekLabelWrap}>
              <Text style={styles.weekLabel}>{formatWeekRange(selectedWeek)}</Text>
              {weekLoading ? <Text style={styles.weekLoading}>Loading selected week...</Text> : null}
            </View>
            <TouchableOpacity style={styles.weekButton} onPress={() => { setScheduleError(''); setWeekLoading(true); setSelectedWeek((week) => addWeeks(week, 1)); }} accessibilityRole="button" accessibilityLabel="Next week"><Ionicons name="chevron-forward" size={20} color={colors.primary} /></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.thisWeekButton, sameDate(selectedWeek, startOfWeek(new Date())) && styles.thisWeekButtonActive]} onPress={() => {
            const current = startOfWeek(new Date());
            setScheduleError('');
            if (sameDate(selectedWeek, current)) setReloadKey((key) => key + 1);
            else { setWeekLoading(true); setSelectedWeek(current); }
          }} accessibilityRole="button"><Text style={styles.thisWeekText}>This week</Text></TouchableOpacity>
        </View>
      </> : null}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return <View style={[styles.stateWrap, { width: contentWidth }]}><TeamsState title="Loading team details" message="Fetching the latest team schedule." loading /></View>;
    if (selectedWeekPending) return <View style={[styles.stateWrap, { width: contentWidth }]}><TeamsState title="Loading selected week" message="Fetching the selected week's team schedule." loading /></View>;
    if (scheduleError) return <View style={[styles.stateWrap, { width: contentWidth }]}><TeamsState title="Unable to load this week" message={scheduleError} actionLabel="Retry" onAction={() => setReloadKey((key) => key + 1)} /></View>;
    return <View style={[styles.stateWrap, { width: contentWidth }]}><TeamsState title={team ? 'No members available for this week' : 'No team assigned'} message={team ? 'No team members are available for the selected week.' : 'You are not currently assigned to a team.'} /></View>;
  };

  const renderMember = useCallback(({ item }) => (
    <View style={{ width: contentWidth }}><MemberRow member={item} weekStart={selectedWeek} isOwnMember={sameEmployeeId(item.employeeId, employeeId)} onOpenActions={() => setActionMenuVisible(true)} /></View>
  ), [contentWidth, employeeId, selectedWeek]);

  return <>
    <FlatList
      style={styles.list} data={!loading && !scheduleError && scheduleMatches ? members : []}
      keyExtractor={(item) => String(item.id)} renderItem={renderMember} ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty} contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + sizes.floatingTabHeight + spacing.screenVertical }]}
      ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.primary} colors={[colors.primary]} />}
      showsVerticalScrollIndicator={false} accessibilityLabel={`Team details for ${team?.teamName || 'selected team'}`}
    />
    <MemberActionsModal visible={actionMenuVisible} onClose={() => setActionMenuVisible(false)} onShiftSwap={() => { setActionMenuVisible(false); setRequestForm('swap'); }} onShiftChange={() => { setActionMenuVisible(false); setRequestForm('change'); }} />
    {requestForm === 'swap' ? <ShiftSwapModal visible member={ownMember} members={members} shifts={shifts} loadingShifts={shiftsLoading} saving={submitting} onClose={() => setRequestForm('')} onSubmit={submitSwap} /> : null}
    {requestForm === 'change' ? <ShiftChangeModal visible member={ownMember} shifts={shifts} loadingShifts={shiftsLoading} saving={submitting} onClose={() => setRequestForm('')} onSubmit={submitChange} /> : null}
    {requestForm && shiftsError && !shiftsLoading ? <View style={styles.shiftErrorBanner} pointerEvents="none"><Text style={styles.shiftErrorText}>{shiftsError}</Text></View> : null}
  </>;
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.teams.background },
  listContent: { flexGrow: 1, alignItems: 'center', padding: spacing.screen, backgroundColor: colors.teams.background },
  headerContent: { maxWidth: 680, gap: spacing.sectionGap },
  summaryCard: { gap: spacing.md, padding: spacing.xxl, borderRadius: radii.compactCard, backgroundColor: colors.teams.surface, borderWidth: 1, borderColor: colors.teams.border, ...shadows.subtle },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  teamNumberBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.teams.countBadgeBackground },
  teamNumberText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  kickerText: { color: colors.primary, fontSize: fontSizes.sm, fontWeight: fontWeights.extraBold, textTransform: 'uppercase' },
  teamName: { color: colors.textPrimary, fontSize: fontSizes.title, fontWeight: fontWeights.extraBold, lineHeight: lineHeights.title },
  description: { color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: lineHeights.body, fontWeight: fontWeights.medium },
  summaryList: { marginTop: spacing.sm },
  reportingBlock: { gap: spacing.md },
  reportingTitle: { color: colors.textSecondary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  membersTitle: { color: colors.textPrimary, fontSize: fontSizes.dashboardSectionTitle, fontWeight: fontWeights.extraBold },
  membersCountBadge: { borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.teams.membersCountBackground },
  membersCountText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  weekCard: { gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.teams.border, borderRadius: radii.lg, backgroundColor: colors.teams.surface },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weekButton: { width: sizes.minTouchTarget, height: sizes.minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.teams.actionBackground },
  weekLabelWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  weekLabel: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.extraBold, textAlign: 'center' },
  weekLoading: { marginTop: spacing.xs, color: colors.primary, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  thisWeekButton: { alignSelf: 'center', minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.xxl, borderRadius: radii.pill, backgroundColor: colors.teams.actionBackground },
  thisWeekButtonActive: { borderWidth: 1, borderColor: colors.teams.dayActiveBorder },
  thisWeekText: { color: colors.primary, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
  memberSeparator: { height: spacing.md },
  stateWrap: { maxWidth: 680, marginTop: spacing.sectionGap },
  shiftErrorBanner: { position: 'absolute', left: spacing.screen, right: spacing.screen, bottom: spacing.screenVertical, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.dangerBackground },
  shiftErrorText: { color: colors.error, fontSize: fontSizes.base, textAlign: 'center' },
});
