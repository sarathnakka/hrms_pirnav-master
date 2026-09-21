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
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppTextInput from '../../shared/components/AppTextInput';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { useAuth } from '../auth/AuthContext';
import {
  deleteTicket,
  getTicketById,
  getTicketAttachment,
  getTicketEmployees,
  getMyTickets,
  startTicketWork,
  stopTicketWork,
  updateTicket,
  updateTicketStatus,
} from './ticketApi';
import {
  TICKET_PRIORITY_OPTIONS,
  buildTicketUpdatePayload,
  canDeleteTicket,
  canUpdateTicketStatus,
  formatTicketDate,
  formatTicketDateTime,
  getEmployeeStatusOptions,
  getTicketCategoryOptions,
  getTicketPriorityLabel,
  getTicketSearchText,
  getTicketStatusLabel,
  getTicketSortScore,
  isTicketAssigned,
  isTicketCompleted,
  isTicketWorkActive,
  normalizeEmployeeOptions,
  normalizeTicketCategory,
  normalizeTicketDetail,
  normalizeTicketPriority,
  normalizeTicketStatus,
  normalizeTickets,
} from './ticketMappers';

const TICKETS_PER_PAGE = 5;
const INITIAL_FILTERS = {
  status: 'All',
  priority: 'All',
  category: 'All',
};

function getTicketStatusStyle(status) {
  const normalized = normalizeTicketStatus(status);

  if (normalized === 'Completed' || normalized === 'Resolved') {
    return { backgroundColor: colors.successBackground, color: colors.success };
  }
  if (normalized === 'In Progress') {
    return { backgroundColor: colors.warningBackground, color: colors.warning };
  }
  if (normalized === 'On Hold' || normalized === 'Pending') {
    return { backgroundColor: colors.infoBackground, color: colors.info };
  }
  if (normalized === 'Closed' || normalized === 'Rejected') {
    return { backgroundColor: colors.dangerBackground, color: colors.error };
  }
  return { backgroundColor: colors.tealTintSoft, color: colors.primary };
}

function getPriorityStyle(priority) {
  const normalized = normalizeTicketPriority(priority);

  if (normalized === 'Critical') {
    return { backgroundColor: colors.dangerBackground, color: colors.error };
  }
  if (normalized === 'High') {
    return { backgroundColor: colors.warningBackground, color: colors.warning };
  }
  if (normalized === 'Low') {
    return { backgroundColor: colors.infoBackground, color: colors.info };
  }
  return { backgroundColor: colors.tealTintSoft, color: colors.primary };
}

function getErrorMessage(error, fallback) {
  if (error?.code === 'SESSION_EXPIRED') return error.message;
  if (error?.code === 'REQUEST_TIMEOUT') return 'Request timed out. Refresh tickets before trying again.';
  if (error?.code === 'NETWORK_ERROR') return 'Network connection was lost. Please check your internet connection.';
  return error?.message || fallback;
}

function getTicketLabel(ticket) {
  return ticket?.ticketId ? `Ticket #${ticket.ticketId}` : 'Ticket';
}

function hasMeaningfulValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '--';
}

function isActualStatusChange(currentStatus, nextStatus) {
  const current = normalizeTicketStatus(currentStatus);
  const next = normalizeTicketStatus(nextStatus);

  return Boolean(next) && current !== next;
}

function getInputDateValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
  }
  return parsed.toISOString().slice(0, 10);
}

function formatDateInput(value) {
  return value ? formatTicketDate(value) : 'Select due date';
}

function getAttachmentItems(ticket = {}) {
  return (ticket.attachments || []).map((attachment, index) => ({
    key: String(attachment?.id || attachment?.attachmentId || attachment?.AttachmentId || index),
    raw: attachment,
    label:
      attachment?.name ||
      attachment?.fileName ||
      attachment?.FileName ||
      attachment?.file_name ||
      `Attachment ${index + 1}`,
  }));
}

function getRemarkItems(ticket = {}) {
  return (ticket.remarks || []).map((remark, index) => ({
    key: String(remark?.id || remark?.remarkId || index),
    message: remark?.remark || '',
    transition: [remark?.oldStatus, remark?.newStatus].filter(Boolean).join(' -> '),
    date: remark?.createdAt || null,
  }));
}

function getTimelineItems(ticket = {}) {
  const latestRemarkDate = (ticket.remarks || [])
    .map((remark) => remark?.createdAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
  const updatedDate = ticket.raw?.updatedAt || ticket.updatedDate || latestRemarkDate;
  return [
    {
      key: 'created',
      label: 'Created',
      detail: 'Ticket created',
      date: ticket.createdDate,
    },
    {
      key: 'updated',
      label: 'Updated',
      detail: getTicketStatusLabel(ticket.status),
      date: updatedDate,
    },
    {
      key: 'current',
      label: getTicketStatusLabel(ticket.status),
      detail: 'Current ticket state',
      date: updatedDate || ticket.createdDate,
    },
  ].filter((item) => hasMeaningfulValue(item.date) || item.key === 'current');
}

function validateTicketForm(form) {
  const next = {};
  if (!String(form.assignedToEmployee || form.assignedToEmployeeId || '').trim()) {
    next.assignedToEmployee = 'Assign the ticket to an employee.';
  }

  return next;
}

function DetailRow({ label, value, icon }) {
  const displayValue = value === null || value === undefined || value === '' ? '--' : String(value);

  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{displayValue}</Text>
      </View>
    </View>
  );
}

