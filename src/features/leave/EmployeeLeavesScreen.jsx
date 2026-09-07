import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppTextInput from '../../shared/components/AppTextInput';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import {
  applyEmployeeLeave,
  applyWorkFromHome,
  cancelWorkFromHome,
  deleteEmployeeLeave,
  getEmployeeLeaves,
  getMyWorkFromHomeRequests,
} from './leaveApi';

const LEAVE_TYPES = [
  { label: 'Casual Leave', value: 'Casual' },
  { label: 'Sick Leave', value: 'Sick' },
  { label: 'Earned Leave', value: 'Earned' },
  { label: 'Work From Home', value: 'Work From Home' },
];

const EMPTY_FORM = {
  leaveType: 'Casual',
  fromDate: '',
  toDate: '',
  reason: '',
};

function extractCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.leaves)) return payload.leaves;
  if (Array.isArray(payload?.requests)) return payload.requests;

  const firstArray = Object.values(payload || {}).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray : [];
}

function getLeaveRecordId(leave) {
  const value =
    leave?.id ??
    leave?.leaveId ??
    leave?.leave_Id ??
    leave?.leaveID ??
    leave?.leaveRequestId ??
    leave?.leave_Request_Id ??
    null;

  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  return value;
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [datePart] = String(value).split('T');
  const parts = datePart.split('-').map((part) => Number(part));
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateForApi(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(value) {
  const date = parseLocalDate(value);
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isWeekendOnlyRange(fromDate, toDate) {
  const start = parseLocalDate(fromDate);
  const end = parseLocalDate(toDate);
  if (!start || !end) return false;

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay();
    if (weekday !== 0 && weekday !== 6) return false;
  }

  return true;
}

function formatLeaveType(type) {
  if (type === 'Sick') return 'Sick Leave';
  if (type === 'Casual') return 'Casual Leave';
  if (type === 'Earned') return 'Earned Leave';
  return type || 'Leave';
}

function compactText(value) {
  if (value && typeof value === 'object') {
    return compactText(value.name || value.employeeName || value.fullName || value.userName || '');
  }
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

function getApproverName(item = {}) {
  const directName = compactText(
    item?.approvedByName ||
      item?.approvedByEmployeeName ||
      item?.approvedByUserName ||
      item?.approverName ||
      item?.managerName ||
      item?.approvedBy ||
      ''
  );
  if (directName) return directName;

  const statusMatch = /^approved\s+by\s+(.+)$/i.exec(compactText(item?.status || item?.leaveStatus || item?.requestStatus));
  return statusMatch?.[1]?.trim() || '';
}

function getRejectedByName(item = {}) {
  return compactText(item?.rejectedByName || item?.rejectedByEmployeeName || item?.rejectedByUserName || item?.rejectedBy || '');
}

function getRejectionReason(item = {}) {
  return compactText(item?.rejectionReason || item?.rejectReason || item?.remarks || item?.adminRemarks || item?.managerRemarks || '');
}

function getCancellationDetail(item = {}) {
  return compactText(item?.cancelReason || item?.cancellationReason || item?.cancelledReason || item?.cancelledOn || item?.cancelledAt || '');
}

function normalizeLeaveRecord(item, requestType) {
  const id = getLeaveRecordId(item);
  const fromDate = item?.fromDate || item?.from || item?.startDate || item?.leaveFrom || '';
  const toDate = item?.toDate || item?.to || item?.endDate || item?.leaveTo || '';
  const status = item?.status || item?.leaveStatus || item?.requestStatus || 'Pending';

  return {
    ...item,
    id,
    requestType,
    leaveType: item?.leaveType || item?.type || (requestType === 'WFH' ? 'Work From Home' : 'Leave'),
    fromDate,
    toDate,
    reason: item?.reason || item?.leaveReason || item?.description || '',
    status,
    approvedBy: getApproverName(item),
    rejectedBy: getRejectedByName(item),
    rejectionReason: getRejectionReason(item),
    cancellationDetail: getCancellationDetail(item),
    sortDate: item?.createdAt || item?.createdOn || item?.appliedDate || item?.requestedOn || fromDate || toDate || '',
  };
}

function sortByRecency(left, right) {
  const leftDate = parseLocalDate(left.sortDate)?.getTime() || 0;
  const rightDate = parseLocalDate(right.sortDate)?.getTime() || 0;
  return rightDate - leftDate;
}

function getStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('approved')) {
    return { backgroundColor: colors.leave.statusApprovedBackground, color: colors.leave.statusApprovedText };
  }
  if (normalized.includes('reject')) {
    return { backgroundColor: colors.leave.statusRejectedBackground, color: colors.leave.statusRejectedText };
  }
  if (normalized.includes('cancel')) {
    return { backgroundColor: colors.leave.statusCancelledBackground, color: colors.leave.statusCancelledText };
  }
  if (normalized.includes('pending')) {
    return { backgroundColor: colors.leave.statusPendingBackground, color: colors.leave.statusPendingText };
  }
  return { backgroundColor: colors.leave.statusDefaultBackground, color: colors.leave.statusDefaultText };
}

function getCompactLeaveStatus(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '--';
  }

  const normalized = raw.toLowerCase();

  if (normalized.includes('approved as wfh')) {
    return 'Approved as WFH';
  }

  if (normalized.includes('approved as leave')) {
    return 'Approved as Leave';
  }

  if (normalized.includes('rejected as wfh')) {
    return 'Rejected as WFH';
  }

  if (normalized.includes('rejected as leave')) {
    return 'Rejected as Leave';
  }

  if (normalized.startsWith('approved')) {
    return 'Approved';
  }

  if (normalized.startsWith('rejected')) {
    return 'Rejected';
  }

  if (normalized.includes('cancel')) {
    return 'Cancelled';
  }

  if (normalized.includes('pending')) {
    return 'Pending';
  }

  const withoutApprover = raw.replace(/\s+by\s+.+$/i, '').trim();
  return withoutApprover || raw;
}

