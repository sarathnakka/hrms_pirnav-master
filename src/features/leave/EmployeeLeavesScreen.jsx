import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Keyboard,
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
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppTextInput from '../../shared/components/AppTextInput';
import { buildApiUrl } from '../../services/apiClient';
import { notifySessionExpired } from '../auth/sessionManager';
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
const LEAVE_PAGE_SIZE = 5;

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

function getLeaveAttachment(item) {
  if (!item || typeof item !== 'object') return null;
  const path = typeof item.attachmentPath === 'string' ? item.attachmentPath.trim() : '';
  const fileName = typeof item.attachmentFileName === 'string' ? item.attachmentFileName.trim() : '';
  if (!path && !fileName) return null;
  return { path, name: fileName || path.split(/[\\/]/).pop() || 'Attachment' };
}

function getAttachmentMime(name) {
  const extension = String(name || '').split('.').pop().toLowerCase();
  return {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }[extension] || 'application/octet-stream';
}

function resolveLeaveAttachmentUrl(path) {
  const value = String(path || '').trim().replace(/\\/g, '/');
  if (!value || /^(file:|data:|blob:)/i.test(value) || /^[a-z]:\//i.test(value)) return '';
  try {
    const server = new URL(buildApiUrl('/'));
    const url = new URL(/^https?:\/\//i.test(value) ? value : `/${value.replace(/^\/+/, '')}`, server);
    return url.origin === server.origin && /^https?:$/.test(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
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

function safeLeaveErrorMessage(error, fallback) {
  const message = typeof error?.data?.message === 'string' ? error.data.message.trim() : String(error?.message || '').trim();
  if (!message || message.length > 180 || /[\r\n<>]|System\.|Exception|Authorization|Bearer|Microsoft\.|stack trace|C:\\/i.test(message)) {
    return fallback;
  }
  return message;
}

function isAmbiguousSubmissionError(error) {
  return error?.status >= 500 || error?.isOutcomeUnknown ||
    error?.code === 'REQUEST_TIMEOUT' || error?.code === 'NETWORK_ERROR' ||
    /SmtpException|Client host rejected/i.test(String(error?.message || ''));
}

function isRecentSubmissionMatch(record, payload, startedAt, knownIds, isWfh) {
  const appliedAt = new Date(record?.appliedDate || record?.createdAt || record?.createdOn || record?.requestedOn || '').getTime();
  if (!Number.isFinite(appliedAt) || appliedAt < startedAt - 10 * 60 * 1000 || appliedAt > Date.now() + 2 * 60 * 1000) return false;
  const id = getLeaveRecordId(record);
  if (id !== null && knownIds.has(String(id))) return false;
  const typeMatches = isWfh
    ? record?.requestType === 'WFH'
    : formatLeaveType(record?.leaveType).toLowerCase() === formatLeaveType(payload.leaveType).toLowerCase();
  const fromDate = parseLocalDate(record?.fromDate);
  const toDate = parseLocalDate(record?.toDate);
  return typeMatches && Boolean(fromDate && toDate) &&
    formatDateForApi(fromDate) === payload.fromDate &&
    formatDateForApi(toDate) === payload.toDate &&
    compactText(record?.reason).replace(/\s+/g, ' ').toLowerCase() === payload.reason.replace(/\s+/g, ' ').toLowerCase();
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
  const listRef = useRef(null);
  const historyOffsetRef = useRef(0);
  const submitLockRef = useRef(false);
  const fileActionLockRef = useRef(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [attachment, setAttachment] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [previewImageUri, setPreviewImageUri] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [leaveData, setLeaveData] = useState([]);
  const [wfhData, setWfhData] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState({
    initial: true,
    leaves: true,
    wfh: true,
    refreshing: false,
    submitting: false,
    actionId: null,
  });
  const [errors, setErrors] = useState({ leaves: '', wfh: '' });
  const [pickerField, setPickerField] = useState(null);
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
          setErrorPatch({ leaves: safeLeaveErrorMessage(leavesResult.reason, 'Unable to load leave requests.') });
        }
      }

      if (shouldLoadWfh) {
        if (wfhResult.status === 'fulfilled') {
          setWfhData(wfhResult.value);
        } else {
          setErrorPatch({ wfh: safeLeaveErrorMessage(wfhResult.reason, 'Unable to load Work From Home requests.') });
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
  const totalPages = Math.max(1, Math.ceil(combinedHistory.length / LEAVE_PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedHistory = useMemo(
    () => combinedHistory.slice((visiblePage - 1) * LEAVE_PAGE_SIZE, visiblePage * LEAVE_PAGE_SIZE),
    [combinedHistory, visiblePage]
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const changePage = (direction) => {
    setCurrentPage((page) => Math.max(1, Math.min(totalPages, page + direction)));
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ y: historyOffsetRef.current, animated: true });
    });
  };

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
    setPreviewImageUri('');
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

  const pickAttachment = async () => {
    if (fileActionLockRef.current || submitLockRef.current) return;
    fileActionLockRef.current = true;
    setFileBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.uri || !file?.name) throw new Error('The selected file could not be prepared. Please choose another file.');
      const info = await FileSystem.getInfoAsync(file.uri);
      if (!info.exists || !info.size) throw new Error('The selected file is empty or unavailable. Please choose another file.');
      setAttachment({ uri: file.uri, name: file.name, mimeType: file.mimeType || getAttachmentMime(file.name) });
    } catch (error) {
      Alert.alert('Unable to Add Attachment', error?.message || 'Please choose another file.');
    } finally {
      fileActionLockRef.current = false;
      if (mountedRef.current) setFileBusy(false);
    }
  };

  const captureAttachment = async () => {
    if (fileActionLockRef.current || submitLockRef.current) return;
    fileActionLockRef.current = true;
    setFileBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Permission Required', 'Please allow camera access to capture an attachment. You can still upload from your device or submit without a file.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9, exif: false });
      if (result.canceled) return;
      const photo = result.assets?.[0];
      if (!photo?.uri) throw new Error('The photo could not be prepared. Please try again.');
      const info = await FileSystem.getInfoAsync(photo.uri);
      if (!info.exists || !info.size) throw new Error('The photo is empty or unavailable. Please retake it.');
      const mimeType = photo.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      setCapturedPhoto({
        uri: photo.uri,
        name: `leave-proof-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
        mimeType,
      });
    } catch (error) {
      Alert.alert('Camera unavailable', error?.message || 'Please try again or upload a file from your device.');
    } finally {
      fileActionLockRef.current = false;
      if (mountedRef.current) setFileBusy(false);
    }
  };

  const viewLeaveAttachment = async (file) => {
    if (fileActionLockRef.current) return;
    if (!file?.path) {
      Alert.alert('Attachment unavailable', 'This attachment is not available to view.');
      return;
    }
    const url = resolveLeaveAttachmentUrl(file?.path);
    if (!url) {
      Alert.alert('Unable to open attachment', 'This attachment path is not available for viewing.');
      return;
    }
    fileActionLockRef.current = true;
    setFileBusy(true);
    const name = String(file.name || 'leave-attachment').replace(/[^A-Za-z0-9._ -]/g, '_');
    const uri = `${FileSystem.cacheDirectory}leave-${Date.now()}-${name}`;
    try {
      const response = await FileSystem.downloadAsync(url, uri, {
        headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
      });
      if (response.status === 401) {
        notifySessionExpired('unauthorized');
        throw new Error('Your session has expired. Please sign in again.');
      }
      const type = String(response.headers?.['Content-Type'] || response.headers?.['content-type'] || '').toLowerCase();
      const info = await FileSystem.getInfoAsync(uri);
      if (response.status < 200 || response.status >= 300 || !info.exists || !info.size || /text\/html|application\/json/.test(type)) {
        throw new Error('The attachment could not be downloaded. Please try again later.');
      }
      const mimeType = getAttachmentMime(name);
      if (mimeType.startsWith('image/')) {
        setPreviewImageUri(uri);
      } else if (Platform.OS === 'android') {
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: mimeType });
        } catch {
          await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Open attachment' });
        }
      } else {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Open attachment' });
      }
    } catch (error) {
      Alert.alert('Unable to open attachment', error?.message || 'Please try again.');
    } finally {
      fileActionLockRef.current = false;
      if (mountedRef.current) setFileBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    const validationMessage = validateForm();
    if (validationMessage) {
      Alert.alert('Check leave details', validationMessage);
      return;
    }

    const isWfh = form.leaveType === 'Work From Home';
    if (isWfh && attachment) {
      Alert.alert('WFH attachment unavailable', 'The Work From Home file-upload contract is not confirmed. Remove the attachment to submit this request.');
      return;
    }

    const payload = {
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      reason: form.reason.trim(),
      attachment,
    };
    const startedAt = Date.now();
    const knownIds = new Set((isWfh ? wfhData : leaveData)
      .map((item) => getLeaveRecordId(item))
      .filter((id) => id !== null)
      .map(String));

    submitLockRef.current = true;
    setLoadingPatch({ submitting: true });
    try {
      if (isWfh) {
        await applyWorkFromHome(payload, token);
      } else {
        await applyEmployeeLeave(payload, token);
      }
      setForm(EMPTY_FORM);
      setAttachment(null);
      setCapturedPhoto(null);
      await loadRequests({ refresh: true, scope: isWfh ? 'wfh' : 'leaves' });
      setCurrentPage(1);
      Alert.alert('Success', 'Leave application submitted successfully.');
    } catch (requestError) {
      if (isAmbiguousSubmissionError(requestError)) {
        try {
          const latestRequests = await (isWfh ? fetchWfh() : fetchLeaves());
          const confirmed = latestRequests.some((item) =>
            isRecentSubmissionMatch(item, payload, startedAt, knownIds, isWfh)
          );
          if (confirmed) {
            controllerRef.current?.abort();
            setLoadingPatch({ initial: false, refreshing: false, leaves: false, wfh: false });
            if (isWfh) {
              setWfhData(latestRequests);
              setErrorPatch({ wfh: '' });
            } else {
              setLeaveData(latestRequests);
              setErrorPatch({ leaves: '' });
            }
            setForm(EMPTY_FORM);
            setAttachment(null);
            setCapturedPhoto(null);
            setCurrentPage(1);
            Alert.alert('Success', 'Leave application submitted successfully.');
            return;
          }
        } catch {
          Alert.alert('Submission not confirmed', 'Your leave request may have been submitted, but we couldn’t confirm it due to a temporary server delay. Please refresh My Leave Requests and check once. If the request is not listed, please try submitting again.');
          return;
        }
        Alert.alert('Unable to submit leave', 'Your leave request may have been submitted, but we couldn’t confirm it due to a temporary server delay. Please refresh My Leave Requests and check once. If the request is not listed, please try submitting again.');
      } else {
        Alert.alert('Unable to submit leave', safeLeaveErrorMessage(requestError, 'Please check the request and try again.'));
      }
    } finally {
      submitLockRef.current = false;
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
              Alert.alert('Unable to update', safeLeaveErrorMessage(requestError, 'Please try again.'));
            } finally {
              setLoadingPatch({ actionId: null });
            }
          },
        },
      ]
    );
  };

  const showDatePicker = (field) => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseLocalDate(form[field]) || new Date(),
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event?.type === 'set' && selectedDate) {
            updateForm(field, formatDateForApi(selectedDate));
          }
        },
      });
      return;
    }
    setPickerField(field);
  };

  const handleIosDateChange = (event, selectedDate) => {
    if (event?.type === 'dismissed') return;
    if (selectedDate && pickerField) {
      updateForm(pickerField, formatDateForApi(selectedDate));
    }
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

      <Text style={styles.fieldLabel}>Attachments (Optional)</Text>
      <View style={styles.attachmentActions}>
        <TouchableOpacity style={styles.attachmentAction} onPress={pickAttachment} disabled={loading.submitting || fileBusy} accessibilityRole="button" accessibilityLabel="Upload attachment from device">
          <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
          <Text style={styles.attachmentActionText}>Upload from Device</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachmentAction} onPress={captureAttachment} disabled={loading.submitting || fileBusy} accessibilityRole="button" accessibilityLabel="Capture attachment photo">
          <Ionicons name="camera-outline" size={18} color={colors.primary} />
          <Text style={styles.attachmentActionText}>Capture Photo</Text>
        </TouchableOpacity>
      </View>
      {attachment ? (
        <View style={styles.attachmentRow}>
          <Ionicons name="attach-outline" size={18} color={colors.primary} />
          <Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text>
          <TouchableOpacity style={styles.attachmentIconButton} onPress={() => setAttachment(null)} disabled={loading.submitting} accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`}>
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.attachmentHint}>No attachment selected.</Text>
      )}
      {form.leaveType === 'Work From Home' && (
        <Text style={styles.attachmentHint}>WFH file upload is not confirmed for the current endpoint. Remove a selected file before submitting.</Text>
      )}

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
    if (!request) return null;
    const statusMeta = getStatusMeta(request?.status);
    const isWfh = request?.requestType === 'WFH';
    const normalizedStatus = String(request?.status || '').toLowerCase();
    const reason = compactText(request?.reason) || 'No reason provided.';
    const requestAttachment = getLeaveAttachment(request);

    return (
      <Modal
        visible={Boolean(request)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => previewImageUri ? setPreviewImageUri('') : closeRequestDetails()}
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
              <View style={styles.detailsAttachmentBlock}>
                <Text style={styles.detailLabel}>Attachments</Text>
                {requestAttachment ? (
                  <View style={styles.attachmentRow}>
                    <Ionicons name="attach-outline" size={18} color={colors.primary} />
                    <Text style={styles.attachmentName} numberOfLines={2}>{requestAttachment.name}</Text>
                    {!!requestAttachment.path && (
                      <TouchableOpacity style={styles.attachmentIconButton} onPress={() => viewLeaveAttachment(requestAttachment)} disabled={fileBusy} accessibilityRole="button" accessibilityLabel={`View ${requestAttachment.name}`}>
                        {fileBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="eye-outline" size={20} color={colors.primary} />}
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <Text style={styles.attachmentHint}>No attachments uploaded.</Text>
                )}
              </View>
            </ScrollView>
          </View>
          {!!previewImageUri && (
            <View style={styles.inlineImageOverlay}>
              <View style={[styles.photoPreviewCard, { width: requestDetailsModalWidth }]}>
                <TouchableOpacity style={[styles.detailsCloseButton, styles.previewClose]} onPress={() => setPreviewImageUri('')} accessibilityRole="button" accessibilityLabel="Close attachment preview">
                  <Ionicons name="close" size={21} color={colors.textPrimary} />
                </TouchableOpacity>
                <Image source={{ uri: previewImageUri }} style={styles.photoPreviewImage} resizeMode="contain" />
              </View>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const renderRequest = (item) => {
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
      <View
        style={styles.historyHeader}
        onLayout={(event) => { historyOffsetRef.current = event.nativeEvent.layout.y + spacing.screen; }}
      >
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

  const pagination = !loading.initial && combinedHistory.length > 0 ? (
    <View style={styles.paginationCard}>
      <TouchableOpacity
        style={[styles.pageButton, visiblePage === 1 && styles.pageButtonDisabled]}
        onPress={() => changePage(-1)}
        disabled={visiblePage === 1}
        accessibilityRole="button"
        accessibilityLabel="Previous leave requests page"
        accessibilityState={{ disabled: visiblePage === 1 }}
      >
        <Ionicons name="chevron-back" size={16} color={visiblePage === 1 ? colors.placeholder : colors.primary} />
        <Text style={[styles.pageButtonText, visiblePage === 1 && styles.pageButtonTextDisabled]}>Prev</Text>
      </TouchableOpacity>
      <Text style={styles.pageIndicator}>{visiblePage} / {totalPages}</Text>
      <TouchableOpacity
        style={[styles.pageButton, visiblePage === totalPages && styles.pageButtonDisabled]}
        onPress={() => changePage(1)}
        disabled={visiblePage === totalPages}
        accessibilityRole="button"
        accessibilityLabel="Next leave requests page"
        accessibilityState={{ disabled: visiblePage === totalPages }}
      >
        <Text style={[styles.pageButtonText, visiblePage === totalPages && styles.pageButtonTextDisabled]}>Next</Text>
        <Ionicons name="chevron-forward" size={16} color={visiblePage === totalPages ? colors.placeholder : colors.primary} />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView
        ref={listRef}
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
      >
        {header}
        {!loading.initial && paginatedHistory.map((item) => (
          <React.Fragment key={`${item.requestType}-${item.id ?? item.sortDate ?? item.fromDate}`}>
            {renderRequest(item)}
          </React.Fragment>
        ))}
        {!loading.initial && !errors.leaves && !errors.wfh && combinedHistory.length === 0 &&
          renderState('No leave requests', 'Your leave and Work From Home requests will appear here.', null)}
        {pagination}
      </ScrollView>

      {Platform.OS === 'ios' && (
        <Modal
          visible={Boolean(pickerField)}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerField(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerWrap}>
              {pickerField && (
                <DateTimePicker
                  value={parseLocalDate(form[pickerField]) || new Date()}
                  mode="date"
                  display="spinner"
                  onChange={handleIosDateChange}
                />
              )}
              <TouchableOpacity
                style={styles.dateDoneButton}
                onPress={() => setPickerField(null)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Done selecting date"
              >
                <Text style={styles.dateDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {renderRequestDetailsModal()}

      <Modal visible={Boolean(capturedPhoto)} transparent animationType="fade" onRequestClose={() => setCapturedPhoto(null)}>
        <View style={styles.photoPreviewOverlay}>
          <View style={[styles.photoPreviewCard, { width: requestDetailsModalWidth }]}>
            <Text style={styles.detailsTitle}>Review Photo</Text>
            {!!capturedPhoto && <Image source={{ uri: capturedPhoto.uri }} style={styles.photoPreviewImage} resizeMode="contain" />}
            <View style={styles.attachmentActions}>
              <TouchableOpacity style={styles.attachmentAction} onPress={() => { setCapturedPhoto(null); setTimeout(captureAttachment, 300); }} accessibilityRole="button" accessibilityLabel="Retake photo">
                <Ionicons name="camera-reverse-outline" size={18} color={colors.primary} />
                <Text style={styles.attachmentActionText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachmentAction} onPress={() => { setAttachment(capturedPhoto); setCapturedPhoto(null); }} accessibilityRole="button" accessibilityLabel="Use photo">
                <Ionicons name="checkmark" size={18} color={colors.primary} />
                <Text style={styles.attachmentActionText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
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
  attachmentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attachmentAction: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.leave.fieldBorder,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.leave.fieldBackground,
  },
  attachmentActionText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  attachmentHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    marginTop: spacing.sm,
  },
  attachmentRow: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attachmentName: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
  },
  attachmentIconButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
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
  paginationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadows.subtle,
  },
  pageButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    paddingHorizontal: spacing.lg,
  },
  pageButtonDisabled: {
    backgroundColor: colors.mutedBackground,
  },
  pageButtonText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  pageButtonTextDisabled: {
    color: colors.placeholder,
  },
  pageIndicator: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
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
  detailsAttachmentBlock: {
    paddingTop: spacing.sm,
  },
  photoPreviewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay || 'rgba(0, 0, 0, 0.65)',
    padding: spacing.screen,
  },
  inlineImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.screen,
  },
  photoPreviewCard: {
    maxHeight: '85%',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  photoPreviewImage: {
    width: '100%',
    height: 320,
    maxHeight: '70%',
    marginTop: spacing.md,
  },
  previewClose: {
    alignSelf: 'flex-end',
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