function OptionChip({ label, selected, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.optionChip, selected && styles.optionChipActive, disabled && styles.disabledControl]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function MyTicketsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);
  const detailControllerRef = useRef(null);
  const editControllerRef = useRef(null);
  const employeeControllerRef = useRef(null);
  const mutationLockRef = useRef(false);
  const attachmentLockRef = useRef(false);
  const hasLoadedTicketsRef = useRef(false);
  const detailRequestIdRef = useRef(0);
  const editRequestIdRef = useRef(0);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasLoadedTickets, setHasLoadedTickets] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [detailTicket, setDetailTicket] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [viewingAttachmentKey, setViewingAttachmentKey] = useState('');
  const [actionTicket, setActionTicket] = useState(null);
  const [statusTicket, setStatusTicket] = useState(null);
  const [pendingStatus, setPendingStatus] = useState('');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [statusFiles, setStatusFiles] = useState([]);
  const [stopWorkTicket, setStopWorkTicket] = useState(null);
  const [stopWorkRemarks, setStopWorkRemarks] = useState('');
  const [editTicket, setEditTicket] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeePickerVisible, setEmployeePickerVisible] = useState(false);
  const [employeeSearchText, setEmployeeSearchText] = useState('');
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'Medium',
    assignedToEmployee: '',
    assignedToEmployeeId: '',
    dueDate: '',
    notes: '',
  });
  const [editErrors, setEditErrors] = useState({});
  const [mutationState, setMutationState] = useState({ type: '', id: '' });

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const modalWidth = Math.min(width - spacing.screen * 2, 560);
  const activeFilterCount = [
    filters.status !== 'All',
    filters.priority !== 'All',
    filters.category !== 'All',
  ].filter(Boolean).length;
  const hasBlockingError = Boolean(error && !loading && !hasLoadedTickets);

  const populateEditForm = useCallback((ticket) => {
    setEditForm({
      title: ticket?.title || '',
      description: ticket?.description || '',
      category: ticket?.category || 'General Queries',
      priority: ticket?.priority || 'Medium',
      assignedToEmployee: ticket?.assignedTo || ticket?.createdBy || '',
      assignedToEmployeeId: ticket?.assignedToId || ticket?.createdById || '',
      dueDate: getInputDateValue(ticket?.dueDate),
      notes: ticket?.notes || '',
    });
  }, []);

  const handleSearchChange = useCallback((value) => {
    setSearchText(value);
    setCurrentPage(1);
  }, []);

  const closeDetails = useCallback(() => {
    detailControllerRef.current?.abort();
    detailRequestIdRef.current += 1;
    setSelectedTicket(null);
    setDetailTicket(null);
    setDetailLoading(false);
    setDetailError('');
  }, []);

  const openDetails = useCallback((ticket) => {
    if (!ticket?.ticketId) return;
    setSelectedTicket(ticket);
    setDetailTicket(null);
    setDetailError('');
  }, []);

  const closeEdit = useCallback(() => {
    editControllerRef.current?.abort();
    editRequestIdRef.current += 1;
    setEditTicket(null);
    setEditLoading(false);
    setEditLoadError('');
    setEmployeePickerVisible(false);
    setEmployeeSearchText('');
  }, []);

  const loadTickets = useCallback(async ({ refresh = false, silent = false } = {}) => {
    if (!token) {
      setTickets([]);
      hasLoadedTicketsRef.current = false;
      setHasLoadedTickets(false);
      setLoading(false);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (refresh) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }
    setError('');

    try {
      const response = await getMyTickets(token, { signal: controller.signal });
      const normalized = normalizeTickets(response)
        .sort((left, right) => getTicketSortScore(right) - getTicketSortScore(left));

      if (!mountedRef.current || controller.signal.aborted) return;
      setTickets(normalized);
      hasLoadedTicketsRef.current = true;
      setHasLoadedTickets(true);
      setError('');
    } catch (requestError) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setError(getErrorMessage(requestError, 'Unable to load tickets.'));
      if (!hasLoadedTicketsRef.current) {
        setTickets([]);
      }
    } finally {
      if (!mountedRef.current || controller.signal.aborted) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    loadTickets();

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      detailControllerRef.current?.abort();
      editControllerRef.current?.abort();
      employeeControllerRef.current?.abort();
    };
  }, [loadTickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (!selectedTicket?.ticketId || !token) return undefined;

    detailControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    detailControllerRef.current = controller;

    setDetailLoading(true);
    setDetailError('');
    setDetailTicket(null);

    getTicketById(selectedTicket.ticketId, token, { signal: controller.signal })
      .then((response) => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          detailRequestIdRef.current !== requestId
        ) {
          return;
        }

        setDetailTicket(normalizeTicketDetail(response));
      })
      .catch((requestError) => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          detailRequestIdRef.current !== requestId
        ) {
          return;
        }

        setDetailError(getErrorMessage(requestError, 'Unable to load complete ticket details.'));
      })
      .finally(() => {
        if (
          mountedRef.current &&
          !controller.signal.aborted &&
          detailRequestIdRef.current === requestId
        ) {
          setDetailLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedTicket?.ticketId, detailReloadKey, token]);

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();
    employeeControllerRef.current = controller;
    setEmployeesLoading(true);

    getTicketEmployees(token, { signal: controller.signal })
      .then((response) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setEmployees(normalizeEmployeeOptions(response));
      })
      .catch(() => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setEmployees([]);
      })
      .finally(() => {
        if (mountedRef.current && !controller.signal.aborted) {
          setEmployeesLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  const categoryOptions = useMemo(() => {
    const fromTickets = tickets.map((ticket) => ticket.category).filter(Boolean);
    return ['All', ...Array.from(new Set([...getTicketCategoryOptions(), ...fromTickets, editForm.category].filter(Boolean)))];
  }, [editForm.category, tickets]);

  const statusOptions = useMemo(() => {
    const fromTickets = tickets.map((ticket) => normalizeTicketStatus(ticket.status)).filter(Boolean);
    return ['All', ...Array.from(new Set(['Open', 'Assigned', 'In Progress', 'On Hold', 'Completed', 'Pending', ...fromTickets]))];
  }, [tickets]);

  const priorityOptions = useMemo(() => ['All', ...TICKET_PRIORITY_OPTIONS], []);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearchText.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) =>
      String(employee.name || '').toLowerCase().includes(query) ||
      String(employee.id || '').toLowerCase().includes(query)
    );
  }, [employeeSearchText, employees]);

  const summaryCards = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((ticket) => ['Open', 'Assigned', 'Pending'].includes(normalizeTicketStatus(ticket.status))).length;
    const inProgress = tickets.filter((ticket) => normalizeTicketStatus(ticket.status) === 'In Progress').length;
    const completed = tickets.filter((ticket) => normalizeTicketStatus(ticket.status) === 'Completed').length;

    return [
      { label: 'Total', value: total, icon: 'ticket-outline', tone: colors.primary },
      { label: 'Open', value: open, icon: 'ellipse-outline', tone: colors.info },
      { label: 'In Progress', value: inProgress, icon: 'time-outline', tone: colors.warning },
      { label: 'Completed', value: completed, icon: 'checkmark-circle-outline', tone: colors.success },
    ];
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesSearch = !query || getTicketSearchText(ticket).includes(query);
      const matchesStatus = filters.status === 'All' || normalizeTicketStatus(ticket.status) === filters.status;
      const matchesPriority = filters.priority === 'All' || normalizeTicketPriority(ticket.priority) === filters.priority;
      const matchesCategory = filters.category === 'All' || normalizeTicketCategory(ticket.category) === filters.category;
      return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
    });
  }, [filters, searchText, tickets]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / TICKETS_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const pagedTickets = useMemo(() => {
    const start = (visiblePage - 1) * TICKETS_PER_PAGE;
    return filteredTickets.slice(start, start + TICKETS_PER_PAGE);
  }, [visiblePage, filteredTickets]);

  const refreshTicketsAfterMutation = useCallback(async () => {
    await loadTickets({ silent: true });
  }, [loadTickets]);

  const resetStatusForm = useCallback(() => {
    setPendingStatus('');
    setStatusRemarks('');
    setStatusFiles([]);
  }, []);

  const closeStatusModal = useCallback(() => {
    setStatusTicket(null);
    resetStatusForm();
  }, [resetStatusForm]);

  const addStatusAttachments = useCallback(async () => {
    if (mutationLockRef.current) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      setStatusFiles((current) => {
        const seen = new Set(current.map((file) => `${file.uri}|${file.name}`));
        const added = (result.assets || []).filter((file) => {
          const key = `${file.uri}|${file.name}`;
          if (!file.uri || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [...current, ...added];
      });
    } catch (pickerError) {
      Alert.alert('Unable to select attachments', pickerError?.message || 'Please try again.');
    }
  }, []);

  const viewTicketAttachment = useCallback(async (attachment) => {
    if (attachmentLockRef.current) return;
    attachmentLockRef.current = true;
    setViewingAttachmentKey(attachment.key);
    try {
      const file = await getTicketAttachment(attachment.raw, token);
      if (Platform.OS === 'android') {
        try {
          const contentUri = await FileSystem.getContentUriAsync(file.uri);
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri, flags: 1, type: file.mimeType,
          });
          return;
        } catch {
          // Share sheet lets the employee choose another installed viewer.
        }
      }
      await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: 'Open attachment' });
    } catch (viewError) {
      Alert.alert('Unable to open attachment', viewError?.message || 'Please try again.');
    } finally {
      attachmentLockRef.current = false;
      if (mountedRef.current) setViewingAttachmentKey('');
    }
  }, [token]);

  const resetStopWorkForm = useCallback(() => {
    setStopWorkRemarks('');
  }, []);

  const closeStopWorkModal = useCallback(() => {
    setStopWorkTicket(null);
    resetStopWorkForm();
  }, [resetStopWorkForm]);

  const closeActionMenus = useCallback(() => {
    setActionTicket(null);
    closeStatusModal();
    closeStopWorkModal();
  }, [closeStatusModal, closeStopWorkModal]);

  const runMutation = useCallback(async (ticket, type, action) => {
    if (!ticket?.ticketId || mutationLockRef.current) {
      return;
    }

    mutationLockRef.current = true;
    setMutationState({ type, id: ticket.ticketId });

    try {
      await action();
      await refreshTicketsAfterMutation();
      closeActionMenus();
    } catch (requestError) {
      Alert.alert('Unable to update ticket', getErrorMessage(requestError, 'Please try again.'));
      if (requestError?.code === 'REQUEST_TIMEOUT' || requestError?.code === 'NETWORK_ERROR' || Number(requestError?.status) >= 500) {
        await refreshTicketsAfterMutation();
      }
    } finally {
      mutationLockRef.current = false;
      if (mountedRef.current) {
        setMutationState({ type: '', id: '' });
      }
    }
  }, [closeActionMenus, refreshTicketsAfterMutation]);

  const handleStatusUpdate = useCallback((ticket, nextStatus) => {
    const normalizedStatus = normalizeTicketStatus(nextStatus);
    const currentStatus = normalizeTicketStatus(ticket?.status);
    if (normalizedStatus === currentStatus) {
      resetStatusForm();
      Alert.alert('Status unchanged', `${getTicketLabel(ticket)} is already ${normalizedStatus}.`);
      return;
    }

    setPendingStatus(normalizedStatus);
    setStatusRemarks('');
  }, [resetStatusForm]);

  const submitStatusUpdateWithRemarks = useCallback(() => {
    const ticket = statusTicket;
    if (!pendingStatus) return;

    const normalizedStatus = normalizeTicketStatus(pendingStatus);
    const currentStatus = normalizeTicketStatus(ticket?.status);
    const trimmedRemarks = statusRemarks.trim();
    const remarksRequired = isActualStatusChange(currentStatus, normalizedStatus);

    if (!ticket?.ticketId || !normalizedStatus) return;

    if (normalizedStatus === currentStatus) {
      Alert.alert('Status unchanged', `${getTicketLabel(ticket)} is already ${normalizedStatus}.`);
      return;
    }

    if (remarksRequired && !trimmedRemarks) {
      Alert.alert('Remarks Required', 'Please enter remarks before changing the ticket status.');
      return;
    }

    runMutation(ticket, 'status', async () => {
      await updateTicketStatus(ticket.ticketId, {
        status: normalizedStatus,
        remarks: trimmedRemarks,
        files: statusFiles,
      }, token);
      try {
        const freshDetail = normalizeTicketDetail(await getTicketById(ticket.ticketId, token));
        if (mountedRef.current && selectedTicket?.ticketId === ticket.ticketId) {
          setDetailTicket(freshDetail);
          setDetailError('');
        }
      } catch (detailRefreshError) {
        if (mountedRef.current && selectedTicket?.ticketId === ticket.ticketId) {
          setDetailError(getErrorMessage(detailRefreshError, 'Unable to refresh ticket details.'));
        }
      }
      Alert.alert('Ticket updated', `${getTicketLabel(ticket)} status changed to ${normalizedStatus}.`);
    });
  }, [pendingStatus, runMutation, selectedTicket?.ticketId, statusFiles, statusRemarks, statusTicket, token]);

  const handleStartWork = useCallback((ticket) => {
    runMutation(ticket, 'start', async () => {
      await startTicketWork(ticket, token);
      Alert.alert('Work started', `${getTicketLabel(ticket)} is now in progress.`);
    });
  }, [runMutation, token]);

  const openStopWorkModal = useCallback((ticket) => {
    resetStopWorkForm();
    setStopWorkTicket(ticket);
    setActionTicket(null);
  }, [resetStopWorkForm]);

  const submitStopWork = useCallback(() => {
    const ticket = stopWorkTicket;
    const trimmedRemarks = stopWorkRemarks.trim();

    if (!ticket?.ticketId) return;

    if (!trimmedRemarks) {
      Alert.alert('Remarks Required', 'Please enter remarks before stopping work.');
      return;
    }

    runMutation(ticket, 'stop', async () => {
      await stopTicketWork(ticket, trimmedRemarks, token);
      Alert.alert('Work stopped', 'Work stopped successfully.');
    });
  }, [runMutation, stopWorkRemarks, stopWorkTicket, token]);

  const openEdit = useCallback((ticket) => {
    if (!ticket?.ticketId) return;

    editControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = editRequestIdRef.current + 1;
    editRequestIdRef.current = requestId;
    editControllerRef.current = controller;

    setEditTicket(ticket);
    setEditErrors({});
    setEditLoadError('');
    setEditLoading(true);
    setEmployeeSearchText('');
    setEmployeePickerVisible(false);
    populateEditForm(ticket);
    setActionTicket(null);

    getTicketById(ticket.ticketId, token, { signal: controller.signal })
      .then((response) => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          editRequestIdRef.current !== requestId
        ) {
          return;
        }

        const normalized = normalizeTicketDetail(response);
        setEditTicket(normalized);
        populateEditForm(normalized);
      })
      .catch((requestError) => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          editRequestIdRef.current !== requestId
        ) {
          return;
        }

        setEditLoadError(getErrorMessage(requestError, 'Unable to load complete ticket details.'));
      })
      .finally(() => {
        if (
          mountedRef.current &&
          !controller.signal.aborted &&
          editRequestIdRef.current === requestId
        ) {
          setEditLoading(false);
        }
      });
  }, [populateEditForm, token]);

  const handleEditSave = useCallback(() => {
    if (!editTicket || editLoading || editLoadError) return;

    const nextErrors = validateTicketForm(editForm);
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      Alert.alert('Check ticket details', Object.values(nextErrors)[0]);
      return;
    }

    const payload = buildTicketUpdatePayload(editForm, editTicket);
    runMutation(editTicket, 'edit', async () => {
      await updateTicket(editTicket.ticketId, payload, token);
      if (selectedTicket?.ticketId === editTicket.ticketId) {
        setDetailReloadKey((key) => key + 1);
      }
      Alert.alert('Ticket updated', 'Ticket updated successfully.');
      closeEdit();
    });
  }, [closeEdit, editForm, editLoadError, editLoading, editTicket, runMutation, selectedTicket?.ticketId, token]);

  const handleEmployeeSelect = useCallback((employee) => {
    setEditForm((current) => ({
      ...current,
      assignedToEmployee: employee?.name || '',
      assignedToEmployeeId: employee?.id || '',
    }));
    setEditErrors((current) => {
      if (!current.assignedToEmployee) return current;
      const { assignedToEmployee: _removed, ...rest } = current;
      return rest;
    });
    setEmployeePickerVisible(false);
    setEmployeeSearchText('');
  }, []);

  const confirmDelete = useCallback((ticket) => {
    setActionTicket(null);
    Alert.alert(
      'Delete Ticket?',
      `Are you sure you want to delete ${getTicketLabel(ticket)}?\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            runMutation(ticket, 'delete', async () => {
              await deleteTicket(ticket.ticketId, token);
              Alert.alert('Ticket deleted', `${getTicketLabel(ticket)} was deleted.`);
              setSelectedTicket((current) => (
                String(current?.ticketId) === String(ticket.ticketId) ? null : current
              ));
              setDetailTicket((current) => (
                String(current?.ticketId) === String(ticket.ticketId) ? null : current
              ));
            });
          },
        },
      ]
    );
  }, [runMutation, token]);

  const clearFilters = useCallback(() => {
    setSearchText('');
    setFilters(INITIAL_FILTERS);
    setDraftFilters(INITIAL_FILTERS);
    setFiltersVisible(false);
  }, []);

  const applyFilters = useCallback(() => {
    setFilters(draftFilters);
    setFiltersVisible(false);
  }, [draftFilters]);

  const openFilters = useCallback(() => {
    setDraftFilters(filters);
    setFiltersVisible(true);
  }, [filters]);

  const renderSummary = () => (
    <View style={styles.summaryGrid}>
      {summaryCards.map((card) => (
        <View key={card.label} style={styles.summaryCell}>
          <View style={[styles.summaryIcon, { backgroundColor: `${card.tone}18` }]}>
            <Ionicons name={card.icon} size={18} color={card.tone} />
          </View>
          <View>
            <Text style={styles.summaryLabel}>{card.label}</Text>
            <Text style={styles.summaryValue}>{card.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      <View style={styles.headingBlock}>
        <Text style={styles.screenTitle} accessibilityRole="header">My Tickets</Text>
        <Text style={styles.subtitle}>Review your assigned tickets and track their progress.</Text>
      </View>

      {loading && tickets.length === 0 ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading your tickets...</Text>
        </View>
      ) : hasLoadedTickets || tickets.length > 0 ? (
        renderSummary()
      ) : null}

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={19} color={colors.textSecondary} />
          <AppTextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={handleSearchChange}
            placeholder="Search tickets..."
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            accessibilityLabel="Search tickets by title, employee, or ticket ID"
          />
          {!!searchText && (
            <TouchableOpacity
              style={styles.clearSearchButton}
              onPress={() => handleSearchChange('')}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Clear ticket search"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          onPress={openFilters}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Open ticket filters"
        >
          <Ionicons name="filter" size={17} color={activeFilterCount > 0 ? colors.white : colors.primary} />
          <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {!!error && !loading && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
          <View style={styles.errorCopy}>
            <Text style={styles.stateTitle}>Unable to load tickets</Text>
            <Text style={styles.stateText}>{error}</Text>
          </View>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadTickets()}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tickets"
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading || hasBlockingError || error) return null;

    const hasAnyFilter = searchText.trim() || activeFilterCount > 0;

    return (
      <View style={[styles.emptyState, { width: contentWidth }]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="ticket-outline" size={28} color={colors.primary} />
        </View>
        <Text style={styles.stateTitle}>
          {hasAnyFilter ? 'No tickets match the current filters.' : 'No tickets assigned'}
        </Text>
        <Text style={styles.stateText}>
          {hasAnyFilter ? 'Try a different search or clear filters.' : 'Tickets assigned to you will appear here.'}
        </Text>
        {hasAnyFilter && (
          <TouchableOpacity
            style={styles.clearFiltersButton}
            onPress={clearFilters}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Clear ticket filters"
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderTicket = useCallback(({ item }) => {
    const statusStyle = getTicketStatusStyle(item.status);
    const priorityStyle = getPriorityStyle(item.priority);
    const isMutating = mutationState.id === item.ticketId;

    return (
      <View style={[styles.ticketCard, { width: contentWidth }]}>
        <View style={styles.ticketTopRow}>
          <TouchableOpacity
            style={styles.ticketIdButton}
            onPress={() => openDetails(item)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Open Ticket ${item.ticketId} details`}
          >
            <Text style={styles.ticketId}>#{item.ticketId}</Text>
          </TouchableOpacity>
          <View style={styles.ticketTopActions}>
            <View style={[styles.badge, styles.ticketStatusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
              <Text style={[styles.badgeText, { color: statusStyle.color }]}>
                {getTicketStatusLabel(item.status)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cardActionButton}
              onPress={() => setActionTicket(item)}
              disabled={isMutating}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={`Open actions for Ticket ${item.ticketId}`}
              accessibilityState={{ busy: isMutating, disabled: isMutating }}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.ticketPressArea}
          onPress={() => openDetails(item)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`Open Ticket ${item.ticketId} details`}
        >
          <Text style={styles.ticketTitle} numberOfLines={1}>{item.title || 'Untitled ticket'}</Text>
          <Text style={styles.ticketDescription} numberOfLines={2}>
            {item.description || 'No description provided.'}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText} numberOfLines={1}>{item.category || '--'}</Text>
            </View>
            <View style={[styles.priorityPill, { backgroundColor: priorityStyle.backgroundColor }]}>
              <Text style={[styles.priorityText, { color: priorityStyle.color }]} numberOfLines={1}>
                {getTicketPriorityLabel(item.priority)}
              </Text>
            </View>
          </View>

          <View style={styles.ticketFooterRow}>
            <Text style={styles.footerMeta} numberOfLines={1}>
              Assigned: {item.assignedToId || item.assignedTo || '--'}
            </Text>
            <Text style={styles.footerMeta}>{formatTicketDate(item.updatedDate || item.createdDate)}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [contentWidth, mutationState.id, openDetails]);

  const renderFooter = () => {
    if (loading || error || filteredTickets.length === 0) return null;

    const previousDisabled = visiblePage <= 1;
    const nextDisabled = visiblePage >= totalPages;

    return (
      <View style={[styles.paginationCard, { width: contentWidth }]}>
        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pageButton, previousDisabled && styles.disabledControl]}
            onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={previousDisabled}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Previous ticket page"
            accessibilityState={{ disabled: previousDisabled }}
          >
            <Ionicons name="chevron-back" size={16} color={previousDisabled ? colors.placeholder : colors.primary} />
            <Text style={[styles.pageButtonText, previousDisabled && styles.disabledText]}>Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageText}>{visiblePage} / {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageButton, nextDisabled && styles.disabledControl]}
            onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={nextDisabled}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Next ticket page"
            accessibilityState={{ disabled: nextDisabled }}
          >
            <Text style={[styles.pageButtonText, nextDisabled && styles.disabledText]}>Next</Text>
            <Ionicons name="chevron-forward" size={16} color={nextDisabled ? colors.placeholder : colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFilterSection = (label, values, key) => (
    <View style={styles.modalSection}>
      <Text style={styles.modalSectionTitle}>{label}</Text>
      <View style={styles.optionGrid}>
        {values.map((value) => (
          <OptionChip
            key={value}
            label={value}
            selected={draftFilters[key] === value}
            onPress={() => setDraftFilters((current) => ({ ...current, [key]: value }))}
          />
        ))}
      </View>
    </View>
  );

  const renderFiltersModal = () => (
    <Modal
      visible={filtersVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setFiltersVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { width: modalWidth }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ticket Filters</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setFiltersVisible(false)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Close ticket filters"
            >
              <Ionicons name="close" size={21} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            {renderFilterSection('Status', statusOptions, 'status')}
            {renderFilterSection('Priority', priorityOptions, 'priority')}
            {renderFilterSection('Category', categoryOptions, 'category')}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setDraftFilters(INITIAL_FILTERS)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Clear ticket filter selections"
            >
              <Text style={styles.secondaryButtonText}>Clear Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={applyFilters}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Apply ticket filters"
            >
              <Text style={styles.primaryButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderDetailsModal = () => {
    const ticket = detailTicket || selectedTicket;
    if (!ticket) return null;

    const statusStyle = getTicketStatusStyle(ticket.status);
    const priorityStyle = getPriorityStyle(ticket.priority);
    const attachmentItems = getAttachmentItems(ticket);
    const remarkItems = getRemarkItems(ticket);
    const timelineItems = getTimelineItems(ticket);
    const ticketInfoRows = [
      ['Created By', ticket.assignedByName || ticket.assignedBy || ticket.createdBy || '--', 'person-outline'],
      ['Assigned To', ticket.assignedToName || ticket.assignedTo || ticket.assignedToId || '--', 'person-add-outline'],
      ['Created Date', formatTicketDate(ticket.createdDate), 'calendar-outline'],
      ['Updated Date', formatTicketDate(ticket.updatedDate), 'refresh-outline'],
      ['Current Status', getTicketStatusLabel(ticket.status), 'information-circle-outline'],
      hasMeaningfulValue(ticket.dueDate) ? ['Due Date', formatTicketDate(ticket.dueDate), 'alarm-outline'] : null,
      hasMeaningfulValue(ticket.startedDate) ? ['Started Date', formatTicketDate(ticket.startedDate), 'play-circle-outline'] : null,
      hasMeaningfulValue(ticket.completedDate || ticket.stoppedDate)
        ? ['Completed Date', formatTicketDate(ticket.completedDate || ticket.stoppedDate), 'checkmark-circle-outline']
        : null,
      hasMeaningfulValue(ticket.spentHours) ? ['Spent Hours', ticket.spentHours, 'timer-outline'] : null,
      hasMeaningfulValue(ticket.notes) ? ['Notes', ticket.notes, 'document-text-outline'] : null,
    ].filter(Boolean);

    return (
      <Modal
        visible={Boolean(ticket)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeDetails}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.detailsModalCard, { width: modalWidth }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Ticket Details</Text>
                <Text style={styles.modalSubtitle}>{ticket.title || 'View the full ticket record.'}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeDetails}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close ticket details"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {!!detailError && (
                <View style={styles.inlineErrorCard}>
                  <Ionicons name="alert-circle-outline" size={19} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{detailError}</Text>
                  <TouchableOpacity
                    style={styles.inlineRetryButton}
                    onPress={() => setDetailReloadKey((value) => value + 1)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel={`Retry loading Ticket ${ticket.ticketId} details`}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {detailLoading && (
                <View style={styles.inlineLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.stateText}>Loading complete ticket details...</Text>
                </View>
              )}

              {!!detailTicket && !detailLoading && !detailError && (<>
              <View style={styles.detailsTitleBlock}>
                <Text style={styles.detailsTicketId}>#{ticket.ticketId}</Text>
                <Text style={styles.detailsTitle}>{ticket.title || 'Untitled ticket'}</Text>
                <View style={styles.detailsChipRow}>
                  <View style={[styles.badge, { backgroundColor: statusStyle.backgroundColor }]}>
                    <Text style={[styles.badgeText, { color: statusStyle.color }]}>{getTicketStatusLabel(ticket.status)}</Text>
                  </View>
                  <View style={[styles.priorityPill, { backgroundColor: priorityStyle.backgroundColor }]}>
                    <Text style={[styles.priorityText, { color: priorityStyle.color }]}>{getTicketPriorityLabel(ticket.priority)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Overview</Text>
                <View style={styles.descriptionBox}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.descriptionFull}>{ticket.description || 'No description provided.'}</Text>
                </View>
                <View style={styles.compactInfoGrid}>
                  <DetailRow label="Ticket ID" value={`#${ticket.ticketId}`} icon="ticket-outline" />
                  <DetailRow label="Ticket Number" value={ticket.ticketNumber || '--'} icon="receipt-outline" />
                  <DetailRow label="Category" value={ticket.category || '--'} icon="folder-open-outline" />
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Ticket Info</Text>
                {ticketInfoRows.map(([label, value, icon]) => (
                  <DetailRow key={label} label={label} value={value} icon={icon} />
                ))}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Attachments</Text>
                {attachmentItems.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>No attachments were included with this ticket.</Text>
                ) : (
                  attachmentItems.map((attachment) => (
                    <View key={attachment.key} style={styles.attachmentRow}>
                      <Ionicons name="attach-outline" size={18} color={colors.primary} />
                      <View style={styles.detailCopy}>
                        <Text style={styles.detailValue} numberOfLines={2}>{attachment.label}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.attachmentViewButton}
                        onPress={() => viewTicketAttachment(attachment)}
                        disabled={Boolean(viewingAttachmentKey)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${attachment.label}`}
                      >
                        {viewingAttachmentKey === attachment.key
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <Ionicons name="eye-outline" size={20} color={colors.primary} />}
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Remarks</Text>
                {remarkItems.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>No remarks are available for this ticket.</Text>
                ) : (
                  remarkItems.map((remark) => (
                    <View key={remark.key} style={styles.commentCard}>
                      <Text style={styles.descriptionFull}>{remark.message || 'No remark text provided.'}</Text>
                      {!!remark.transition && <Text style={styles.detailLabel}>{remark.transition}</Text>}
                      <Text style={styles.remarkDate}>{formatTicketDateTime(remark.date).replace(', ', ' \u2022 ')}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Status Timeline</Text>
                {timelineItems.map((item, index) => (
                  <View key={item.key} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={styles.timelineDot} />
                      {index < timelineItems.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineCopy}>
                      <Text style={styles.detailValue}>{item.label}</Text>
                      <Text style={styles.detailLabel}>{item.detail || '--'}</Text>
                      <Text style={styles.detailLabel}>{formatTicketDateTime(item.date)}</Text>
                    </View>
                  </View>
                ))}
              </View>
              </>)}

            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderActionModal = () => {
    const ticket = actionTicket;
    if (!ticket) return null;

    const canEdit = Boolean(ticket.ticketId);
    const canDelete = canDeleteTicket(ticket.status);
    const showStart = isTicketAssigned(ticket) && !isTicketCompleted(ticket);
    const showStop = isTicketWorkActive(ticket);
    const busy = mutationState.id === ticket.ticketId;

    return (
      <Modal
        visible={Boolean(ticket)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActionTicket(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: modalWidth }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Ticket Actions</Text>
                <Text style={styles.modalSubtitle}>{getTicketLabel(ticket)}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setActionTicket(null)}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close ticket actions"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  openDetails(ticket);
                  setActionTicket(null);
                }}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`View Ticket ${ticket.ticketId} details`}
              >
                <Ionicons name="eye-outline" size={19} color={colors.primary} />
                <Text style={styles.actionRowText}>View details</Text>
              </TouchableOpacity>

              {canEdit && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => openEdit(ticket)}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit Ticket ${ticket.ticketId} details`}
                >
                  <Ionicons name="create-outline" size={19} color={colors.info} />
                  <Text style={styles.actionRowText}>Edit details</Text>
                </TouchableOpacity>
              )}

              {canUpdateTicketStatus() && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    resetStatusForm();
                    setStatusTicket(ticket);
                    setActionTicket(null);
                  }}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Change Ticket ${ticket.ticketId} status`}
                >
                  <Ionicons name="swap-horizontal-outline" size={19} color={colors.primary} />
                  <Text style={styles.actionRowText}>Change status</Text>
                </TouchableOpacity>
              )}

              {showStart && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => handleStartWork(ticket)}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Start work on Ticket ${ticket.ticketId}`}
                >
                  <Ionicons name="play-outline" size={19} color={colors.success} />
                  <Text style={styles.actionRowText}>Start work</Text>
                </TouchableOpacity>
              )}

              {showStop && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => openStopWorkModal(ticket)}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop work on Ticket ${ticket.ticketId}`}
                >
                  <Ionicons name="stop-outline" size={19} color={colors.warning} />
                  <Text style={styles.actionRowText}>Stop work</Text>
                </TouchableOpacity>
              )}

              {canDelete && (
                <TouchableOpacity
                  style={[styles.actionRow, styles.destructiveActionRow]}
                  onPress={() => confirmDelete(ticket)}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete Ticket ${ticket.ticketId}`}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.error} />
                  <Text style={[styles.actionRowText, styles.destructiveText]}>Delete ticket</Text>
                </TouchableOpacity>
              )}

              {busy && (
                <View style={styles.mutationNotice}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.stateText}>Updating ticket...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderStatusModal = () => {
    const ticket = statusTicket;
    if (!ticket) return null;

    const busy = mutationState.id === ticket.ticketId;
    const currentStatus = normalizeTicketStatus(ticket.status);
    const selectedStatus = pendingStatus || currentStatus;
    const showRemarksField = Boolean(pendingStatus && isActualStatusChange(currentStatus, pendingStatus));
    const trimmedRemarks = statusRemarks.trim();
    const submitDisabled = busy || (showRemarksField && !trimmedRemarks);

    return (
      <Modal
        visible={Boolean(ticket)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!busy) closeStatusModal();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { width: modalWidth }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Update Status</Text>
                <Text style={styles.modalSubtitle}>{getTicketLabel(ticket)}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeStatusModal}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close status update"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.statusModalScroll} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>New Status</Text>
              <View style={styles.optionGrid}>
                {getEmployeeStatusOptions(ticket).map((status) => (
                  <OptionChip
                    key={status}
                    label={status}
                    selected={normalizeTicketStatus(selectedStatus) === status}
                    onPress={() => handleStatusUpdate(ticket, status)}
                    disabled={busy}
                  />
                ))}
              </View>
              {showRemarksField && (
                <View style={styles.statusRemarksBlock}>
                  <Text style={styles.fieldLabel}>Remarks *</Text>
                  <AppTextInput
                    style={[styles.fieldInput, styles.fieldInputMultiline]}
                    value={statusRemarks}
                    onChangeText={setStatusRemarks}
                    placeholder="Enter remarks for this status change..."
                    placeholderTextColor={colors.placeholder}
                    multiline
                    editable={!busy}
                    textAlignVertical="top"
                    accessibilityLabel="Remarks for status change"
                  />
                  {!trimmedRemarks && (
                    <Text style={styles.fieldError}>Please enter remarks before changing the ticket status.</Text>
                  )}
                </View>
              )}
              {showRemarksField && (
                <View style={styles.statusRemarksBlock}>
                  <Text style={styles.fieldLabel}>Attachments</Text>
                  {statusFiles.map((file) => (
                    <View key={`${file.uri}|${file.name}`} style={styles.selectedAttachmentRow}>
                      <Ionicons name="attach-outline" size={18} color={colors.primary} />
                      <Text style={styles.selectedAttachmentName} numberOfLines={1}>{file.name}</Text>
                      <TouchableOpacity
                        style={styles.attachmentViewButton}
                        onPress={() => setStatusFiles((current) => current.filter((item) => `${item.uri}|${item.name}` !== `${file.uri}|${file.name}`))}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${file.name}`}
                      >
                        <Ionicons name="close" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addAttachmentButton}
                    onPress={addStatusAttachments}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Add ticket attachments"
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                    <Text style={styles.retryText}>{statusFiles.length ? 'Add more files' : 'Add attachments'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            {showRemarksField && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={closeStatusModal}
                  disabled={busy}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel status update"
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, submitDisabled && styles.disabledControl]}
                  onPress={submitStatusUpdateWithRemarks}
                  disabled={submitDisabled}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel="Submit status update"
                  accessibilityState={{ disabled: submitDisabled, busy }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderStopWorkModal = () => {
    const ticket = stopWorkTicket;
    if (!ticket) return null;

    const busy = mutationState.id === ticket.ticketId;
    const trimmedRemarks = stopWorkRemarks.trim();
    const submitDisabled = busy || !trimmedRemarks;

    return (
      <Modal
        visible={Boolean(ticket)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!busy) closeStopWorkModal();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { width: modalWidth }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Stop Work</Text>
                <Text style={styles.modalSubtitle}>{getTicketLabel(ticket)}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeStopWorkModal}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close stop work"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.statusRemarksBlock}>
                <Text style={styles.fieldLabel}>Remarks *</Text>
                <AppTextInput
                  style={[styles.fieldInput, styles.fieldInputMultiline]}
                  value={stopWorkRemarks}
                  onChangeText={setStopWorkRemarks}
                  placeholder="Enter completion remarks..."
                  placeholderTextColor={colors.placeholder}
                  multiline
                  editable={!busy}
                  textAlignVertical="top"
                  accessibilityLabel="Stop work remarks"
                />
                <Text style={trimmedRemarks ? styles.fieldHelperText : styles.fieldError}>
                  {trimmedRemarks
                    ? 'Add a short note describing the work completed.'
                    : 'Please enter remarks before stopping work.'}
                </Text>
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={closeStopWorkModal}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Cancel stop work"
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, submitDisabled && styles.disabledControl]}
                onPress={submitStopWork}
                disabled={submitDisabled}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Submit stop work"
                accessibilityState={{ disabled: submitDisabled, busy }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Stop Work</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderEditModal = () => {
    const ticket = editTicket;
    if (!ticket) return null;

    const busy = mutationState.id === ticket.ticketId;
    const selectedEmployeeLabel =
      employees.find((employee) => employee.id === editForm.assignedToEmployeeId)?.label ||
      (editForm.assignedToEmployee && editForm.assignedToEmployeeId
        ? `${editForm.assignedToEmployee} (${editForm.assignedToEmployeeId})`
        : editForm.assignedToEmployee || editForm.assignedToEmployeeId || 'Select employee');

    return (
      <Modal
        visible={Boolean(ticket)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!busy) closeEdit();
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, styles.detailsModalCard, { width: modalWidth }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Edit Ticket</Text>
                <Text style={styles.modalSubtitle}>{getTicketLabel(ticket)}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeEdit}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Close ticket editor"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              {!!editLoadError && (
                <View style={styles.inlineErrorCard}>
                  <Ionicons name="alert-circle-outline" size={19} color={colors.error} />
                  <Text style={styles.inlineErrorText}>{editLoadError}</Text>
                </View>
              )}
              {editLoading && (
                <View style={styles.inlineLoadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.stateText}>Loading latest ticket details...</Text>
                </View>
              )}
              <TicketField
                label="Title"
                value={editForm.title}
                editable={false}
              />
              <TicketField
                label="Description"
                value={editForm.description}
                editable={false}
                multiline
              />
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Category</Text>
                <View style={styles.optionGrid}>
                  {categoryOptions.filter((value) => value !== 'All').map((category) => (
                    <OptionChip
                      key={category}
                      label={category}
                      selected={normalizeTicketCategory(editForm.category) === category}
                      disabled
                    />
                  ))}
                </View>
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Priority</Text>
                <View style={styles.optionGrid}>
                  {TICKET_PRIORITY_OPTIONS.map((priority) => (
                    <OptionChip
                      key={priority}
                      label={priority}
                      selected={normalizeTicketPriority(editForm.priority) === priority}
                      disabled
                    />
                  ))}
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Due Date</Text>
                <View style={[styles.selectorButton, styles.readOnlyField]}>
                  <Text style={[styles.selectorButtonText, styles.readOnlyValue]} numberOfLines={1}>
                    {formatDateInput(editForm.dueDate)}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Assign To Employee</Text>
                <TouchableOpacity
                  style={[styles.selectorButton, editErrors.assignedToEmployee && styles.fieldInputError]}
                  onPress={() => setEmployeePickerVisible(true)}
                  disabled={busy || employeesLoading || editLoading || Boolean(editLoadError)}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel="Select assigned employee"
                >
                  <Text style={[styles.selectorButtonText, selectedEmployeeLabel === 'Select employee' && styles.selectorPlaceholder]} numberOfLines={1}>
                    {employeesLoading ? 'Loading employees...' : selectedEmployeeLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.primary} />
                </TouchableOpacity>
                {!!editErrors.assignedToEmployee && <Text style={styles.fieldError}>{editErrors.assignedToEmployee}</Text>}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={closeEdit}
                disabled={busy}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Cancel ticket editing"
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, (busy || editLoading || Boolean(editLoadError)) && styles.disabledControl]}
                onPress={handleEditSave}
                disabled={busy || editLoading || Boolean(editLoadError)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={`Save Ticket ${ticket.ticketId}`}
                accessibilityState={{ busy, disabled: busy || editLoading || Boolean(editLoadError) }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Update Ticket</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderEmployeePickerModal = () => (
    <Modal
      visible={employeePickerVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setEmployeePickerVisible(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalCard, styles.detailsModalCard, { width: modalWidth }]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Select Employee</Text>
              <Text style={styles.modalSubtitle}>Choose the employee who owns this ticket.</Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setEmployeePickerVisible(false)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Close employee selector"
            >
              <Ionicons name="close" size={21} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.employeePickerBody}>
            <View style={[styles.searchWrap, styles.employeeSearchWrap]}>
              <Ionicons name="search" size={19} color={colors.textSecondary} />
              <AppTextInput
                style={styles.searchInput}
                value={employeeSearchText}
                onChangeText={setEmployeeSearchText}
                placeholder="Search employee name or ID"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search employees"
              />
              {!!employeeSearchText && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => setEmployeeSearchText('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear employee search"
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {employeesLoading ? (
              <View style={styles.inlineLoadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.stateText}>Loading employees...</Text>
              </View>
            ) : filteredEmployees.length === 0 ? (
              <Text style={styles.sectionEmptyText}>No employees match the current search.</Text>
            ) : (
              <ScrollView
                style={styles.employeeList}
                contentContainerStyle={styles.employeeListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
              >
                {filteredEmployees.map((employee) => (
                  <TouchableOpacity
                    key={`${employee.id || employee.name}`}
                    style={styles.employeeOption}
                    onPress={() => handleEmployeeSelect(employee)}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel={`Assign ticket to ${employee.label}`}
                  >
                    <View style={styles.employeeAvatar}>
                      <Text style={styles.employeeAvatarText}>
                        {(employee.name || 'E').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailCopy}>
                      <Text style={styles.detailValue} numberOfLines={1}>{employee.name}</Text>
                      <Text style={styles.detailLabel} numberOfLines={1}>{employee.id || '--'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const listHeader = renderHeader();
  const listEmpty = renderEmpty();
  const listFooter = renderFooter();

  return (
    <View style={styles.container}>
      <FlatList
        data={hasBlockingError ? [] : pagedTickets}
        keyExtractor={(item) => String(item.ticketId)}
        renderItem={renderTicket}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.screenVertical,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTickets({ refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      />

      {renderFiltersModal()}
      {renderDetailsModal()}
      {renderActionModal()}
      {renderStatusModal()}
      {renderStopWorkModal()}
      {renderEditModal()}
      {renderEmployeePickerModal()}
    </View>
  );
}

function TicketField({ label, value, onChangeText, error, multiline = false, placeholder = '', maxLength, editable = true }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editable ? (
        <AppTextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline, error && styles.fieldInputError]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || label}
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxLength={maxLength}
          accessibilityLabel={label}
        />
      ) : (
        <View style={[styles.fieldInput, multiline && styles.fieldInputMultiline, styles.readOnlyField]}>
          <Text style={styles.readOnlyValue} selectable>{value || '--'}</Text>
        </View>
      )}
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navigation.screenBackground,
  },
  listContent: {
    alignItems: 'center',
    gap: spacing.sectionGap,
    padding: spacing.screen,
  },
  headerContent: {
    gap: spacing.xxl,
  },
  headingBlock: {
    gap: spacing.md,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 31,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryCell: {
    width: '48%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.dashboardMetric,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadows.subtle,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.metricLabel,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardMetricValue,
    fontWeight: fontWeights.extraBold,
    lineHeight: 30,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  searchWrap: {
    minHeight: 52,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    ...shadows.subtle,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    ...shadows.subtle,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  loadingCard: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: spacing.lg,
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
  },
  retryButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  ticketCard: {
    gap: spacing.md,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    ...shadows.subtle,
  },
  ticketPressArea: {
    gap: spacing.md,
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ticketIdButton: {
    minHeight: 36,
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  ticketId: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  ticketTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexShrink: 0,
  },
  badge: {
    maxWidth: '58%',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  ticketStatusBadge: {
    maxWidth: 136,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  ticketTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  ticketDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 18,
    fontWeight: fontWeights.medium,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryPill: {
    maxWidth: '62%',
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  priorityPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  priorityText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  ticketFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerMeta: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  cardActionButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mutedBackground,
  },
  paginationCard: {
    gap: spacing.md,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  paginationSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
  pageButtonText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  pageText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  emptyState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderRadius: radii.compactCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
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
    fontWeight: fontWeights.medium,
    lineHeight: 18,
    textAlign: 'center',
  },
  clearFiltersButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.tealTintSoft,
    paddingHorizontal: spacing.xxl,
  },
  clearFiltersText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
  },
  modalCard: {
    maxHeight: '85%',
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadows.modal,
  },
  detailsModalCard: {
    maxHeight: '88%',
  },
  modalHeader: {
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
  modalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  modalSubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  modalCloseButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mutedBackground,
  },
  modalBody: {
    gap: spacing.lg,
    padding: spacing.xxl,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.xxl,
  },
  modalSection: {
    gap: spacing.md,
  },
  modalSectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  optionChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  optionChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.tealTintSoft,
  },
  optionChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  optionChipTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
  statusRemarksBlock: {
    gap: spacing.sm,
  },
  statusModalScroll: {
    flexShrink: 1,
  },
  selectedAttachmentRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectedAttachmentName: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
  },
  addAttachmentButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  primaryButton: {
    minHeight: 44,
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.mutedBackground,
    paddingHorizontal: spacing.xxl,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  detailsTitleBlock: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailsTicketId: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  detailsTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
  },
  detailsChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  detailSection: {
    gap: spacing.md,
  },
  detailSectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  compactInfoGrid: {
    gap: spacing.md,
  },
  inlineLoadingRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  inlineErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: spacing.md,
  },
  inlineErrorText: {
    flex: 1,
    minWidth: 0,
    color: colors.error,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 18,
  },
  inlineRetryButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  descriptionBox: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.mutedBackground,
    padding: spacing.lg,
  },
  descriptionFull: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  sectionEmptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    lineHeight: 19,
  },
  attachmentRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  attachmentViewButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentCard: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  remarkDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    alignItems: 'center',
  },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 38,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
  },
  timelineCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
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
    lineHeight: 21,
  },
  actionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  destructiveActionRow: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
  },
  actionRowText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  destructiveText: {
    color: colors.error,
  },
  mutationNotice: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  fieldInput: {
    minHeight: sizes.inputHeight,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fieldInputMultiline: {
    minHeight: 104,
    lineHeight: lineHeights.body,
  },
  fieldInputError: {
    borderColor: colors.error,
  },
  selectorButton: {
    minHeight: sizes.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  selectorButtonText: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  readOnlyField: {
    backgroundColor: colors.mutedBackground,
  },
  readOnlyValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  selectorPlaceholder: {
    color: colors.placeholder,
  },
  fieldError: {
    color: colors.error,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  fieldHelperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  employeePickerBody: {
    gap: spacing.lg,
    padding: spacing.xxl,
    flexShrink: 1,
  },
  employeeSearchWrap: {
    flex: 0,
  },
  employeeList: {
    maxHeight: 360,
    flexShrink: 1,
  },
  employeeListContent: {
    gap: spacing.md,
  },
  employeeOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  employeeAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealTintSoft,
  },
  employeeAvatarText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  disabledControl: {
    opacity: 0.55,
  },
  disabledText: {
    color: colors.placeholder,
  },
});
