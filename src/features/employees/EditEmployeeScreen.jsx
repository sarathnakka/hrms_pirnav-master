import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppTextInput from '../../shared/components/AppTextInput';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import {
  BANK_OPTIONS,
  BLOOD_GROUP_OPTIONS,
  DESIGNATION_OPTIONS,
  EMPTY_BANK,
  EMPTY_EDUCATION,
  EMPTY_EXPERIENCE,
  EMPTY_PERSONAL,
  GENDER_OPTIONS,
  MARITAL_OPTIONS,
  QUALIFICATION_OPTIONS,
  STEPS,
  buildBankPayload,
  buildPersonalPayload,
  dateOnly,
  educationPayload,
  experiencePayload,
  experienceYears,
  formatDisplayDate,
  formatFileSize,
  formatFileSizeMB,
  maskLastFour,
  maskPan,
  isAgreementSignedStatus,
  mergeAgreementsWithLifecycle,
  normalizeAgreements,
  normalizeDocumentChecklist,
  normalizeDepartments,
  normalizeDocuments,
  normalizeEmployeeProfile,
} from './employeeProfileMappers';
import {
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  downloadSignedAgreementDocument,
  getDepartments,
  getAgreementTemplates,
  getDocumentChecklist,
  getEmployeeDocuments,
  getMyEmployeeDetails,
  getPendingAgreements,
  getSignedAgreements,
  saveBankInfo,
  saveEducationCollection,
  saveExperienceCollection,
  savePersonalInfo,
  signEmployeeAgreement,
  uploadEmployeeDocument,
  viewAgreementDocument,
  viewEmployeeDocument,
  viewSignedAgreementDocument,
} from './employeeProfileApi';

const MAX_DOCUMENT_SIZE = 3 * 1024 * 1024;
const MAX_SIGNATURE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const DOCUMENT_LABELS = {
  '10th Certificate': '10th Certificate',
  'Intermediate / 12th Certificate': 'Intermediate / 12th Certificate',
  'Degree Certificate': 'Degree Certificate',
  'Post Graduation Certificate': 'Post-Graduation Certificate',
  'Aadhaar Card': 'Aadhaar Card',
  'PAN Card': 'PAN Card',
  'Passport Size Photo': 'Passport-size Photo',
  'Offer Letter': 'Offer Letter',
  'Appointment Letter': 'Appointment Letter',
  'Relieving Letter': 'Relieving Letter',
  'Payslip Month 1': 'Payslip - Month 1',
  'Payslip Month 2': 'Payslip - Month 2',
  'Payslip Month 3': 'Payslip - Month 3',
};

function normalizeDocumentType(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getFriendlyDocumentLabel(value) {
  return DOCUMENT_LABELS[value] || value || 'Document';
}

function getDocumentStatusTone(status, uploaded) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('reject')) return 'error';
  if (normalized.includes('verify') || normalized.includes('approved')) return 'success';
  if (uploaded) return 'warning';
  return 'neutral';
}

function getDocumentStatusText(status, uploaded) {
  if (!uploaded) return 'Not uploaded';
  return String(status || '').trim() || 'Pending';
}