function RequestDetailRow({ label, value }) {
  const displayValue = compactText(value);
  if (!displayValue) return null;

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{displayValue}</Text>
    </View>
  );
}

export default function EmployeeLeavesScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);
  const detailsScrollRef = useRef(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [leaveData, setLeaveData] = useState([]);
  const [wfhData, setWfhData] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState({
    initial: true,
    leaves: true,
    wfh: true,
    refreshing: false,
    submitting: false,
    actionId: null,
  });
  const [errors, setErrors] = useState({ leaves: '', wfh: '' });
  const [picker, setPicker] = useState({ field: null, visible: false });
  const [typePickerVisible, setTypePickerVisible] = useState(false);

  const isNarrow = width < 350;
  const requestDetailsModalWidth = Math.min(width - spacing.screen * 2, 560);
  const selectedLeaveType = LEAVE_TYPES.find((item) => item.value === form.leaveType) || LEAVE_TYPES[0];

  const setLoadingPatch = useCallback((patch) => {
    setLoading((current) => ({ ...current, ...patch }));
  }, []);

  const setErrorPatch = useCallback((patch) => {
    setErrors((current) => ({ ...current, ...patch }));
  }, []);

  const fetchLeaves = useCallback(
    async (signal) => {
      const response = await getEmployeeLeaves(token, { signal });
      return extractCollection(response).map((item) => normalizeLeaveRecord(item, 'Leave'));
    },
    [token]
  );

  const fetchWfh = useCallback(
    async (signal) => {
      const response = await getMyWorkFromHomeRequests(token, { signal });
      return extractCollection(response).map((item) => normalizeLeaveRecord(item, 'WFH'));
    },
    [token]
  );

  const loadRequests = useCallback(
    async ({ refresh = false, scope = 'all' } = {}) => {
      if (!token) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const shouldLoadLeaves = scope === 'all' || scope === 'leaves';
      const shouldLoadWfh = scope === 'all' || scope === 'wfh';

      setLoadingPatch({
        initial: !refresh && scope === 'all',
        refreshing: refresh,
        leaves: shouldLoadLeaves,
        wfh: shouldLoadWfh,
      });
      setErrorPatch({
        ...(shouldLoadLeaves ? { leaves: '' } : {}),
        ...(shouldLoadWfh ? { wfh: '' } : {}),
      });

      const [leavesResult, wfhResult] = await Promise.allSettled([
        shouldLoadLeaves ? fetchLeaves(controller.signal) : Promise.resolve(null),
        shouldLoadWfh ? fetchWfh(controller.signal) : Promise.resolve(null),
      ]);

      if (!mountedRef.current || controller.signal.aborted) return;

      if (shouldLoadLeaves) {
        if (leavesResult.status === 'fulfilled') {
          setLeaveData(leavesResult.value);
        } else {
          setErrorPatch({ leaves: leavesResult.reason?.message || 'Unable to load leave requests.' });
        }
      }

      if (shouldLoadWfh) {
        if (wfhResult.status === 'fulfilled') {
          setWfhData(wfhResult.value);
        } else {
          setErrorPatch({ wfh: wfhResult.reason?.message || 'Unable to load Work From Home requests.' });
        }
      }

      setLoadingPatch({
        initial: false,
        refreshing: false,
        leaves: false,
        wfh: false,
      });
    },
    [fetchLeaves, fetchWfh, setErrorPatch, setLoadingPatch, token]
  );

  useEffect(() => {
    mountedRef.current = true;
    loadRequests();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [loadRequests]);

  const combinedHistory = useMemo(
    () => [...leaveData, ...wfhData].sort(sortByRecency),
    [leaveData, wfhData]
  );

  useEffect(() => {
    if (selectedRequest) {
      requestAnimationFrame(() => {
        detailsScrollRef.current?.scrollTo({ y: 0, animated: false });
      });
    }
  }, [selectedRequest]);

  const openRequestDetails = useCallback((request) => {
    setSelectedRequest(request);
  }, []);

  const closeRequestDetails = useCallback(() => {
    setSelectedRequest(null);
  }, []);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validateForm = () => {
    if (!form.leaveType) return 'Leave type is required.';
    if (!form.fromDate) return 'From date is required.';
    if (!form.toDate) return 'To date is required.';
    if (!form.reason.trim()) return 'Reason is required.';

    const fromDate = parseLocalDate(form.fromDate);
    const toDate = parseLocalDate(form.toDate);
    if (!fromDate || !toDate) return 'Please select valid dates.';
    if (fromDate > toDate) return 'From date cannot be after To date.';
    if (isWeekendOnlyRange(form.fromDate, form.toDate)) {
      return 'Leave cannot be applied for weekends only.';
    }

    return '';
  };

  const handleSubmit = async () => {
    const validationMessage = validateForm();
    if (validationMessage) {
      Alert.alert('Check leave details', validationMessage);
      return;
    }

    const payload = {
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      reason: form.reason.trim(),
    };

    setLoadingPatch({ submitting: true });
    try {
      if (form.leaveType === 'Work From Home') {
        await applyWorkFromHome(payload, token);
      } else {
        await applyEmployeeLeave(payload, token);
      }
      Alert.alert('Success', 'Leave application submitted successfully.');
      setForm(EMPTY_FORM);
      await loadRequests({ refresh: true });
    } catch (requestError) {
      Alert.alert('Unable to submit', requestError.message || 'Please try again.');
    } finally {
      setLoadingPatch({ submitting: false });
    }
  };

  const handleRequestAction = (item) => {
    if (item?.id === undefined || item?.id === null) {
      Alert.alert('Action unavailable', 'Unable to identify this leave request.');
      return;
    }

    const isWfh = item.requestType === 'WFH';
    Alert.alert(
      isWfh ? 'Cancel WFH request?' : 'Delete leave request?',
      isWfh ? 'This will cancel your pending Work From Home request.' : 'This will delete your pending leave request.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: isWfh ? 'Cancel WFH' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoadingPatch({ actionId: `${item.requestType}-${item.id}` });
            try {
              if (isWfh) {
                await cancelWorkFromHome(item.id, token);
                await loadRequests({ refresh: true, scope: 'wfh' });
              } else {
                await deleteEmployeeLeave(item.id, token);
                await loadRequests({ refresh: true, scope: 'leaves' });
              }
              Alert.alert('Updated', isWfh ? 'WFH request cancelled.' : 'Leave request deleted.');
            } catch (requestError) {
              Alert.alert('Unable to update', requestError.message || 'Please try again.');
            } finally {
              setLoadingPatch({ actionId: null });
            }
          },
        },
      ]
    );
  };

  const showDatePicker = (field) => {
    setPicker({ field, visible: true });
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setPicker({ field: null, visible: false });
    }

    if (event?.type === 'dismissed') return;
    if (selectedDate && picker.field) {
      updateForm(picker.field, formatDateForApi(selectedDate));
    }
  };

  const renderPicker = () => {
    if (!picker.visible || !picker.field) return null;
    const value = parseLocalDate(form[picker.field]) || new Date();

    return (
      <View style={styles.datePickerWrap}>
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={styles.dateDoneButton}
            onPress={() => setPicker({ field: null, visible: false })}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Done selecting date"
          >
            <Text style={styles.dateDoneText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderForm = () => (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Apply Leave</Text>

      <Text style={styles.fieldLabel}>Leave Type</Text>
      <TouchableOpacity
        style={styles.fieldButton}
        onPress={() => setTypePickerVisible(true)}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel="Select leave type"
      >
        <Text style={styles.fieldValue}>{selectedLeaveType.label}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.primary} />
      </TouchableOpacity>

      <View style={[styles.dateRow, isNarrow && styles.dateRowStack]}>
        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>From</Text>
          <TouchableOpacity
            style={styles.fieldButton}
            onPress={() => showDatePicker('fromDate')}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Select from date"
          >
            <Text style={[styles.fieldValue, !form.fromDate && styles.placeholderText]}>
              {formatDateForDisplay(form.fromDate)}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.dateField}>
          <Text style={styles.fieldLabel}>To</Text>
          <TouchableOpacity
            style={styles.fieldButton}
            onPress={() => showDatePicker('toDate')}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Select to date"
          >
            <Text style={[styles.fieldValue, !form.toDate && styles.placeholderText]}>
              {formatDateForDisplay(form.toDate)}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      {renderPicker()}

      <Text style={styles.fieldLabel}>Reason</Text>
      <AppTextInput
        style={styles.reasonInput}
        value={form.reason}
        onChangeText={(value) => updateForm('reason', value)}
        placeholder="Enter reason for leave..."
        placeholderTextColor={colors.placeholder}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Reason for leave"
      />

      <TouchableOpacity
        style={[styles.submitButton, loading.submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading.submitting}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="Submit leave application"
        accessibilityState={{ busy: loading.submitting, disabled: loading.submitting }}
      >
        {loading.submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitText}>Submit Application</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderState = (title, message, onRetry) => (
    <View style={styles.stateBox}>
      <Text style={styles.stateTitle}>{title}</Text>
      {!!message && <Text style={styles.stateText}>{message}</Text>}
      {!!onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={`Retry ${title}`}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderRequestDetailsModal = () => {
    const request = selectedRequest;
    const statusMeta = getStatusMeta(request?.status);
    const isWfh = request?.requestType === 'WFH';
    const normalizedStatus = String(request?.status || '').toLowerCase();
    const reason = compactText(request?.reason) || 'No reason provided.';

    return (
      <Modal
        visible={Boolean(request)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeRequestDetails}
      >
        <View style={styles.detailsOverlay}>
          <View style={[styles.detailsCard, { width: requestDetailsModalWidth }]}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsTitleWrap}>
                <Text style={styles.detailsTitle}>Request Details</Text>
                <Text style={styles.detailsSubtitle}>
                  {isWfh ? 'Work From Home request information' : 'Leave request information'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailsCloseButton}
                onPress={closeRequestDetails}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close request details"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={detailsScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.detailsBody}
            >
              <View style={styles.detailsBadgeRow}>
                <View style={styles.requestTypeBadge}>
                  <Ionicons
                    name={isWfh ? 'home-outline' : 'document-text-outline'}
                    size={15}
                    color={colors.primary}
                  />
                  <Text style={styles.requestTypeText}>{request?.requestType || '--'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.backgroundColor }]}>
                  <Text style={[styles.statusText, { color: statusMeta.color }]}>
                    {request?.status || 'Unknown'}
                  </Text>
                </View>
              </View>

              <RequestDetailRow label="Request Type" value={isWfh ? 'Work From Home' : 'Leave'} />
              <RequestDetailRow label={isWfh ? 'Type' : 'Leave Type'} value={formatLeaveType(request?.leaveType)} />
              <RequestDetailRow label="From" value={formatDateForDisplay(request?.fromDate)} />
              <RequestDetailRow label="To" value={formatDateForDisplay(request?.toDate)} />
              <RequestDetailRow label="Status" value={request?.status || 'Unknown'} />
              <RequestDetailRow label="Approved By" value={request?.approvedBy} />
              {normalizedStatus.includes('reject') && (
                <>
                  <RequestDetailRow label="Rejected By" value={request?.rejectedBy} />
                  <RequestDetailRow label="Rejection Reason" value={request?.rejectionReason} />
                </>
              )}
              {normalizedStatus.includes('cancel') && (
                <RequestDetailRow label="Cancellation Details" value={request?.cancellationDetail} />
              )}

              <View style={styles.reasonDetailBox}>
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailReason}>{reason}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderRequest = ({ item }) => {
    const statusMeta = getStatusMeta(item.status);
    const cardStatusLabel = getCompactLeaveStatus(item.status);
    const isPending = String(item.status || '').toLowerCase().includes('pending');
    const actionKey = `${item.requestType}-${item.id}`;
    const isActionLoading = loading.actionId === actionKey;

    return (
      <View style={styles.requestCard}>
        <TouchableOpacity
          style={styles.requestDetailsPressable}
          onPress={() => openRequestDetails(item)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${formatLeaveType(item.leaveType)} request`}
        >
          <View style={styles.requestTopRow}>
            <View style={styles.requestTypeBadge}>
              <Ionicons
                name={item.requestType === 'WFH' ? 'home-outline' : 'document-text-outline'}
                size={15}
                color={colors.primary}
              />
              <Text style={styles.requestTypeText}>{item.requestType}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.backgroundColor }]}>
              <Text
                style={[styles.statusText, { color: statusMeta.color }]}
                numberOfLines={1}
              >
                {cardStatusLabel}
              </Text>
            </View>
          </View>

          <Text style={styles.requestTitle}>{formatLeaveType(item.leaveType)}</Text>
          <View style={styles.requestDates}>
            <Text style={styles.requestDateText}>From {formatDateForDisplay(item.fromDate)}</Text>
            <Text style={styles.requestDateText}>To {formatDateForDisplay(item.toDate)}</Text>
          </View>
          <Text style={styles.reasonText} numberOfLines={3}>
            {item.reason || 'No reason provided'}
          </Text>
        </TouchableOpacity>

        {isPending && (
          <TouchableOpacity
            style={styles.destructiveButton}
            onPress={() => handleRequestAction(item)}
            disabled={isActionLoading}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={item.requestType === 'WFH' ? 'Cancel WFH request' : 'Delete leave request'}
            accessibilityState={{ busy: isActionLoading, disabled: isActionLoading }}
          >
            {isActionLoading ? (
              <ActivityIndicator size="small" color={colors.leave.destructiveText} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color={colors.leave.destructiveText} />
                <Text style={styles.destructiveText}>{item.requestType === 'WFH' ? 'Cancel' : 'Delete'}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const header = (
    <View>
      <Text style={styles.screenTitle}>Leave Management</Text>
      {renderForm()}
      <View style={styles.historyHeader}>
        <View>
          <Text style={styles.sectionTitle}>My Leave Requests</Text>
          <Text style={styles.sectionSubtitle}>Leave and Work From Home history</Text>
        </View>
        {(loading.leaves || loading.wfh) && !loading.initial && <ActivityIndicator color={colors.primary} />}
      </View>
      {!!errors.leaves && renderState('Leave requests failed', errors.leaves, () => loadRequests({ scope: 'leaves' }))}
      {!!errors.wfh && renderState('WFH requests failed', errors.wfh, () => loadRequests({ scope: 'wfh' }))}
      {loading.initial && renderState('Loading leave requests', 'Fetching your leave and WFH history.', null)}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <FlatList
        data={loading.initial ? [] : combinedHistory}
        keyExtractor={(item) => `${item.requestType}-${item.id || item.sortDate || item.fromDate}`}
        renderItem={renderRequest}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !loading.initial && !errors.leaves && !errors.wfh
            ? renderState('No leave requests', 'Your leave and Work From Home requests will appear here.', null)
            : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loading.refreshing}
            onRefresh={() => loadRequests({ refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 3 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      />

      {renderRequestDetailsModal()}

      <Modal
        visible={typePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTypePickerVisible(false)}
        >
          <View style={styles.typePickerCard}>
            {LEAVE_TYPES.map((item) => {
              const isSelected = item.value === form.leaveType;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.typeOption, isSelected && styles.typeOptionSelected]}
                  onPress={() => {
                    updateForm('leaveType', item.value);
                    setTypePickerVisible(false);
                  }}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${item.label}`}
                >
                  <Text style={[styles.typeOptionText, isSelected && styles.typeOptionTextSelected]}>
                    {item.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.leave.background,
  },
  content: {
    padding: spacing.screen,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.xxl,
  },
  formCard: {
    backgroundColor: colors.leave.formSurface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.leave.formBorder,
    padding: spacing.xxl,
    marginBottom: spacing.sectionGap,
    ...shadows.card,
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardSectionTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.xxl,
  },
  fieldLabel: {
    color: colors.textHeading,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  fieldButton: {
    minHeight: sizes.inputHeight,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.leave.fieldBorder,
    backgroundColor: colors.leave.fieldBackground,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldValue: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  placeholderText: {
    color: colors.placeholder,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  dateRowStack: {
    flexDirection: 'column',
    gap: 0,
  },
  dateField: {
    flex: 1,
    minWidth: 0,
  },
  datePickerWrap: {
    marginTop: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.leave.fieldBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dateDoneButton: {
    minHeight: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateDoneText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  reasonInput: {
    minHeight: 92,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.leave.fieldBorder,
    backgroundColor: colors.leave.fieldBackground,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    lineHeight: 20,
  },
  submitButton: {
    minHeight: sizes.buttonHeight,
    borderRadius: radii.xl,
    backgroundColor: colors.leave.submitButton,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
    ...shadows.primary,
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
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
  requestCard: {
    backgroundColor: colors.leave.requestSurface,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.leave.requestDivider,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    ...shadows.subtle,
  },
  requestDetailsPressable: {},
  requestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  requestTypeBadge: {
    minHeight: 30,
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  requestTypeText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  statusBadge: {
    minHeight: 28,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    maxWidth: '65%',
    flexShrink: 1,
  },
  statusText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    flexShrink: 1,
  },
  requestTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.md,
  },
  requestDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  requestDateText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  reasonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
  },
  destructiveButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.leave.destructiveBackground,
    borderWidth: 1,
    borderColor: colors.leave.destructiveBorder,
  },
  destructiveText: {
    color: colors.leave.destructiveText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stateBox: {
    minHeight: 112,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.leave.requestDivider,
    backgroundColor: colors.leave.emptySurface,
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
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
  detailsOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.screen,
  },
  detailsCard: {
    maxHeight: '85%',
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.modal,
  },
  detailsHeader: {
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
  detailsTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  detailsTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  detailsSubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  detailsCloseButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mutedBackground,
  },
  detailsBody: {
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  detailsBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  detailRow: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  reasonDetailBox: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.leave.requestDivider,
    backgroundColor: colors.leave.emptySurface,
    padding: spacing.lg,
  },
  detailReason: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    lineHeight: 21,
    fontWeight: fontWeights.medium,
  },
  typePickerCard: {
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.modal,
  },
  typeOption: {
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeOptionSelected: {
    backgroundColor: colors.tealTintSoft,
  },
  typeOptionText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  typeOptionTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
});