function getFileExtension(file = {}) {
  const name = String(file.name || file.fileName || '').trim();
  const match = /\.([A-Za-z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function isSupportedDocumentFile(file = {}) {
  const extension = getFileExtension(file);
  const mimeType = String(file.mimeType || file.type || '').toLowerCase();
  return (
    SUPPORTED_FILE_TYPES.includes(mimeType) ||
    ['pdf', 'jpg', 'jpeg', 'png'].includes(extension)
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function agreementText(value, fallback = '-') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function getAgreementDisplayId(agreement = {}) {
  return (
    agreement.agreementId ||
    agreement.employeeAgreementId ||
    agreement.pendingEmployeeAgreementId ||
    agreement.signedEmployeeAgreementId ||
    agreement.documentId ||
    agreement.agreementCode ||
    agreement.id ||
    ''
  );
}

function getAgreementFileName(agreement = {}, signed = false) {
  const base = String(agreement.agreementName || agreement.agreementCode || 'Agreement')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${signed ? 'Signed-' : ''}${base || 'Agreement'}.pdf`;
}

function isAgreementSigned(agreement = {}) {
  return Boolean(agreement?.signedEmployeeAgreementId || isAgreementSignedStatus(agreement?.status));
}

function firstError(errors) {
  return Object.values(errors).find(Boolean) || 'Please review the highlighted fields.';
}

const STEP_LABELS = ['Personal', 'Bank', 'Education', 'Experience', 'Documents', 'Review'];

function Stepper({ step, maxStep, onStepPress, completedStepIndexes = [], showCompletion = false }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: Math.max(0, step * 94 - 24),
      animated: true,
    });
  }, [step]);

  return (
    <View style={styles.stepperCard}>
      <View style={styles.stepperTop}>
        <Text style={styles.stepTitle}>{STEPS[step]}</Text>
        <Text style={styles.stepCount}>Step {step + 1} of {STEPS.length}</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.numberStepper}
      >
        {STEP_LABELS.map((label, index) => {
          const isCurrent = index === step;
          const unlocked = index <= maxStep;
          const isCompleted = Boolean(showCompletion && !isCurrent && completedStepIndexes.includes(index));
          const isConnectorCompleted = Boolean(showCompletion && completedStepIndexes.includes(index));
          const accessibilityStateLabel = isCurrent
            ? 'current'
            : isCompleted
              ? 'completed'
              : unlocked
                ? 'available'
                : 'locked';

          return (
            <View key={label} style={styles.stepItemWrap}>
              <TouchableOpacity
                style={[
                  styles.stepItem,
                  isCurrent && styles.stepItemCurrent,
                  !unlocked && styles.stepItemLocked,
                ]}
                disabled={!unlocked}
                onPress={() => onStepPress(index)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={{ disabled: !unlocked, selected: isCurrent }}
                accessibilityLabel={`${label}, step ${index + 1} of ${STEPS.length}, ${accessibilityStateLabel}`}
              >
                <View style={[
                  styles.stepCircle,
                  isCompleted && styles.stepCircleDone,
                  isCurrent && styles.stepCircleCurrent,
                ]}>
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  ) : (
                    <Text style={[styles.stepCircleText, isCurrent && styles.stepCircleTextCurrent]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]} numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
              {index < STEP_LABELS.length - 1 && (
                <View style={[styles.stepConnector, isConnectorCompleted && styles.stepConnectorDone]} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChangeText, error, keyboardType, secureTextEntry, editable = true, multiline = false, autoCapitalize = 'sentences' }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <AppTextInput
        style={[styles.input, multiline && styles.multilineInput, error && styles.inputError, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function OptionField({ label, value, options, onChange, error, disabled = false }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.optionsBox, error && styles.inputError, disabled && styles.readOnlyControl]}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionChip, selected && styles.optionChipActive, disabled && styles.optionChipDisabled]}
              onPress={() => onChange(option)}
              disabled={disabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${label}: ${option}`}
            >
              <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function normalizeSelectionOptions(options) {
  return options.map((option) => {
    if (typeof option === 'string') {
      return { label: option, value: option };
    }
    return {
      label: option.label || option.name || String(option.value || ''),
      value: option.value ?? option.id ?? option.label,
      group: option.group,
      helper: option.helper,
      disabled: option.disabled,
    };
  }).filter((option) => option.label && option.value !== undefined && option.value !== null);
}

function SelectionField({ label, value, options, onChange, error, placeholder = 'Select', searchable = true, disabled = false }) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedOptions = useMemo(() => normalizeSelectionOptions(options), [options]);
  const selected = normalizedOptions.find((option) => String(option.value) === String(value));
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return normalizedOptions;
    return normalizedOptions.filter((option) =>
      `${option.label} ${option.group || ''} ${option.helper || ''}`.toLowerCase().includes(needle)
    );
  }, [normalizedOptions, query]);
  let currentGroup = '';

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectField, error && styles.inputError, disabled && styles.inputDisabled]}
        onPress={() => setVisible(true)}
        disabled={disabled}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`${label}. ${selected?.label || placeholder}`}
      >
        <Text style={[styles.selectFieldText, !selected && styles.placeholderText]} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.primary} />
      </TouchableOpacity>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectorModal}>
            <View style={styles.selectorHeader}>
              <View>
                <Text style={styles.selectorTitle}>{label}</Text>
                <Text style={styles.selectorSubtitle}>Choose one option</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="Close selector">
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {searchable && (
              <View style={styles.selectorSearch}>
                <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                <AppTextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${label.toLowerCase()}`}
                  placeholderTextColor={colors.placeholder}
                  style={styles.selectorSearchInput}
                  autoCapitalize="none"
                />
              </View>
            )}
            <ScrollView style={styles.selectorList} keyboardShouldPersistTaps="handled">
              {filteredOptions.map((option) => {
                const checked = String(option.value) === String(value);
                const showGroup = option.group && option.group !== currentGroup;
                if (showGroup) currentGroup = option.group;

                return (
                  <View key={`${option.group || 'option'}-${option.value}`}>
                    {showGroup && <Text style={styles.selectorGroup}>{option.group}</Text>}
                    <TouchableOpacity
                      style={[styles.selectorRow, checked && styles.selectorRowActive, option.disabled && styles.selectorRowDisabled]}
                      onPress={() => {
                        if (option.disabled) {
                          return;
                        }
                        onChange(option.value);
                        setVisible(false);
                        setQuery('');
                      }}
                      disabled={option.disabled}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityState={{ selected: checked, disabled: option.disabled }}
                    >
                      <View style={styles.selectorTextWrap}>
                        <Text style={[styles.selectorRowText, checked && styles.selectorRowTextActive]}>{option.label}</Text>
                        {!!option.helper && <Text style={styles.selectorRowHelper}>{option.helper}</Text>}
                      </View>
                      {checked && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                  </View>
                );
              })}
              {!filteredOptions.length && <Text style={styles.emptyText}>No options found.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DateField({ label, value, onChange, error, disabled = false }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerValue = value ? new Date(`${value}T00:00:00`) : new Date();

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, styles.dateInput, error && styles.inputError, disabled && styles.inputDisabled]}
        onPress={() => setShowPicker(true)}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
      >
        <Text style={[styles.dateText, !value && styles.placeholderText]}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (event.type === 'dismissed') return;
            if (selectedDate) {
              onChange(dateOnly(selectedDate));
            }
          }}
        />
      )}
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ActionRow({ step, loading, disabled = false, onBack, onSkip, onNext, nextLabel = 'Update & Next' }) {
  const isDisabled = loading || disabled;

  return (
    <View style={styles.actions}>
      {(step > 0 || onSkip) && (
        <View style={styles.secondaryActionRow}>
          {step > 0 && (
            <TouchableOpacity
              style={[styles.secondaryButton, isDisabled && styles.secondaryButtonDisabled]}
              onPress={onBack}
              disabled={isDisabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
            >
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity
              style={[styles.secondaryButton, isDisabled && styles.secondaryButtonDisabled]}
              onPress={onSkip}
              disabled={isDisabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
            >
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity
        style={[styles.primaryButton, isDisabled && styles.buttonDisabled]}
        onPress={onNext}
        disabled={isDisabled}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={styles.primaryButtonText}>{nextLabel}</Text>
            <Ionicons name={nextLabel === 'Finish' ? 'checkmark-circle-outline' : 'arrow-forward'} size={18} color={colors.white} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ViewNavigationRow({ step, onBack, onNext }) {
  const canGoBack = step > 0;
  const canGoNext = step < STEPS.length - 1;

  if (!canGoBack && !canGoNext) return null;

  return (
    <View style={styles.actions}>
      <View style={styles.secondaryActionRow}>
        {canGoBack && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.8} accessibilityRole="button">
            <Ionicons name="arrow-back" size={16} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Previous</Text>
          </TouchableOpacity>
        )}
        {canGoNext && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onNext} activeOpacity={0.8} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function EditEmployeeScreen({ navigation }) {
  const { token, refreshUserIdentity } = useAuth();
  const insets = useSafeAreaInsets();
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [profile, setProfile] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [personal, setPersonal] = useState(EMPTY_PERSONAL);
  const [bank, setBank] = useState(EMPTY_BANK);
  const [education, setEducation] = useState([EMPTY_EDUCATION]);
  const [experience, setExperience] = useState([EMPTY_EXPERIENCE]);
  const [documents, setDocuments] = useState([]);
  const [documentChecklist, setDocumentChecklist] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [agreementTemplates, setAgreementTemplates] = useState([]);
  const [pendingAgreements, setPendingAgreements] = useState([]);
  const [signedAgreements, setSignedAgreements] = useState([]);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [pendingAgreementCount, setPendingAgreementCount] = useState(0);
  const [signedAgreementCount, setSignedAgreementCount] = useState(0);
  const [documentType, setDocumentType] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [agreementForm, setAgreementForm] = useState({ agreementId: '', signatureName: '', signedLocation: '', signatureFile: null });
  const [activeDocumentTab, setActiveDocumentTab] = useState('documents');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isSavingDocumentsStep, setIsSavingDocumentsStep] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [checklistError, setChecklistError] = useState('');
  const [fileAction, setFileAction] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState('');
  const [finishSuccessVisible, setFinishSuccessVisible] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [completedStepIndexes, setCompletedStepIndexes] = useState([]);
  const uploadLockRef = useRef(false);
  const agreementActionLockRef = useRef(false);
  const agreementSubmissionLockRef = useRef(false);
  const mountedRef = useRef(true);

  const documentTypeOptions = useMemo(() => {
    return documentChecklist.map((item) => ({
      label: `${getFriendlyDocumentLabel(item.documentType)}${item.uploaded ? ' - Uploaded' : ''}`,
      value: item.documentType,
      helper: item.uploaded
        ? `Status: ${getDocumentStatusText(item.status, item.uploaded)}`
        : 'Upload required',
      disabled: item.uploaded,
    }));
  }, [documentChecklist]);
  const uploadedDocumentCount = useMemo(
    () => documentChecklist.filter((item) => item.uploaded).length,
    [documentChecklist]
  );
  const totalDocumentCount = documentChecklist.length;
  const remainingDocumentCount = Math.max(totalDocumentCount - uploadedDocumentCount, 0);
  const documentProgress = totalDocumentCount ? uploadedDocumentCount / totalDocumentCount : 0;
  const agreementOptions = useMemo(
    () => agreements.map((item) => ({
      label: item.agreementName || item.agreementType || `Agreement ${item.id}`,
      value: item.agreementId || item.id,
      helper: item.status,
    })),
    [agreements]
  );
  const markStepCompleted = useCallback((stepIndex) => {
    setCompletedStepIndexes((current) => (
      current.includes(stepIndex) ? current : [...current, stepIndex]
    ));
  }, []);

  const clearCompletedSteps = useCallback(() => {
    setCompletedStepIndexes([]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [step]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(''), 2600);
    return () => clearTimeout(timer);
  }, [success]);

  usePreventRemove(isEditMode && dirty, ({ data }) => {
    Alert.alert('Discard unsaved changes?', 'Your current step has unsaved changes.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const applyProfile = useCallback((nextProfile) => {
    setProfile(nextProfile);
    setEmployeeId(nextProfile.employeeId);
    setPersonal(nextProfile.personal);
    setBank(nextProfile.bank);
    setEducation(nextProfile.education.length ? nextProfile.education : [{ ...EMPTY_EDUCATION }]);
    setExperience(nextProfile.experience.length ? nextProfile.experience : [{ ...EMPTY_EXPERIENCE }]);
    setDocuments(nextProfile.documents);
  }, []);

  const loadAgreementsForEmployee = useCallback(async (targetEmployeeId, { quiet = false, signal } = {}) => {
    if (!targetEmployeeId || !token) {
      setAgreementTemplates([]);
      setPendingAgreements([]);
      setSignedAgreements([]);
      setAgreements([]);
      setSelectedAgreement(null);
      setPendingAgreementCount(0);
      setSignedAgreementCount(0);
      return [];
    }

    if (!quiet) {
      setAgreementLoading(true);
    }
    setAgreementError('');

    try {
      const [templatesPayload, pendingPayload, signedPayload] = await Promise.all([
        getAgreementTemplates(token, { signal }),
        getPendingAgreements(targetEmployeeId, token, { signal }),
        getSignedAgreements(targetEmployeeId, token, { signal }),
      ]);

      const nextTemplates = normalizeAgreements(templatesPayload);
      const nextPending = normalizeAgreements(pendingPayload);
      const nextSigned = normalizeAgreements(signedPayload);
      const nextAgreements = mergeAgreementsWithLifecycle(nextTemplates, nextPending, nextSigned);

      // if (__DEV__) {
      //   console.log('[Employee Agreements]', {
      //     employeeId: targetEmployeeId,
      //     templates: nextTemplates.length,
      //     pending: nextPending.length,
      //     signed: nextSigned.length,
      //   });
      // }

      if (mountedRef.current && !signal?.aborted) {
        setAgreementTemplates(nextTemplates);
        setPendingAgreements(nextPending);
        setSignedAgreements(nextSigned);
        setAgreements(nextAgreements);
        setPendingAgreementCount(nextPending.length);
        setSignedAgreementCount(nextSigned.length);

        setAgreementForm((current) => {
          const selectedId = current.agreementId;
          const stillExists = selectedId && nextAgreements.some((item) => String(item.agreementId || item.id) === String(selectedId));
          return stillExists
            ? current
            : { agreementId: '', signatureName: '', signedLocation: '', signatureFile: null };
        });
      }

      return nextAgreements;
    } catch (error) {
      if (mountedRef.current && !signal?.aborted) {
        setAgreementError(error?.message || 'Unable to load employee agreements.');
      }
      throw error;
    } finally {
      if (mountedRef.current && !quiet && !signal?.aborted) {
        setAgreementLoading(false);
      }
    }
  }, [token]);

  const loadAll = useCallback(async ({ refresh = false } = {}) => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setApiError('');
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [profileResult, departmentResult] = await Promise.allSettled([
        getMyEmployeeDetails(token, { signal: controller.signal }),
        getDepartments(token, { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      if (departmentResult.status === 'fulfilled') {
        setDepartments(normalizeDepartments(departmentResult.value));
      }

      if (profileResult.status !== 'fulfilled') {
        throw profileResult.reason;
      }

      const normalizedProfile = normalizeEmployeeProfile(profileResult.value);
      applyProfile(normalizedProfile);

      if (normalizedProfile.employeeId) {
        const [documentResult, checklistResult, agreementsResult] = await Promise.allSettled([
          getEmployeeDocuments(normalizedProfile.employeeId, token, { signal: controller.signal }),
          getDocumentChecklist(normalizedProfile.employeeId, token, { signal: controller.signal }),
          loadAgreementsForEmployee(normalizedProfile.employeeId, { quiet: true, signal: controller.signal }),
        ]);

        if (documentResult.status === 'fulfilled') {
          setDocuments(normalizeDocuments(documentResult.value));
        }
        if (checklistResult.status === 'fulfilled') {
          setDocumentChecklist(normalizeDocumentChecklist(checklistResult.value));
        }
        if (agreementsResult.status !== 'fulfilled' && mountedRef.current) {
          setAgreementError(agreementsResult.reason?.message || 'Unable to load employee agreements.');
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setApiError(error?.message || 'Unable to load employee profile.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
        setDirty(false);
      }
    }
  }, [applyProfile, loadAgreementsForEmployee, token]);

  const refreshDocuments = useCallback(async ({ quiet = false } = {}) => {
    if (!employeeId || !token) {
      return { documents: [], checklist: [] };
    }

    if (!quiet) {
      setIsLoadingDocuments(true);
      setIsLoadingChecklist(true);
    }
    setDocumentError('');
    setChecklistError('');

    try {
      const [documentsResult, checklistResult] = await Promise.allSettled([
        getEmployeeDocuments(employeeId, token),
        getDocumentChecklist(employeeId, token),
      ]);

      let nextDocuments = documents;
      let nextChecklist = documentChecklist;

      if (documentsResult.status === 'fulfilled') {
        nextDocuments = normalizeDocuments(documentsResult.value);
        if (mountedRef.current) {
          setDocuments(nextDocuments);
        }
      } else if (mountedRef.current) {
        setDocumentError(documentsResult.reason?.message || 'Unable to refresh uploaded documents.');
      }

      if (checklistResult.status === 'fulfilled') {
        nextChecklist = normalizeDocumentChecklist(checklistResult.value);
        if (mountedRef.current) {
          setDocumentChecklist(nextChecklist);
        }
      } else if (mountedRef.current) {
        setChecklistError(checklistResult.reason?.message || 'Unable to load document checklist.');
      }

      if (documentsResult.status !== 'fulfilled' || checklistResult.status !== 'fulfilled') {
        throw new Error('Unable to refresh document details.');
      }

      return {
        documents: nextDocuments,
        checklist: nextChecklist,
      };
    } finally {
      if (mountedRef.current && !quiet) {
        setIsLoadingDocuments(false);
        setIsLoadingChecklist(false);
      }
    }
  }, [documentChecklist, documents, employeeId, token]);

  useEffect(() => {
    loadAll();
    return () => abortRef.current?.abort();
  }, [loadAll]);

  useEffect(() => {
    if (step === 4 && activeDocumentTab === 'documents' && employeeId && token) {
      refreshDocuments({ quiet: true }).catch(() => {});
    }
    if (step === 4 && activeDocumentTab === 'agreements' && employeeId && token) {
      loadAgreementsForEmployee(employeeId).catch(() => {});
    }
    // Intentionally tied to the visible Step 5 tab instead of every document/agreement state change.
  }, [activeDocumentTab, employeeId, loadAgreementsForEmployee, step, token]);

  useEffect(() => {
    const nextAgreement = agreements.find((item) =>
      String(item.agreementId || item.id) === String(agreementForm.agreementId)
    ) || null;
    setSelectedAgreement(nextAgreement);
  }, [agreementForm.agreementId, agreements]);

  const handleRefresh = useCallback(() => {
    if (isEditMode && dirty) {
      Alert.alert('Unsaved changes', 'Save or discard your changes before refreshing employee details.');
      return;
    }
    loadAll({ refresh: true });
  }, [dirty, isEditMode, loadAll]);

  const enterEditMode = useCallback(() => {
    setErrors({});
    setApiError('');
    setSuccess('');
    clearCompletedSteps();
    setIsEditMode(true);
  }, [clearCompletedSteps]);

  const exitEditMode = useCallback(() => {
    const finishExit = () => {
      setErrors({});
      setApiError('');
      setSuccess('');
      setDirty(false);
      setDocumentType('');
      setSelectedFile(null);
      setAgreementForm({ agreementId: '', signatureName: '', signedLocation: '', signatureFile: null });
      clearCompletedSteps();
      setIsEditMode(false);
      loadAll({ refresh: true });
    };

    if (!dirty) {
      finishExit();
      return;
    }

    Alert.alert('Discard unsaved changes?', 'Your current step has unsaved changes.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: finishExit },
    ]);
  }, [clearCompletedSteps, dirty, loadAll]);

  const updatePersonal = (key, value) => {
    if (!isEditMode) return;
    setPersonal((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateBank = (key, value) => {
    if (!isEditMode) return;
    setBank((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateList = (setter, index, key, value) => {
    if (!isEditMode) return;
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
    setDirty(true);
  };

  const goToStep = (targetStep) => {
    if (isEditMode && dirty) {
      Alert.alert('Discard unsaved changes?', 'Your current step has unsaved changes.', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setDirty(false);
            setStep(targetStep);
            setSuccess('');
          },
        },
      ]);
      return;
    }
    setSuccess('');
    setStep(targetStep);
  };

  const afterSave = async ({ completedStep, nextStep, message }) => {
    await loadAll({ refresh: true });
    setDirty(false);
    setSuccess(message);
    markStepCompleted(completedStep);
    setMaxStep((current) => Math.max(current, nextStep));
    setStep(nextStep);
  };

  const validatePersonal = () => {
    const next = {};
    if (!personal.employeeId.trim()) next.employeeId = 'Employee ID is required.';
    if (!personal.firstName.trim()) next.firstName = 'First name is required.';
    if (!personal.lastName.trim()) next.lastName = 'Last name is required.';
    if (!personal.gender) next.gender = 'Gender is required.';
    if (!personal.maritalStatus) next.maritalStatus = 'Marital status is required.';
    if (!personal.dob) next.dob = 'Date of birth is required.';
    if (!/^\d{10}$/.test(personal.phone.trim())) next.phone = 'Phone number must be 10 digits.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email.trim())) next.email = 'Enter a valid email.';
    if (!/^\d{12}$/.test(personal.aadhaar.trim())) next.aadhaar = 'Aadhaar must be 12 digits.';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(personal.pan.trim().toUpperCase())) next.pan = 'Enter a valid PAN.';
    if (!personal.bloodGroup) next.bloodGroup = 'Blood group is required.';
    if (!personal.department) next.department = 'Department is required.';
    if (!personal.designation) next.designation = 'Designation is required.';
    if (!personal.joiningDate) next.joiningDate = 'Date of joining is required.';
    ['houseNo', 'street', 'city', 'district', 'state', 'country'].forEach((key) => {
      if (!personal[key].trim()) next[key] = 'Required.';
    });
    if (!/^\d{6}$/.test(personal.pincode.trim())) next.pincode = 'Pincode must be 6 digits.';
    setErrors(next);
    return next;
  };

  const validateBank = () => {
    const next = {};
    const finalBank = bank.bankName === 'Others' ? bank.manualBank : bank.bankName;
    if (!finalBank.trim()) next.bankName = 'Bank name is required.';
    if (!bank.accountHolder.trim()) next.accountHolder = 'Account holder name is required.';
    if (!bank.accountNumber.trim()) next.accountNumber = 'Account number is required.';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc.trim().toUpperCase())) next.ifsc = 'Enter a valid IFSC code.';
    if (!bank.branch.trim()) next.branch = 'Branch name is required.';
    setErrors(next);
    return next;
  };

  const validateEducation = () => {
    const next = {};
    const seen = new Set();
    education.forEach((item, index) => {
      const filled = Object.values(item).some((value) => String(value || '').trim());
      if (!filled) return;
      const degree = item.qualification === 'Other' ? item.customQualification : item.qualification;
      const rowErrors = {};
      if (!degree.trim()) rowErrors.qualification = 'Qualification required.';
      if (!item.university.trim()) rowErrors.university = 'University required.';
      if (!/^\d{4}$/.test(item.year.trim())) rowErrors.year = 'Valid year required.';
      if (!item.percentage.trim()) rowErrors.percentage = 'Percentage/CGPA required.';
      if (!item.specialization.trim()) rowErrors.specialization = 'Specialization required.';
      const duplicateKey = `${degree.toLowerCase()}::${item.university.trim().toLowerCase()}::${item.year.trim()}`;
      if (degree && item.university && item.year && seen.has(duplicateKey)) rowErrors.duplicate = 'Duplicate education entry.';
      seen.add(duplicateKey);
      if (Object.keys(rowErrors).length) next[`education-${index}`] = rowErrors;
    });
    setErrors(next);
    return next;
  };

  const validateExperience = () => {
    const next = {};
    experience.forEach((item, index) => {
      const filled = Object.values(item).some((value) => String(value || '').trim());
      if (!filled) return;
      const rowErrors = {};
      if (!item.company.trim()) rowErrors.company = 'Company required.';
      if (!item.designation.trim()) rowErrors.designation = 'Designation required.';
      if (!item.fromDate) rowErrors.fromDate = 'From date required.';
      if (!item.toDate) rowErrors.toDate = 'To date required.';
      if (item.fromDate && item.toDate && new Date(`${item.toDate}T00:00:00`) < new Date(`${item.fromDate}T00:00:00`)) {
        rowErrors.toDate = 'To date cannot be before from date.';
      }
      if (!item.reason.trim()) rowErrors.reason = 'Reason required.';
      if (!item.description.trim()) rowErrors.description = 'Description required.';
      if (Object.keys(rowErrors).length) next[`experience-${index}`] = rowErrors;
    });
    setErrors(next);
    return next;
  };

  const savePersonal = async () => {
    if (!isEditMode) return;
    const next = validatePersonal();
    if (Object.keys(next).length) return Alert.alert('Validation', firstError(next));
    setSaving(true);
    setApiError('');
    try {
      const payload = buildPersonalPayload(personal);
      await savePersonalInfo(payload, personal.employeeId, profile?.hasPersonal, token);
      setEmployeeId(personal.employeeId);
      await afterSave({
        completedStep: 0,
        nextStep: 1,
        message: 'Personal information updated.',
      });
    } catch (error) {
      setApiError(error?.message || 'Unable to update personal information.');
    } finally {
      setSaving(false);
    }
  };

  const saveBank = async ({ skip = false } = {}) => {
    if (!isEditMode) return;
    if (skip) return goToStep(2);
    const next = validateBank();
    if (Object.keys(next).length) return Alert.alert('Validation', firstError(next));
    setSaving(true);
    setApiError('');
    try {
      await saveBankInfo(buildBankPayload(bank, employeeId), employeeId, profile?.hasBank, token);
      await afterSave({
        completedStep: 1,
        nextStep: 2,
        message: 'Bank information updated.',
      });
    } catch (error) {
      setApiError(error?.message || 'Unable to update bank information.');
    } finally {
      setSaving(false);
    }
  };

  const saveEducation = async () => {
    if (!isEditMode) return;
    const next = validateEducation();
    if (Object.keys(next).length) return Alert.alert('Validation', 'Please complete or remove highlighted education entries.');
    setSaving(true);
    setApiError('');
    try {
      await saveEducationCollection(educationPayload(education, employeeId), employeeId, profile?.hasEducation, token);
      await afterSave({
        completedStep: 2,
        nextStep: 3,
        message: 'Education information updated.',
      });
    } catch (error) {
      setApiError(error?.message || 'Unable to update education information.');
    } finally {
      setSaving(false);
    }
  };

  const saveExperience = async ({ skip = false } = {}) => {
    if (!isEditMode) return;
    if (skip) return goToStep(4);
    const next = validateExperience();
    if (Object.keys(next).length) return Alert.alert('Validation', 'Please complete or remove highlighted experience entries.');
    setSaving(true);
    setApiError('');
    try {
      await saveExperienceCollection(experiencePayload(experience, employeeId), employeeId, profile?.hasExperience, token);
      await afterSave({
        completedStep: 3,
        nextStep: 4,
        message: 'Experience information updated.',
      });
    } catch (error) {
      setApiError(error?.message || 'Unable to update experience information.');
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = async ({ signature = false } = {}) => {
    if (!isEditMode) return;
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: signature ? ['image/png', 'image/jpeg'] : ['application/pdf', 'image/png', 'image/jpeg'],
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;
    const maxSize = signature ? MAX_SIGNATURE_SIZE : MAX_DOCUMENT_SIZE;
    if (file.size && file.size > maxSize) {
      Alert.alert('File too large', signature ? 'Signature image must be 500KB or less.' : 'Document must be 500KB or less.');
      return;
    }
    if (!signature && !isSupportedDocumentFile(file)) {
      Alert.alert('Unsupported file', 'Please select a PDF, JPG, JPEG, or PNG file.');
      return;
    }
    if (signature && file.mimeType && !['image/png', 'image/jpeg', 'image/jpg'].includes(file.mimeType)) {
      Alert.alert('Unsupported file', 'Please select a PNG or JPG signature image.');
      return;
    }
    if (signature) {
      setAgreementForm((current) => ({ ...current, signatureFile: file }));
    } else {
      setSelectedFile(file);
    }
    setDirty(true);
  };

  const refreshAndVerifyDocuments = useCallback(async (uploadedDocumentType) => {
    const uploadedTypeKey = normalizeDocumentType(uploadedDocumentType);
    const attempts = [0, 500, 1000];

    for (const waitMs of attempts) {
      if (waitMs) {
        await delay(waitMs);
      }

      let refreshed = null;
      try {
        refreshed = await refreshDocuments({ quiet: true });
      } catch {
        refreshed = null;
      }

      const uploadConfirmed = Boolean(refreshed) && (
        refreshed.documents.some((document) =>
          normalizeDocumentType(document.documentType) === uploadedTypeKey
        ) || refreshed.checklist.some((item) =>
          normalizeDocumentType(item.documentType) === uploadedTypeKey && item.uploaded
        )
      );

      if (uploadConfirmed) {
        return true;
      }
    }

    return false;
  }, [refreshDocuments]);

  const uploadDocument = async () => {
    if (!isEditMode) return;
    if (uploadLockRef.current || isUploadingDocument) return;
    if (!employeeId) return Alert.alert('Employee ID missing', 'Employee ID is unavailable. Refresh your profile and try again.');
    if (!documentType) return Alert.alert('Document type required', 'Select a document type.');
    if (!selectedFile) return Alert.alert('File required', 'Select a document file.');
    if (!isSupportedDocumentFile(selectedFile)) return Alert.alert('Unsupported file', 'Please select a PDF, JPG, JPEG, or PNG file.');
    if (selectedFile.size && selectedFile.size > MAX_DOCUMENT_SIZE) return Alert.alert('File too large', 'Document must be 500KB or less.');

    const selectedTypeKey = normalizeDocumentType(documentType);
    if (
      documentChecklist.some((item) => normalizeDocumentType(item.documentType) === selectedTypeKey && item.uploaded) ||
      documents.some((item) => normalizeDocumentType(item.documentType) === selectedTypeKey)
    ) {
      refreshDocuments({ quiet: true }).catch(() => {});
      return Alert.alert('Duplicate document', 'This document type is already uploaded.');
    }

    uploadLockRef.current = true;
    setIsUploadingDocument(true);
    setDocumentError('');
    setChecklistError('');
    try {
      await uploadEmployeeDocument({ employeeId, documentType, file: selectedFile }, token);
      const verified = await refreshAndVerifyDocuments(documentType);

      if (!verified) {
        throw new Error('The document upload was accepted, but the document list could not be refreshed. Pull down to verify the upload before trying again.');
      }

      setDocumentType('');
      setSelectedFile(null);
      markStepCompleted(4);
      setDirty(false);
      setSuccess('Document uploaded successfully.');
      Alert.alert('Document Uploaded', 'Your document was uploaded successfully.');
    } catch (error) {
      const message = error?.message || 'Unable to upload document.';
      if (message.toLowerCase().includes('already uploaded')) {
        refreshDocuments({ quiet: true }).catch(() => {});
      }
      setDocumentError(message);
    } finally {
      uploadLockRef.current = false;
      setIsUploadingDocument(false);
    }
  };

  const openFile = async (file) => {
    if (Platform.OS === 'android' && file.contentType?.includes('pdf')) {
      try {
        const contentUri = await FileSystem.getContentUriAsync(file.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: 'application/pdf',
        });
        return;
      } catch {
        await Sharing.shareAsync(file.uri, { mimeType: file.contentType, dialogTitle: 'Open document' });
        return;
      }
    }
    await Sharing.shareAsync(file.uri, { mimeType: file.contentType, dialogTitle: 'Open document' });
  };

  const handleDocumentAction = async (document, type) => {
    if (fileAction) return;
    setFileAction(`${type}-${document.id}`);
    try {
      const file = type === 'view'
        ? await viewEmployeeDocument(document.id, token, document.fileName)
        : await downloadEmployeeDocument(document.id, token, document.fileName);
      if (type === 'view') {
        await openFile(file);
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: file.contentType, dialogTitle: 'Save or share document' });
        Alert.alert('Document ready', 'Document downloaded and ready to save or share.');
      }
    } catch (error) {
      Alert.alert('Document action failed', error?.message || 'Unable to complete document action.');
    } finally {
      setFileAction('');
    }
  };

  const confirmDeleteDocument = (document) => {
    if (!isEditMode) return;
    Alert.alert(`Delete ${getFriendlyDocumentLabel(document.documentType)}?`, 'This removes the uploaded document. You can upload another file afterward.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setFileAction(`delete-${document.id}`);
          try {
            await deleteEmployeeDocument(document.id, token);
            const refreshed = await refreshDocuments({ quiet: true });
            const deleted = !refreshed.documents.some((item) => String(item.id) === String(document.id));
            if (!deleted) {
              throw new Error('The document could not be confirmed as deleted. Please refresh and try again.');
            }
            markStepCompleted(4);
          } catch (error) {
            Alert.alert('Delete failed', error?.message || 'Unable to delete document.');
          } finally {
            setFileAction('');
          }
        },
      },
    ]);
  };

  const handleAgreementAction = async (agreement, type) => {
    if (!agreement || agreementActionLockRef.current || fileAction) return;
    const actionId = getAgreementDisplayId(agreement);
    const actionKey = `${type}-${actionId}`;
    agreementActionLockRef.current = true;
    setFileAction(actionKey);
    try {
      const signed = isAgreementSigned(agreement);
      if ((type === 'signed' || type === 'download') && !signed) {
        Alert.alert('Signed agreement unavailable', 'This agreement has not been signed yet.');
        return;
      }

      const file =
        type === 'view'
          ? await viewAgreementDocument(agreement, token, getAgreementFileName(agreement))
          : type === 'signed'
            ? await viewSignedAgreementDocument(agreement, token, getAgreementFileName(agreement, true))
            : await downloadSignedAgreementDocument(agreement, token, getAgreementFileName(agreement, true));
      if (type === 'download') {
        await Sharing.shareAsync(file.uri, { mimeType: file.contentType, dialogTitle: 'Save or share agreement' });
      } else {
        await openFile(file);
      }
    } catch (error) {
      Alert.alert('Agreement action failed', error?.message || 'Unable to complete agreement action.');
    } finally {
      agreementActionLockRef.current = false;
      setFileAction('');
    }
  };

  const submitAgreement = async () => {
    if (agreementSubmissionLockRef.current || saving) return;
    if (!isEditMode) {
      Alert.alert('Edit required', 'Tap Edit before submitting an agreement.');
      return;
    }
    const agreement = selectedAgreement || agreements.find((item) => String(item.agreementId || item.id) === String(agreementForm.agreementId));
    if (!agreement) return Alert.alert('Agreement required', 'Select an agreement.');
    if (isAgreementSigned(agreement)) return Alert.alert('Already signed', 'This agreement has already been signed.');
    if (!agreement.agreementCode) return Alert.alert('Agreement code missing', 'Agreement code is unavailable. Refresh and try again.');
    if (!employeeId) return Alert.alert('Employee ID missing', 'Employee ID is unavailable. Refresh your profile and try again.');
    if (!agreementForm.signatureName.trim()) return Alert.alert('Signature name required', 'Enter your signature name.');
    if (!agreementForm.signedLocation.trim()) return Alert.alert('Signed location required', 'Enter the signed location.');
    if (!agreementForm.signatureFile) return Alert.alert('Signature image required', 'Select a signature image.');
    if (agreementForm.signatureFile.mimeType && !['image/png', 'image/jpeg', 'image/jpg'].includes(agreementForm.signatureFile.mimeType)) {
      return Alert.alert('Unsupported file', 'Please select a PNG or JPG signature image.');
    }
    agreementSubmissionLockRef.current = true;
    setSaving(true);
    setAgreementError('');
    setApiError('');
    try {
      await signEmployeeAgreement({
        agreementCode: agreement.agreementCode,
        employeeId,
        signatureName: agreementForm.signatureName.trim(),
        signedLocation: agreementForm.signedLocation.trim(),
        signatureFile: agreementForm.signatureFile,
      }, token);
      const selectedId = agreement.agreementId || agreement.id;
      setAgreementForm({ agreementId: selectedId, signatureName: '', signedLocation: '', signatureFile: null });
      await loadAgreementsForEmployee(employeeId, { quiet: true });
      markStepCompleted(4);
      setDirty(false);
      setSuccess('Agreement signed successfully.');
    } catch (error) {
      setAgreementError(error?.message || 'Unable to sign agreement.');
    } finally {
      agreementSubmissionLockRef.current = false;
      setSaving(false);
    }
  };

  const continueFromDocuments = async () => {
    if (isUploadingDocument || isSavingDocumentsStep) return;
    if (selectedFile || documentType) {
      Alert.alert(
        'Upload pending',
        'You selected a file but have not uploaded it yet. Upload it or remove the selection before continuing.'
      );
      return;
    }

    setIsSavingDocumentsStep(true);
    try {
      setDirty(false);
      setMaxStep((current) => Math.max(current, 5));
      setStep(5);
    } finally {
      setIsSavingDocumentsStep(false);
    }
  };

  const finishReview = async () => {
    if (!isEditMode) return;
    if (saving) return;
    setSaving(true);
    setApiError('');
    try {
      const latestProfile = normalizeEmployeeProfile(await getMyEmployeeDetails(token));
      applyProfile(latestProfile);
      await refreshUserIdentity?.();
      setDirty(false);
      setSuccess('');
      setIsEditMode(false);
      clearCompletedSteps();
      setStep(0);
      setMaxStep((current) => Math.max(current, 5));
      setFinishSuccessVisible(true);
      setTimeout(() => setFinishSuccessVisible(false), 1800);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
    } catch (error) {
      setApiError(error?.message || 'Unable to confirm your latest employee profile.');
    } finally {
      setSaving(false);
    }
  };

  const ReadOnlyField = useCallback(({ editable = true, ...props }) => (
    <Field {...props} editable={isEditMode && editable} />
  ), [isEditMode]);

  const ReadOnlyOptionField = useCallback((props) => (
    <OptionField {...props} disabled={!isEditMode} />
  ), [isEditMode]);

  const ReadOnlySelectionField = useCallback(({ disabled = false, ...props }) => (
    <SelectionField {...props} disabled={!isEditMode || disabled} />
  ), [isEditMode]);

  const ReadOnlyDateField = useCallback((props) => (
    <DateField {...props} disabled={!isEditMode} />
  ), [isEditMode]);

  const StepActions = useCallback(({ onBack, onSkip, onNext, nextLabel, loading = saving, disabled = false }) => (
    isEditMode ? (
      <ActionRow
        step={step}
        loading={loading}
        disabled={disabled}
        onBack={onBack}
        onSkip={onSkip}
        onNext={onNext}
        nextLabel={nextLabel}
      />
    ) : (
      <ViewNavigationRow step={step} onBack={() => goToStep(step - 1)} onNext={() => goToStep(step + 1)} />
    )
  ), [goToStep, isEditMode, saving, step]);

  const renderPersonal = () => (
    <>
      <Section title="Personal Information">
        <ReadOnlyField label="Employee ID" value={personal.employeeId} onChangeText={(value) => updatePersonal('employeeId', value)} error={errors.employeeId} editable={!employeeId} autoCapitalize="characters" />
        <ReadOnlyField label="First Name" value={personal.firstName} onChangeText={(value) => updatePersonal('firstName', value)} error={errors.firstName} />
        <ReadOnlyField label="Middle Name" value={personal.middleName} onChangeText={(value) => updatePersonal('middleName', value)} />
        <ReadOnlyField label="Last Name" value={personal.lastName} onChangeText={(value) => updatePersonal('lastName', value)} error={errors.lastName} />
        <ReadOnlyOptionField label="Gender" value={personal.gender} options={GENDER_OPTIONS} onChange={(value) => updatePersonal('gender', value)} error={errors.gender} />
        <ReadOnlyOptionField label="Marital Status" value={personal.maritalStatus} options={MARITAL_OPTIONS} onChange={(value) => updatePersonal('maritalStatus', value)} error={errors.maritalStatus} />
        <ReadOnlyDateField label="Date of Birth" value={personal.dob} onChange={(value) => updatePersonal('dob', value)} error={errors.dob} />
        <ReadOnlyField label="Phone Number" value={personal.phone} onChangeText={(value) => updatePersonal('phone', value.replace(/[^\d]/g, '').slice(0, 10))} error={errors.phone} keyboardType="phone-pad" />
        <ReadOnlyField label="Email" value={personal.email} onChangeText={(value) => updatePersonal('email', value)} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        <ReadOnlyField label="Aadhaar Number" value={personal.aadhaar} onChangeText={(value) => updatePersonal('aadhaar', value.replace(/[^\d]/g, '').slice(0, 12))} error={errors.aadhaar} keyboardType="number-pad" />
        <ReadOnlyField label="PAN Number" value={personal.pan} onChangeText={(value) => updatePersonal('pan', value.toUpperCase().slice(0, 10))} error={errors.pan} autoCapitalize="characters" />
        <ReadOnlyOptionField label="Blood Group" value={personal.bloodGroup} options={BLOOD_GROUP_OPTIONS} onChange={(value) => updatePersonal('bloodGroup', value)} error={errors.bloodGroup} />
      </Section>
      <Section title="Employment Information">
        <ReadOnlySelectionField label="Department" value={personal.department} options={departments.length ? departments : [personal.department].filter(Boolean)} onChange={(value) => updatePersonal('department', value)} error={errors.department} placeholder="Select department" />
        <ReadOnlySelectionField label="Designation" value={personal.designation} options={DESIGNATION_OPTIONS} onChange={(value) => updatePersonal('designation', value)} error={errors.designation} placeholder="Select designation" />
        <ReadOnlyDateField label="Date of Joining" value={personal.joiningDate} onChange={(value) => updatePersonal('joiningDate', value)} error={errors.joiningDate} />
      </Section>
      <Section title="Address Information">
        <ReadOnlyField label="House Number" value={personal.houseNo} onChangeText={(value) => updatePersonal('houseNo', value)} error={errors.houseNo} />
        <ReadOnlyField label="Street / Area" value={personal.street} onChangeText={(value) => updatePersonal('street', value)} error={errors.street} />
        <ReadOnlyField label="City / Village" value={personal.city} onChangeText={(value) => updatePersonal('city', value)} error={errors.city} />
        <ReadOnlyField label="District" value={personal.district} onChangeText={(value) => updatePersonal('district', value)} error={errors.district} />
        <ReadOnlyField label="State" value={personal.state} onChangeText={(value) => updatePersonal('state', value)} error={errors.state} />
        <ReadOnlyField label="Country" value={personal.country} onChangeText={(value) => updatePersonal('country', value)} error={errors.country} />
        <ReadOnlyField label="Pincode" value={personal.pincode} onChangeText={(value) => updatePersonal('pincode', value.replace(/[^\d]/g, '').slice(0, 6))} error={errors.pincode} keyboardType="number-pad" />
      </Section>
      <StepActions onBack={() => goToStep(step - 1)} onNext={savePersonal} />
    </>
  );

  const renderBank = () => (
    <>
      <Section title="Bank Information">
        <ReadOnlyField label="Customer ID" value={bank.customerId} onChangeText={(value) => updateBank('customerId', value)} />
        <ReadOnlySelectionField label="Bank Name" value={bank.bankName} options={BANK_OPTIONS} onChange={(value) => updateBank('bankName', value)} error={errors.bankName} placeholder="Select bank" />
        {bank.bankName === 'Others' && <ReadOnlyField label="Enter Bank Name" value={bank.manualBank} onChangeText={(value) => updateBank('manualBank', value)} error={errors.bankName} />}
        <ReadOnlyField label="Account Holder Name" value={bank.accountHolder} onChangeText={(value) => updateBank('accountHolder', value)} error={errors.accountHolder} />
        <ReadOnlyField label="Account Number" value={bank.accountNumber} onChangeText={(value) => updateBank('accountNumber', value.replace(/[^\d]/g, ''))} error={errors.accountNumber} keyboardType="number-pad" />
        <ReadOnlyField label="IFSC Code" value={bank.ifsc} onChangeText={(value) => updateBank('ifsc', value.toUpperCase().slice(0, 11))} error={errors.ifsc} autoCapitalize="characters" />
        <ReadOnlyField label="Branch Name" value={bank.branch} onChangeText={(value) => updateBank('branch', value)} error={errors.branch} />
        <ReadOnlyField label="UAN Number" value={bank.uan} onChangeText={(value) => updateBank('uan', value)} />
        <ReadOnlyField label="PF Account Number" value={bank.pf} onChangeText={(value) => updateBank('pf', value)} />
      </Section>
      <StepActions onBack={() => goToStep(step - 1)} onSkip={() => saveBank({ skip: true })} onNext={() => saveBank()} />
    </>
  );

  const renderEducation = () => (
    <>
      {education.map((item, index) => {
        const rowErrors = errors[`education-${index}`] || {};
        return (
          <Section key={`education-${index}`} title={`Education ${index + 1}`}>
            <ReadOnlySelectionField label="Qualification" value={item.qualification} options={QUALIFICATION_OPTIONS} onChange={(value) => updateList(setEducation, index, 'qualification', value)} error={rowErrors.qualification} placeholder="Select qualification" />
            {item.qualification === 'Other' && <ReadOnlyField label="Custom Qualification" value={item.customQualification} onChangeText={(value) => updateList(setEducation, index, 'customQualification', value)} error={rowErrors.qualification} />}
            <ReadOnlyField label="University / Board" value={item.university} onChangeText={(value) => updateList(setEducation, index, 'university', value)} error={rowErrors.university} />
            <ReadOnlyField label="Year of Passing" value={item.year} onChangeText={(value) => updateList(setEducation, index, 'year', value.replace(/[^\d]/g, '').slice(0, 4))} error={rowErrors.year} keyboardType="number-pad" />
            <ReadOnlyField label="Percentage / CGPA" value={item.percentage} onChangeText={(value) => updateList(setEducation, index, 'percentage', value)} error={rowErrors.percentage} keyboardType="decimal-pad" />
            <ReadOnlyField label="Specialization" value={item.specialization} onChangeText={(value) => updateList(setEducation, index, 'specialization', value)} error={rowErrors.specialization} />
            {!!rowErrors.duplicate && <Text style={styles.errorText}>{rowErrors.duplicate}</Text>}
            {isEditMode && <TouchableOpacity style={styles.removeButton} onPress={() => { setEducation((current) => current.filter((_, i) => i !== index)); setDirty(true); }} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.employeeEdit.removeText} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>}
          </Section>
        );
      })}
      {isEditMode && <TouchableOpacity style={styles.addButton} onPress={() => { setEducation((current) => [...current, { ...EMPTY_EDUCATION }]); setDirty(true); }} accessibilityRole="button">
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.addText}>Add Another Education</Text>
      </TouchableOpacity>}
      <StepActions onBack={() => goToStep(step - 1)} onNext={saveEducation} />
    </>
  );

  const renderExperience = () => (
    <>
      {experience.map((item, index) => {
        const rowErrors = errors[`experience-${index}`] || {};
        return (
          <Section key={`experience-${index}`} title={`Experience ${index + 1}`}>
            <ReadOnlyField label="Company Name" value={item.company} onChangeText={(value) => updateList(setExperience, index, 'company', value)} error={rowErrors.company} />
            <ReadOnlyField label="Designation" value={item.designation} onChangeText={(value) => updateList(setExperience, index, 'designation', value)} error={rowErrors.designation} />
            <ReadOnlyDateField label="From Date" value={item.fromDate} onChange={(value) => updateList(setExperience, index, 'fromDate', value)} error={rowErrors.fromDate} />
            <ReadOnlyDateField label="To Date" value={item.toDate} onChange={(value) => updateList(setExperience, index, 'toDate', value)} error={rowErrors.toDate} />
            <ReadOnlyField label="Years of Experience" value={String(experienceYears(item.fromDate, item.toDate))} editable={false} />
            <ReadOnlyField label="Reason for Leaving" value={item.reason} onChangeText={(value) => updateList(setExperience, index, 'reason', value)} error={rowErrors.reason} />
            <ReadOnlyField label="Description" value={item.description} onChangeText={(value) => updateList(setExperience, index, 'description', value)} error={rowErrors.description} multiline />
            {isEditMode && <TouchableOpacity style={styles.removeButton} onPress={() => { setExperience((current) => current.filter((_, i) => i !== index)); setDirty(true); }} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.employeeEdit.removeText} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>}
          </Section>
        );
      })}
      {isEditMode && <TouchableOpacity style={styles.addButton} onPress={() => { setExperience((current) => [...current, { ...EMPTY_EXPERIENCE }]); setDirty(true); }} accessibilityRole="button">
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.addText}>Add Another Experience</Text>
      </TouchableOpacity>}
      <StepActions onBack={() => goToStep(step - 1)} onSkip={() => saveExperience({ skip: true })} onNext={() => saveExperience()} />
    </>
  );

  const renderDocuments = () => (
    <>
      <View style={styles.tabSwitch}>
        {['documents', 'agreements'].map((tab) => {
          const active = activeDocumentTab === tab;
          return (
            <TouchableOpacity key={tab} style={[styles.tabSwitchItem, active && styles.tabSwitchItemActive]} onPress={() => setActiveDocumentTab(tab)} accessibilityRole="button">
              <Text style={[styles.tabSwitchText, active && styles.tabSwitchTextActive]}>{tab === 'documents' ? 'Employee Documents' : 'Employee Agreements'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {activeDocumentTab === 'documents' ? (
        <>
          <Section title="Documents Progress">
            {isLoadingChecklist && !documentChecklist.length ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.helperText}>Loading document checklist...</Text>
              </View>
            ) : (
              <>
                <View style={styles.documentProgressTop}>
                  <Text style={styles.documentProgressCount}>
                    {uploadedDocumentCount}/{totalDocumentCount || 0} uploaded
                  </Text>
                  <Text style={styles.documentProgressMeta}>
                    {remainingDocumentCount ? `${remainingDocumentCount} pending` : 'All checklist items uploaded'}
                  </Text>
                </View>
                <View style={styles.documentProgressTrack} accessibilityLabel={`Document progress ${uploadedDocumentCount} of ${totalDocumentCount || 0}`}>
                  <View style={[styles.documentProgressFill, { width: `${Math.round(documentProgress * 100)}%` }]} />
                </View>
                {!!checklistError && (
                  <TouchableOpacity style={styles.inlineErrorBox} onPress={() => refreshDocuments()} accessibilityRole="button">
                    <Ionicons name="alert-circle-outline" size={16} color={colors.employeeEdit.error} />
                    <Text style={styles.inlineErrorText}>{checklistError}</Text>
                    <Text style={styles.inlineRetryText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Section>

          <Section title="Required Documents">
            {documentChecklist.length ? documentChecklist.map((item) => {
              const tone = getDocumentStatusTone(item.status, item.uploaded);
              const statusColor = tone === 'success'
                ? colors.success
                : tone === 'error'
                  ? colors.employeeEdit.error
                  : tone === 'warning'
                    ? colors.warning
                    : colors.textSecondary;
              const statusBackground = tone === 'success'
                ? colors.successBackground
                : tone === 'error'
                  ? colors.dangerBackground
                  : tone === 'warning'
                    ? colors.warningBackground
                    : colors.mutedBackground;
              const rowDisabled = !isEditMode || item.uploaded || isUploadingDocument;

              return (
                <TouchableOpacity
                  key={item.documentType}
                  style={styles.checklistRow}
                  onPress={() => {
                    if (rowDisabled) return;
                    setDocumentType(item.documentType);
                    setDirty(true);
                  }}
                  disabled={rowDisabled}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: rowDisabled, selected: documentType === item.documentType }}
                >
                  <View style={[styles.checklistIcon, { backgroundColor: statusBackground }]}>
                    <Ionicons
                      name={item.uploaded ? 'checkmark-circle-outline' : 'ellipse-outline'}
                      size={20}
                      color={statusColor}
                    />
                  </View>
                  <View style={styles.checklistText}>
                    <Text style={styles.checklistTitle}>{getFriendlyDocumentLabel(item.documentType)}</Text>
                    <Text style={styles.checklistMeta}>
                      {item.uploaded ? `Uploaded - ${getDocumentStatusText(item.status, item.uploaded)}` : 'Not uploaded'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <View style={styles.emptyDocumentState}>
                <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
                <Text style={styles.emptyDocumentTitle}>No checklist available.</Text>
                <Text style={styles.emptyText}>Pull down to refresh if the checklist does not appear.</Text>
              </View>
            )}
          </Section>

          {isEditMode && (
            <Section title="Upload Document">
              <ReadOnlySelectionField
                label="Document Type"
                value={documentType}
                options={documentTypeOptions}
                onChange={(value) => {
                  setDocumentType(value);
                  setDirty(true);
                }}
                placeholder="Select pending document type"
                disabled={isUploadingDocument || isSavingDocumentsStep}
              />
              <TouchableOpacity
                style={[styles.fileButton, (isUploadingDocument || isSavingDocumentsStep) && styles.inputDisabled]}
                onPress={() => chooseFile()}
                disabled={isUploadingDocument || isSavingDocumentsStep}
                accessibilityRole="button"
                accessibilityState={{ disabled: isUploadingDocument || isSavingDocumentsStep }}
              >
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                <Text style={styles.fileButtonText}>{selectedFile?.name || 'Select PDF, JPG, JPEG or PNG'}</Text>
              </TouchableOpacity>
              <Text style={styles.helperText}>Maximum file size: 500 KB</Text>
              {!!selectedFile && (
                <View style={styles.selectedFileCard}>
                  <View style={styles.selectedFileIcon}>
                    <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.selectedFileInfo}>
                    <Text style={styles.selectedFileName} numberOfLines={1}>{selectedFile.name}</Text>
                    <Text style={styles.selectedFileMeta}>
                      {getFileExtension(selectedFile).toUpperCase() || selectedFile.mimeType || 'FILE'} - {formatFileSize(selectedFile.size)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.selectedFileRemove}
                    onPress={() => {
                      if (isUploadingDocument) return;
                      setSelectedFile(null);
                      setDirty(true);
                    }}
                    disabled={isUploadingDocument}
                    accessibilityRole="button"
                    accessibilityLabel="Remove selected document file"
                    accessibilityState={{ disabled: isUploadingDocument }}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              {!!documentError && (
                <TouchableOpacity style={styles.inlineErrorBox} onPress={() => refreshDocuments()} accessibilityRole="button">
                  <Ionicons name="alert-circle-outline" size={16} color={colors.employeeEdit.error} />
                  <Text style={styles.inlineErrorText}>{documentError}</Text>
                  <Text style={styles.inlineRetryText}>Retry</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (isUploadingDocument || isSavingDocumentsStep || !documentType || !selectedFile) && styles.buttonDisabled,
                ]}
                onPress={uploadDocument}
                disabled={isUploadingDocument || isSavingDocumentsStep || !documentType || !selectedFile}
                accessibilityRole="button"
                accessibilityState={{ disabled: isUploadingDocument || isSavingDocumentsStep || !documentType || !selectedFile, busy: isUploadingDocument }}
              >
                {isUploadingDocument ? (
                  <>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.primaryButtonText}>Uploading...</Text>
                  </>
                ) : (
                  <Text style={styles.primaryButtonText}>Upload Document</Text>
                )}
              </TouchableOpacity>
            </Section>
          )}
          <Section title="Uploaded Documents">
            {isLoadingDocuments && !documents.length ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.helperText}>Loading uploaded documents...</Text>
              </View>
            ) : documents.length ? documents.map((document) => {
              const tone = getDocumentStatusTone(document.verificationStatus, true);
              const statusColor = tone === 'success'
                ? colors.success
                : tone === 'error'
                  ? colors.employeeEdit.error
                  : colors.warning;
              const statusBackground = tone === 'success'
                ? colors.successBackground
                : tone === 'error'
                  ? colors.dangerBackground
                  : colors.warningBackground;
              const fileSizeText = formatFileSizeMB(document.fileSizeMB) !== '-'
                ? formatFileSizeMB(document.fileSizeMB)
                : formatFileSize(document.size);
              const anyFileAction = Boolean(fileAction);

              return (
                <View key={document.id} style={styles.documentCard}>
                  <View style={styles.documentCardHeader}>
                    <View style={styles.documentInfo}>
                      <Text style={styles.rowTitle}>{getFriendlyDocumentLabel(document.documentType)}</Text>
                      <Text style={styles.rowMeta}>{document.fileName}</Text>
                    </View>
                    <View style={[styles.documentStatusBadge, { backgroundColor: statusBackground }]}>
                      <Text style={[styles.documentStatusText, { color: statusColor }]}>
                        {getDocumentStatusText(document.verificationStatus, true)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.documentMetaGroup}>
                    <Text style={styles.rowMeta}>Type: {document.fileType || getFileExtension(document).toUpperCase() || '-'}</Text>
                    <Text style={styles.rowMeta}>Size: {fileSizeText}</Text>
                    <Text style={styles.rowMeta}>Uploaded: {formatDisplayDate(document.uploadedDate || document.uploadedAt)}</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.documentActionButton}
                      onPress={() => handleDocumentAction(document, 'view')}
                      disabled={anyFileAction}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: anyFileAction, busy: fileAction === `view-${document.id}` }}
                    >
                      {fileAction === `view-${document.id}` ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="eye-outline" size={17} color={colors.primary} />}
                      <Text style={styles.documentActionText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.documentActionButton}
                      onPress={() => handleDocumentAction(document, 'download')}
                      disabled={anyFileAction}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: anyFileAction, busy: fileAction === `download-${document.id}` }}
                    >
                      {fileAction === `download-${document.id}` ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="download-outline" size={17} color={colors.primary} />}
                      <Text style={styles.documentActionText}>Download</Text>
                    </TouchableOpacity>
                    {isEditMode && (
                      <TouchableOpacity
                        style={[styles.documentActionButton, styles.documentActionDanger]}
                        onPress={() => confirmDeleteDocument(document)}
                        disabled={anyFileAction || isUploadingDocument}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: anyFileAction || isUploadingDocument, busy: fileAction === `delete-${document.id}` }}
                      >
                        {fileAction === `delete-${document.id}` ? <ActivityIndicator size="small" color={colors.employeeEdit.removeText} /> : <Ionicons name="trash-outline" size={17} color={colors.employeeEdit.removeText} />}
                        <Text style={[styles.documentActionText, styles.documentActionDangerText]}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }) : (
              <View style={styles.emptyDocumentState}>
                <Ionicons name="folder-open-outline" size={22} color={colors.textSecondary} />
                <Text style={styles.emptyDocumentTitle}>No documents uploaded.</Text>
                <Text style={styles.emptyText}>
                  {isEditMode ? 'Choose a pending document type and upload the file.' : 'Uploaded documents will appear here.'}
                </Text>
              </View>
            )}
          </Section>
        </>
      ) : (
        <Section title="Employee Agreements">
          <Text style={styles.sectionDescription}>Review and sign company agreements assigned to you.</Text>

          <View style={styles.agreementCountRow}>
            <View style={styles.agreementCountChip}>
              <Text style={styles.agreementCountValue}>{pendingAgreementCount}</Text>
              <Text style={styles.agreementCountLabel}>Pending Agreements</Text>
            </View>
            <View style={styles.agreementCountChip}>
              <Text style={styles.agreementCountValue}>{signedAgreementCount}</Text>
              <Text style={styles.agreementCountLabel}>Signed Agreements</Text>
            </View>
          </View>

          {agreementLoading && !agreementTemplates.length ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.helperText}>Loading agreements...</Text>
            </View>
          ) : agreementError && !agreementTemplates.length ? (
            <TouchableOpacity
              style={styles.inlineErrorBox}
              onPress={() => loadAgreementsForEmployee(employeeId)}
              accessibilityRole="button"
            >
              <Ionicons name="alert-circle-outline" size={16} color={colors.employeeEdit.error} />
              <Text style={styles.inlineErrorText}>Unable to load employee agreements.</Text>
              <Text style={styles.inlineRetryText}>Retry</Text>
            </TouchableOpacity>
          ) : !agreementTemplates.length ? (
            <View style={styles.emptyDocumentState}>
              <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.emptyDocumentTitle}>No employee agreements are configured.</Text>
            </View>
          ) : (
            <>
              {!!agreementError && (
                <TouchableOpacity
                  style={styles.inlineErrorBox}
                  onPress={() => loadAgreementsForEmployee(employeeId)}
                  accessibilityRole="button"
                >
                  <Ionicons name="alert-circle-outline" size={16} color={colors.employeeEdit.error} />
                  <Text style={styles.inlineErrorText}>{agreementError}</Text>
                  <Text style={styles.inlineRetryText}>Retry</Text>
                </TouchableOpacity>
              )}

              <SelectionField
                label="Agreement Type"
                value={agreementForm.agreementId}
                options={agreementOptions}
                onChange={(value) => {
                  const nextAgreement = agreements.find((item) =>
                    String(item.agreementId || item.id) === String(value)
                  ) || null;
                  setAgreementForm({
                    agreementId: value,
                    signatureName: '',
                    signedLocation: '',
                    signatureFile: null,
                  });
                  setSelectedAgreement(nextAgreement);
                  if (__DEV__ && nextAgreement) {
                    console.log('[Agreement Selected]', {
                      agreementId: nextAgreement.agreementId,
                      agreementName: nextAgreement.agreementName,
                      agreementCode: nextAgreement.agreementCode,
                      status: nextAgreement.status,
                    });
                  }
                }}
                placeholder="Select Agreement"
                disabled={agreementLoading || saving}
              />

              <Field label="Agreement Name" value={agreementText(selectedAgreement?.agreementName)} editable={false} />
              <Field label="Employee ID" value={agreementText(employeeId)} editable={false} />
              <Field label="Agreement Code" value={agreementText(selectedAgreement?.agreementCode)} editable={false} />
              <View style={styles.agreementStatusRow}>
                <Field label="Status" value={agreementText(selectedAgreement?.status)} editable={false} />
                {!!selectedAgreement && (
                  <View style={[
                    styles.documentStatusBadge,
                    { backgroundColor: isAgreementSigned(selectedAgreement) ? colors.successBackground : colors.warningBackground },
                  ]}>
                    <Text style={[
                      styles.documentStatusText,
                      { color: isAgreementSigned(selectedAgreement) ? colors.success : colors.warning },
                    ]}>
                      {isAgreementSigned(selectedAgreement) ? 'Signed' : 'Pending'}
                    </Text>
                  </View>
                )}
              </View>

              <ReadOnlyField
                label="Signature Name *"
                value={agreementForm.signatureName}
                editable={Boolean(selectedAgreement) && !isAgreementSigned(selectedAgreement) && !saving}
                onChangeText={(value) => {
                  setAgreementForm((current) => ({ ...current, signatureName: value }));
                  setDirty(true);
                }}
              />
              <ReadOnlyField
                label="Signed Location *"
                value={agreementForm.signedLocation}
                editable={Boolean(selectedAgreement) && !isAgreementSigned(selectedAgreement) && !saving}
                onChangeText={(value) => {
                  setAgreementForm((current) => ({ ...current, signedLocation: value }));
                  setDirty(true);
                }}
              />

              <TouchableOpacity
                style={[
                  styles.fileButton,
                  (!isEditMode || !selectedAgreement || isAgreementSigned(selectedAgreement) || saving) && styles.inputDisabled,
                ]}
                onPress={() => chooseFile({ signature: true })}
                disabled={!isEditMode || !selectedAgreement || isAgreementSigned(selectedAgreement) || saving}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isEditMode || !selectedAgreement || isAgreementSigned(selectedAgreement) || saving }}
              >
                <Ionicons name="image-outline" size={20} color={colors.primary} />
                <Text style={styles.fileButtonText}>{agreementForm.signatureFile?.name || 'Choose Signature Image'}</Text>
              </TouchableOpacity>
              <Text style={styles.helperText}>PNG, JPG or JPEG. Maximum file size: 500KB.</Text>
              {!!agreementForm.signatureFile && (
                <View style={styles.selectedFileCard}>
                  <View style={styles.selectedFileIcon}>
                    <Ionicons name="image-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.selectedFileInfo}>
                    <Text style={styles.selectedFileName} numberOfLines={1}>{agreementForm.signatureFile.name}</Text>
                    <Text style={styles.selectedFileMeta}>
                      {getFileExtension(agreementForm.signatureFile).toUpperCase() || agreementForm.signatureFile.mimeType || 'IMAGE'} - {formatFileSize(agreementForm.signatureFile.size)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.agreementActionGrid}>
                {[
                  { type: 'view', label: 'View Agreement', icon: 'eye-outline', disabled: !selectedAgreement },
                  { type: 'signed', label: 'View Signed', icon: 'document-text-outline', disabled: !selectedAgreement || !isAgreementSigned(selectedAgreement) },
                  { type: 'download', label: 'Download Signed', icon: 'download-outline', disabled: !selectedAgreement || !isAgreementSigned(selectedAgreement) },
                ].map((action) => {
                  const actionKey = `${action.type}-${getAgreementDisplayId(selectedAgreement || {})}`;
                  const isBusy = fileAction === actionKey;
                  const disabled = action.disabled || Boolean(fileAction) || saving;
                  return (
                    <TouchableOpacity
                      key={action.type}
                      style={[styles.agreementActionButton, disabled && styles.secondaryButtonDisabled]}
                      onPress={() => handleAgreementAction(selectedAgreement, action.type)}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityState={{ disabled, busy: isBusy }}
                    >
                      {isBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={action.icon} size={17} color={colors.primary} />}
                      <Text style={styles.documentActionText}>{action.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (
                    saving ||
                    !isEditMode ||
                    !selectedAgreement ||
                    isAgreementSigned(selectedAgreement) ||
                    !agreementForm.signatureName.trim() ||
                    !agreementForm.signedLocation.trim() ||
                    !agreementForm.signatureFile
                  ) && styles.buttonDisabled,
                ]}
                onPress={submitAgreement}
                disabled={
                  saving ||
                  !isEditMode ||
                  !selectedAgreement ||
                  isAgreementSigned(selectedAgreement) ||
                  !agreementForm.signatureName.trim() ||
                  !agreementForm.signedLocation.trim() ||
                  !agreementForm.signatureFile
                }
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    saving ||
                    !isEditMode ||
                    !selectedAgreement ||
                    isAgreementSigned(selectedAgreement) ||
                    !agreementForm.signatureName.trim() ||
                    !agreementForm.signedLocation.trim() ||
                    !agreementForm.signatureFile,
                  busy: saving,
                }}
              >
                {saving ? (
                  <>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.primaryButtonText}>Submitting...</Text>
                  </>
                ) : (
                  <Text style={styles.primaryButtonText}>Submit Agreement</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </Section>
      )}
      <StepActions
        onBack={() => goToStep(step - 1)}
        onNext={continueFromDocuments}
        nextLabel="Next"
        loading={isSavingDocumentsStep}
        disabled={isUploadingDocument || saving}
      />
    </>
  );

  const ReviewRow = ({ label, value, sensitive = false }) => (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, sensitive && styles.maskedText]}>{valueText(value)}</Text>
    </View>
  );

  const renderReview = () => (
    <>
      <Section title="Personal Information">
        <ReviewRow label="Employee ID" value={personal.employeeId} />
        <ReviewRow label="Full Name" value={`${personal.firstName} ${personal.middleName} ${personal.lastName}`.replace(/\s+/g, ' ').trim()} />
        <ReviewRow label="Date of Birth" value={formatDisplayDate(personal.dob)} />
        <ReviewRow label="Gender" value={personal.gender} />
        <ReviewRow label="Marital Status" value={personal.maritalStatus} />
        <ReviewRow label="Phone Number" value={personal.phone} />
        <ReviewRow label="Email" value={personal.email} />
        <ReviewRow label="Aadhaar Number" value={maskLastFour(personal.aadhaar)} sensitive />
        <ReviewRow label="PAN Number" value={maskPan(personal.pan)} sensitive />
        <ReviewRow label="Department" value={personal.department} />
        <ReviewRow label="Designation" value={personal.designation} />
        <ReviewRow label="Date of Joining" value={formatDisplayDate(personal.joiningDate)} />
        <ReviewRow label="Blood Group" value={personal.bloodGroup} />
        <ReviewRow label="Address" value={`${personal.houseNo}, ${personal.street}, ${personal.city}, ${personal.district}, ${personal.state}, ${personal.country} - ${personal.pincode}`} />
        {isEditMode && <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(0)}><Text style={styles.addText}>Edit Personal Information</Text></TouchableOpacity>}
      </Section>
      <Section title="Bank Information">
        <ReviewRow label="Customer ID" value={bank.customerId} />
        <ReviewRow label="Bank Name" value={bank.bankName === 'Others' ? bank.manualBank : bank.bankName} />
        <ReviewRow label="Account Holder Name" value={bank.accountHolder} />
        <ReviewRow label="Account Number" value={maskLastFour(bank.accountNumber)} sensitive />
        <ReviewRow label="IFSC Code" value={bank.ifsc} />
        <ReviewRow label="Branch Name" value={bank.branch} />
        <ReviewRow label="UAN Number" value={maskLastFour(bank.uan)} sensitive />
        <ReviewRow label="PF Account Number" value={maskLastFour(bank.pf)} sensitive />
        {isEditMode && <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(1)}><Text style={styles.addText}>Edit Bank Information</Text></TouchableOpacity>}
      </Section>
      <Section title="Education">
        {educationPayload(education, employeeId).length ? educationPayload(education, employeeId).map((item, index) => (
          <View key={`${item.Degree}-${index}`} style={styles.reviewMiniCard}>
            <ReviewRow label="Qualification" value={item.Degree} />
            <ReviewRow label="Institution" value={item.UniversityBoard} />
            <ReviewRow label="Year" value={item.YearOfPassing} />
            <ReviewRow label="Percentage/CGPA" value={item.PercentageCGPA} />
            <ReviewRow label="Specialization" value={item.Specialization} />
          </View>
        )) : <Text style={styles.emptyText}>No education details.</Text>}
        {isEditMode && <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(2)}><Text style={styles.addText}>Edit Education</Text></TouchableOpacity>}
      </Section>
      <Section title="Experience">
        {experiencePayload(experience, employeeId).length ? experiencePayload(experience, employeeId).map((item, index) => (
          <View key={`${item.CompanyName}-${index}`} style={styles.reviewMiniCard}>
            <ReviewRow label="Company" value={item.CompanyName} />
            <ReviewRow label="Designation" value={item.Designation} />
            <ReviewRow label="From Date" value={formatDisplayDate(item.FromDate)} />
            <ReviewRow label="To Date" value={formatDisplayDate(item.ToDate)} />
            <ReviewRow label="Experience Duration" value={`${item.Years} years`} />
            <ReviewRow label="Reason for Leaving" value={item.ReasonForLeaving} />
            <ReviewRow label="Description" value={item.Description} />
          </View>
        )) : <Text style={styles.emptyText}>No experience details.</Text>}
        {isEditMode && <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(3)}><Text style={styles.addText}>Edit Experience</Text></TouchableOpacity>}
      </Section>
      <Section title="Uploaded Documents">
        {documents.length ? documents.map((item) => (
          <View key={item.id} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{item.documentType}</Text>
            <TouchableOpacity onPress={() => handleDocumentAction(item, 'view')}><Text style={styles.addText}>{item.fileName}</Text></TouchableOpacity>
          </View>
        )) : <Text style={styles.emptyText}>No uploaded documents.</Text>}
        {isEditMode && <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(4)}><Text style={styles.addText}>Edit Documents</Text></TouchableOpacity>}
      </Section>
      {!!agreements.length && (
        <Section title="Employee Agreements">
          {agreements.map((item) => <ReviewRow key={item.id} label={item.agreementName} value={item.status} />)}
        </Section>
      )}
      <StepActions onBack={() => goToStep(step - 1)} onNext={finishReview} nextLabel="Finish" />
    </>
  );

  const renderStep = () => {
    if (step === 0) return renderPersonal();
    if (step === 1) return renderBank();
    if (step === 2) return renderEducation();
    if (step === 3) return renderExperience();
    if (step === 4) return renderDocuments();
    return renderReview();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.helperText}>Loading your employee profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: sizes.floatingTabHeight + insets.bottom + spacing.xxxl * 3 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleTextWrap}>
              <Text style={styles.screenTitle}>Add Employee Details</Text>
              <Text style={styles.screenSubtitle}>
                {isEditMode ? 'Edit and save your employee profile details.' : 'Review your employee profile details.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.editModeButton, isEditMode && styles.editModeButtonActive]}
              onPress={isEditMode ? exitEditMode : enterEditMode}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={isEditMode ? 'Done editing employee details' : 'Edit employee details'}
            >
              <Ionicons name={isEditMode ? 'checkmark' : 'create-outline'} size={18} color={isEditMode ? colors.white : colors.primary} />
              <Text style={[styles.editModeButtonText, isEditMode && styles.editModeButtonTextActive]}>
                {isEditMode ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
          {!isEditMode && (
            <View style={styles.readOnlyBanner}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
              <Text style={styles.readOnlyBannerText}>Tap Edit to update your details.</Text>
            </View>
          )}
        </View>

        <Stepper
          step={step}
          maxStep={isEditMode ? maxStep : STEPS.length - 1}
          onStepPress={goToStep}
          completedStepIndexes={completedStepIndexes}
          showCompletion={isEditMode}
        />

        {!!apiError && (
          <View style={styles.messageBoxError}>
            <Text style={styles.messageTextError}>{apiError}</Text>
            <TouchableOpacity onPress={() => loadAll()}><Text style={styles.addText}>Retry</Text></TouchableOpacity>
          </View>
        )}
        {!!success && (
          <View style={styles.messageBoxSuccess} accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={18} color={colors.employeeEdit.success} />
            <Text style={styles.messageTextSuccess}>{success}</Text>
          </View>
        )}

        {renderStep()}
      </ScrollView>
      <Modal visible={finishSuccessVisible} transparent animationType="fade" accessibilityViewIsModal>
        <View style={styles.successOverlay}>
          <View style={styles.successModal} accessibilityRole="alert">
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={32} color={colors.white} />
            </View>
            <Text style={styles.successTitle}>Employee details submitted successfully.</Text>
            {/* <Text style={styles.successSubtitle}>Your employee profile has been updated.</Text> */}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.employeeEdit.background,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.employeeEdit.background,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: spacing.screen,
    gap: spacing.sectionGap,
  },
  headerBlock: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  titleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
  },
  screenSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  editModeButton: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.surface,
    paddingHorizontal: spacing.lg,
  },
  editModeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  editModeButtonText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  editModeButtonTextActive: {
    color: colors.white,
  },
  readOnlyBanner: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.secondaryAction,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  readOnlyBannerText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  stepperCard: {
    padding: spacing.lg,
    borderRadius: radii.compactCard,
    backgroundColor: colors.employeeEdit.surface,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    ...shadows.subtle,
  },
  stepperTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  stepTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  stepCount: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  numberStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  stepItemWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItem: {
    width: 86,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.sm,
  },
  stepItemCurrent: {
    backgroundColor: colors.employeeEdit.stepActiveBackground,
  },
  stepItemLocked: {
    opacity: 0.62,
  },
  stepCircle: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.stepPending,
    borderWidth: 1,
    borderColor: colors.employeeEdit.stepConnector,
  },
  stepCircleDone: {
    backgroundColor: colors.employeeEdit.stepCompleted,
    borderColor: colors.employeeEdit.stepCompleted,
  },
  stepCircleCurrent: {
    backgroundColor: colors.employeeEdit.stepActive,
    borderColor: colors.employeeEdit.stepActive,
  },
  stepCircleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stepCircleTextCurrent: {
    color: colors.white,
  },
  stepLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  stepLabelCurrent: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
  stepConnector: {
    width: 22,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.stepConnector,
  },
  stepConnectorDone: {
    backgroundColor: colors.employeeEdit.stepCompleted,
  },
  section: {
    padding: spacing.xxl,
    borderRadius: radii.compactCard,
    backgroundColor: colors.employeeEdit.surface,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    ...shadows.subtle,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.lg,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    fontWeight: fontWeights.medium,
  },
  sectionBody: {
    gap: spacing.md,
  },
  fieldWrap: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  input: {
    minHeight: sizes.inputHeight,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.employeeEdit.inputBorder,
    backgroundColor: colors.employeeEdit.inputBackground,
    paddingHorizontal: spacing.xxl,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: spacing.lg,
  },
  inputError: {
    borderColor: colors.employeeEdit.error,
  },
  inputDisabled: {
    backgroundColor: colors.mutedBackground,
    color: colors.textSecondary,
  },
  readOnlyControl: {
    backgroundColor: colors.mutedBackground,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  placeholderText: {
    color: colors.placeholder,
  },
  optionsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.employeeEdit.inputBorder,
    backgroundColor: colors.employeeEdit.inputBackground,
    padding: spacing.md,
  },
  optionChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.employeeEdit.optionBackground,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
  },
  optionChipActive: {
    backgroundColor: colors.employeeEdit.optionActiveBackground,
    borderColor: colors.primary,
  },
  optionChipDisabled: {
    opacity: 0.82,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  optionTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
  selectField: {
    minHeight: sizes.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.employeeEdit.inputBorder,
    backgroundColor: colors.employeeEdit.selectionBackground,
    paddingHorizontal: spacing.xxl,
  },
  selectFieldText: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  selectorModal: {
    maxHeight: '82%',
    padding: spacing.xxl,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.employeeEdit.surface,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  selectorTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  selectorSubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  modalClose: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
  },
  selectorSearch: {
    minHeight: sizes.inputHeightSmall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.employeeEdit.inputBorder,
    backgroundColor: colors.employeeEdit.inputBackground,
    marginBottom: spacing.lg,
  },
  selectorSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  selectorList: {
    marginHorizontal: -spacing.md,
  },
  selectorGroup: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectorRow: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  selectorRowActive: {
    backgroundColor: colors.employeeEdit.optionActiveBackground,
  },
  selectorRowDisabled: {
    opacity: 0.55,
  },
  selectorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  selectorRowText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  selectorRowTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.extraBold,
  },
  selectorRowHelper: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  errorText: {
    color: colors.employeeEdit.error,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
  },
  inlineLoader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  inlineErrorBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inlineErrorText: {
    flex: 1,
    minWidth: 0,
    color: colors.employeeEdit.error,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  inlineRetryText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  actions: {
    gap: spacing.lg,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  primaryButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.employeeEdit.primaryAction,
    paddingHorizontal: spacing.xxl,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  secondaryButton: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.employeeEdit.secondaryAction,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    paddingHorizontal: spacing.xxl,
  },
  secondaryButtonDisabled: {
    opacity: 0.58,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  addButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.employeeEdit.secondaryAction,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
  },
  addText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  removeButton: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    marginTop: spacing.md,
  },
  removeText: {
    color: colors.employeeEdit.removeText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  tabSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.employeeEdit.secondaryAction,
  },
  tabSwitchItem: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  tabSwitchItemActive: {
    backgroundColor: colors.employeeEdit.surface,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
  },
  tabSwitchText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  tabSwitchTextActive: {
    color: colors.primary,
  },
  fileButton: {
    minHeight: sizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.employeeEdit.inputBackground,
    borderWidth: 1,
    borderColor: colors.employeeEdit.inputBorder,
  },
  fileButtonText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  documentProgressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  documentProgressCount: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  documentProgressMeta: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    textAlign: 'right',
  },
  documentProgressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.mutedBackground,
  },
  documentProgressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  checklistRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.inputBackground,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  checklistIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  checklistText: {
    flex: 1,
    minWidth: 0,
  },
  checklistTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  checklistMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  selectedFileCard: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.reviewSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedFileIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
  },
  selectedFileInfo: {
    flex: 1,
    minWidth: 0,
  },
  selectedFileName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  selectedFileMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  selectedFileRemove: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.employeeEdit.border,
  },
  documentInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  rowMeta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 18,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  documentCard: {
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.inputBackground,
    padding: spacing.lg,
  },
  documentCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  documentStatusBadge: {
    flexShrink: 0,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  documentStatusText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  documentMetaGroup: {
    gap: spacing.xs,
  },
  documentActionButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
    paddingHorizontal: spacing.md,
  },
  documentActionText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  documentActionDanger: {
    backgroundColor: colors.dangerBackground,
  },
  documentActionDangerText: {
    color: colors.employeeEdit.removeText,
  },
  agreementCountRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  agreementCountChip: {
    flexGrow: 1,
    minWidth: 134,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.secondaryAction,
    padding: spacing.lg,
  },
  agreementCountValue: {
    color: colors.primary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
  },
  agreementCountLabel: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  agreementStatusRow: {
    gap: spacing.sm,
  },
  agreementActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  agreementActionButton: {
    minHeight: sizes.minTouchTarget,
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
    paddingHorizontal: spacing.md,
  },
  iconAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
  },
  iconActionDanger: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.dangerBackground,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },
  emptyDocumentState: {
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    backgroundColor: colors.employeeEdit.reviewSurface,
    padding: spacing.xxl,
  },
  emptyDocumentTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  reviewRow: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.employeeEdit.border,
  },
  reviewLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  reviewValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    lineHeight: 19,
  },
  maskedText: {
    color: colors.employeeEdit.maskedText,
  },
  reviewMiniCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.employeeEdit.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.employeeEdit.reviewSurface,
  },
  editStepButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.secondaryAction,
    marginTop: spacing.lg,
  },
  messageBoxError: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  messageTextError: {
    color: colors.employeeEdit.error,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  messageBoxSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.employeeEdit.successBannerBackground,
    borderWidth: 1,
    borderColor: colors.employeeEdit.success,
  },
  messageTextSuccess: {
    color: colors.employeeEdit.success,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  successOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screen,
    backgroundColor: colors.overlay,
  },
  successModal: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    padding: spacing.xxxl * 2,
    borderRadius: radii.card,
    backgroundColor: colors.employeeEdit.successModalBackground,
    ...shadows.modal,
  },
  successIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.employeeEdit.success,
    marginBottom: spacing.xxl,
  },
  successTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
});
