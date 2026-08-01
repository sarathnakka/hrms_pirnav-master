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
  TextInput,
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

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import {
  BANK_OPTIONS,
  BLOOD_GROUP_OPTIONS,
  DESIGNATION_OPTIONS,
  DOCUMENT_GROUPS,
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
  maskLastFour,
  maskPan,
  normalizeAgreements,
  normalizeDepartments,
  normalizeDocuments,
  normalizeEmployeeProfile,
} from './employeeProfileMappers';
import {
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  downloadSignedAgreementDocument,
  getDepartments,
  getDocumentChecklist,
  getEmployeeDocuments,
  getMyAgreements,
  getMyEmployeeDetails,
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

function valueText(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function firstError(errors) {
  return Object.values(errors).find(Boolean) || 'Please review the highlighted fields.';
}

const STEP_LABELS = ['Personal', 'Bank', 'Education', 'Experience', 'Documents', 'Review'];

function Stepper({ step, maxStep, onStepPress }) {
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
          const isDone = index < step;
          const isCurrent = index === step;
          const unlocked = index <= maxStep;

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
                accessibilityLabel={`${label}, step ${index + 1} of ${STEPS.length}`}
              >
                <View style={[
                  styles.stepCircle,
                  isDone && styles.stepCircleDone,
                  isCurrent && styles.stepCircleCurrent,
                ]}>
                  {isDone ? (
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
                <View style={[styles.stepConnector, index < step && styles.stepConnectorDone]} />
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
      <TextInput
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

function OptionField({ label, value, options, onChange, error }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.optionsBox, error && styles.inputError]}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionChip, selected && styles.optionChipActive]}
              onPress={() => onChange(option)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
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
    };
  }).filter((option) => option.label && option.value !== undefined && option.value !== null);
}

function SelectionField({ label, value, options, onChange, error, placeholder = 'Select', searchable = true }) {
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
        style={[styles.selectField, error && styles.inputError]}
        onPress={() => setVisible(true)}
        activeOpacity={0.82}
        accessibilityRole="button"
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
                <TextInput
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
                      style={[styles.selectorRow, checked && styles.selectorRowActive]}
                      onPress={() => {
                        onChange(option.value);
                        setVisible(false);
                        setQuery('');
                      }}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityState={{ selected: checked }}
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

function DateField({ label, value, onChange, error }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerValue = value ? new Date(`${value}T00:00:00`) : new Date();

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, styles.dateInput, error && styles.inputError]}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
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

function ActionRow({ step, loading, onBack, onSkip, onNext, nextLabel = 'Update & Next' }) {
  return (
    <View style={styles.actions}>
      {(step > 0 || onSkip) && (
        <View style={styles.secondaryActionRow}>
          {step > 0 && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.8} accessibilityRole="button">
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onSkip} activeOpacity={0.8} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={onNext}
        disabled={loading}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
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

export default function EditEmployeeScreen({ navigation }) {
  const { token } = useAuth();
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
  const [agreements, setAgreements] = useState([]);
  const [documentType, setDocumentType] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [agreementForm, setAgreementForm] = useState({ agreementId: '', signatureName: '', signedLocation: '', signatureFile: null });
  const [activeDocumentTab, setActiveDocumentTab] = useState('documents');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileAction, setFileAction] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState('');
  const [finishSuccessVisible, setFinishSuccessVisible] = useState(false);
  const [dirty, setDirty] = useState(false);

  const groupedDocumentOptions = useMemo(
    () => DOCUMENT_GROUPS.flatMap((group) => group.options.map((option) => ({ label: option, value: option, group: group.label }))),
    []
  );
  const agreementOptions = useMemo(
    () => agreements.map((item) => ({
      label: item.agreementName || item.agreementType || `Agreement ${item.id}`,
      value: item.id,
      helper: item.status,
    })),
    [agreements]
  );
  const selectedDocumentCategory = useMemo(() => {
    const match = DOCUMENT_GROUPS.find((group) => group.options.includes(documentType));
    return match?.label || 'Documents';
  }, [documentType]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [step]);

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => setSuccess(''), 2600);
    return () => clearTimeout(timer);
  }, [success]);

  usePreventRemove(dirty, ({ data }) => {
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
          getMyAgreements(token, { signal: controller.signal }),
        ]);

        if (documentResult.status === 'fulfilled') {
          setDocuments(normalizeDocuments(documentResult.value));
        }
        if (checklistResult.status === 'fulfilled') {
          // Loaded for backend freshness; document list remains the display source.
        }
        if (agreementsResult.status === 'fulfilled') {
          setAgreements(normalizeAgreements(agreementsResult.value));
        } else {
          setAgreements([]);
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
  }, [applyProfile, token]);

  useEffect(() => {
    loadAll();
    return () => abortRef.current?.abort();
  }, [loadAll]);

  const updatePersonal = (key, value) => {
    setPersonal((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateBank = (key, value) => {
    setBank((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateList = (setter, index, key, value) => {
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
    setDirty(true);
  };

  const goToStep = (targetStep) => {
    if (dirty) {
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

  const afterSave = async (nextStep, message) => {
    await loadAll({ refresh: true });
    setDirty(false);
    setSuccess(message);
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
    const next = validatePersonal();
    if (Object.keys(next).length) return Alert.alert('Validation', firstError(next));
    setSaving(true);
    setApiError('');
    try {
      const payload = buildPersonalPayload(personal);
      await savePersonalInfo(payload, personal.employeeId, profile?.hasPersonal, token);
      setEmployeeId(personal.employeeId);
      await afterSave(1, 'Personal information updated.');
    } catch (error) {
      setApiError(error?.message || 'Unable to update personal information.');
    } finally {
      setSaving(false);
    }
  };

  const saveBank = async ({ skip = false } = {}) => {
    if (skip) return goToStep(2);
    const next = validateBank();
    if (Object.keys(next).length) return Alert.alert('Validation', firstError(next));
    setSaving(true);
    setApiError('');
    try {
      await saveBankInfo(buildBankPayload(bank, employeeId), employeeId, profile?.hasBank, token);
      await afterSave(2, 'Bank information updated.');
    } catch (error) {
      setApiError(error?.message || 'Unable to update bank information.');
    } finally {
      setSaving(false);
    }
  };

  const saveEducation = async () => {
    const next = validateEducation();
    if (Object.keys(next).length) return Alert.alert('Validation', 'Please complete or remove highlighted education entries.');
    setSaving(true);
    setApiError('');
    try {
      await saveEducationCollection(educationPayload(education, employeeId), employeeId, profile?.hasEducation, token);
      await afterSave(3, 'Education information updated.');
    } catch (error) {
      setApiError(error?.message || 'Unable to update education information.');
    } finally {
      setSaving(false);
    }
  };

  const saveExperience = async ({ skip = false } = {}) => {
    if (skip) return goToStep(4);
    const next = validateExperience();
    if (Object.keys(next).length) return Alert.alert('Validation', 'Please complete or remove highlighted experience entries.');
    setSaving(true);
    setApiError('');
    try {
      await saveExperienceCollection(experiencePayload(experience, employeeId), employeeId, profile?.hasExperience, token);
      await afterSave(4, 'Experience information updated.');
    } catch (error) {
      setApiError(error?.message || 'Unable to update experience information.');
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = async ({ signature = false } = {}) => {
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
      Alert.alert('File too large', signature ? 'Signature image must be 10 MB or less.' : 'Document must be 3 MB or less.');
      return;
    }
    if (file.mimeType && !SUPPORTED_FILE_TYPES.includes(file.mimeType)) {
      Alert.alert('Unsupported file', 'Please select a PDF, JPG, JPEG, or PNG file.');
      return;
    }
    if (signature) {
      setAgreementForm((current) => ({ ...current, signatureFile: file }));
    } else {
      setSelectedFile(file);
    }
    setDirty(true);
  };

  const uploadDocument = async () => {
    if (!employeeId) return Alert.alert('Employee ID missing', 'Load your profile before uploading documents.');
    if (!documentType) return Alert.alert('Document type required', 'Select a document type.');
    if (!selectedFile) return Alert.alert('File required', 'Select a document file.');
    if (documents.some((item) => item.documentType.toLowerCase() === documentType.toLowerCase())) {
      return Alert.alert('Duplicate document', 'This document type is already uploaded.');
    }
    setSaving(true);
    try {
      await uploadEmployeeDocument({ employeeId, documentType, category: selectedDocumentCategory, file: selectedFile }, token);
      setDocumentType('');
      setSelectedFile(null);
      await loadAll({ refresh: true });
      setSuccess('Document uploaded.');
    } catch (error) {
      setApiError(error?.message || 'Unable to upload document.');
    } finally {
      setSaving(false);
      setDirty(false);
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
    Alert.alert('Delete document', `Delete ${document.documentType}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setFileAction(`delete-${document.id}`);
          try {
            await deleteEmployeeDocument(document.id, token);
            await loadAll({ refresh: true });
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
    if (fileAction) return;
    setFileAction(`${type}-${agreement.id}`);
    try {
      const file =
        type === 'view'
          ? await viewAgreementDocument(agreement.agreementId || agreement.id, token, `${agreement.agreementName}.pdf`)
          : type === 'signed'
            ? await viewSignedAgreementDocument(agreement.employeeAgreementId || agreement.id, token, `Signed-${agreement.agreementName}.pdf`)
            : await downloadSignedAgreementDocument(agreement.employeeAgreementId || agreement.id, token, `Signed-${agreement.agreementName}.pdf`);
      if (type === 'download') {
        await Sharing.shareAsync(file.uri, { mimeType: file.contentType, dialogTitle: 'Save or share agreement' });
      } else {
        await openFile(file);
      }
    } catch (error) {
      Alert.alert('Agreement action failed', error?.message || 'Unable to complete agreement action.');
    } finally {
      setFileAction('');
    }
  };

  const submitAgreement = async () => {
    const agreement = agreements.find((item) => item.id === agreementForm.agreementId);
    if (!agreement) return Alert.alert('Agreement required', 'Select an agreement.');
    if (!agreementForm.signatureName.trim()) return Alert.alert('Signature name required', 'Enter your signature name.');
    if (!agreementForm.signedLocation.trim()) return Alert.alert('Signed location required', 'Enter the signed location.');
    if (!agreementForm.signatureFile) return Alert.alert('Signature image required', 'Select a signature image.');
    setSaving(true);
    try {
      await signEmployeeAgreement({
        agreementId: agreement.agreementId || agreement.id,
        employeeId,
        signatureName: agreementForm.signatureName.trim(),
        signedLocation: agreementForm.signedLocation.trim(),
        signatureFile: agreementForm.signatureFile,
      }, token);
      setAgreementForm({ agreementId: '', signatureName: '', signedLocation: '', signatureFile: null });
      await loadAll({ refresh: true });
      setSuccess('Agreement signed successfully.');
    } catch (error) {
      setApiError(error?.message || 'Unable to sign agreement.');
    } finally {
      setSaving(false);
      setDirty(false);
    }
  };

  const finishReview = async () => {
    if (saving) return;
    setSaving(true);
    setApiError('');
    try {
      const latestProfile = normalizeEmployeeProfile(await getMyEmployeeDetails(token));
      applyProfile(latestProfile);
      setDirty(false);
      setSuccess('');
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

  const renderPersonal = () => (
    <>
      <Section title="Personal Information">
        <Field label="Employee ID" value={personal.employeeId} onChangeText={(value) => updatePersonal('employeeId', value)} error={errors.employeeId} editable={!employeeId} autoCapitalize="characters" />
        <Field label="First Name" value={personal.firstName} onChangeText={(value) => updatePersonal('firstName', value)} error={errors.firstName} />
        <Field label="Middle Name" value={personal.middleName} onChangeText={(value) => updatePersonal('middleName', value)} />
        <Field label="Last Name" value={personal.lastName} onChangeText={(value) => updatePersonal('lastName', value)} error={errors.lastName} />
        <OptionField label="Gender" value={personal.gender} options={GENDER_OPTIONS} onChange={(value) => updatePersonal('gender', value)} error={errors.gender} />
        <OptionField label="Marital Status" value={personal.maritalStatus} options={MARITAL_OPTIONS} onChange={(value) => updatePersonal('maritalStatus', value)} error={errors.maritalStatus} />
        <DateField label="Date of Birth" value={personal.dob} onChange={(value) => updatePersonal('dob', value)} error={errors.dob} />
        <Field label="Phone Number" value={personal.phone} onChangeText={(value) => updatePersonal('phone', value.replace(/[^\d]/g, '').slice(0, 10))} error={errors.phone} keyboardType="phone-pad" />
        <Field label="Email" value={personal.email} onChangeText={(value) => updatePersonal('email', value)} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Aadhaar Number" value={personal.aadhaar} onChangeText={(value) => updatePersonal('aadhaar', value.replace(/[^\d]/g, '').slice(0, 12))} error={errors.aadhaar} keyboardType="number-pad" />
        <Field label="PAN Number" value={personal.pan} onChangeText={(value) => updatePersonal('pan', value.toUpperCase().slice(0, 10))} error={errors.pan} autoCapitalize="characters" />
        <OptionField label="Blood Group" value={personal.bloodGroup} options={BLOOD_GROUP_OPTIONS} onChange={(value) => updatePersonal('bloodGroup', value)} error={errors.bloodGroup} />
      </Section>
      <Section title="Employment Information">
        <SelectionField label="Department" value={personal.department} options={departments.length ? departments : [personal.department].filter(Boolean)} onChange={(value) => updatePersonal('department', value)} error={errors.department} placeholder="Select department" />
        <SelectionField label="Designation" value={personal.designation} options={DESIGNATION_OPTIONS} onChange={(value) => updatePersonal('designation', value)} error={errors.designation} placeholder="Select designation" />
        <DateField label="Date of Joining" value={personal.joiningDate} onChange={(value) => updatePersonal('joiningDate', value)} error={errors.joiningDate} />
      </Section>
      <Section title="Address Information">
        <Field label="House Number" value={personal.houseNo} onChangeText={(value) => updatePersonal('houseNo', value)} error={errors.houseNo} />
        <Field label="Street / Area" value={personal.street} onChangeText={(value) => updatePersonal('street', value)} error={errors.street} />
        <Field label="City / Village" value={personal.city} onChangeText={(value) => updatePersonal('city', value)} error={errors.city} />
        <Field label="District" value={personal.district} onChangeText={(value) => updatePersonal('district', value)} error={errors.district} />
        <Field label="State" value={personal.state} onChangeText={(value) => updatePersonal('state', value)} error={errors.state} />
        <Field label="Country" value={personal.country} onChangeText={(value) => updatePersonal('country', value)} error={errors.country} />
        <Field label="Pincode" value={personal.pincode} onChangeText={(value) => updatePersonal('pincode', value.replace(/[^\d]/g, '').slice(0, 6))} error={errors.pincode} keyboardType="number-pad" />
      </Section>
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onNext={savePersonal} />
    </>
  );

  const renderBank = () => (
    <>
      <Section title="Bank Information">
        <Field label="Customer ID" value={bank.customerId} onChangeText={(value) => updateBank('customerId', value)} />
        <SelectionField label="Bank Name" value={bank.bankName} options={BANK_OPTIONS} onChange={(value) => updateBank('bankName', value)} error={errors.bankName} placeholder="Select bank" />
        {bank.bankName === 'Others' && <Field label="Enter Bank Name" value={bank.manualBank} onChangeText={(value) => updateBank('manualBank', value)} error={errors.bankName} />}
        <Field label="Account Holder Name" value={bank.accountHolder} onChangeText={(value) => updateBank('accountHolder', value)} error={errors.accountHolder} />
        <Field label="Account Number" value={bank.accountNumber} onChangeText={(value) => updateBank('accountNumber', value.replace(/[^\d]/g, ''))} error={errors.accountNumber} keyboardType="number-pad" />
        <Field label="IFSC Code" value={bank.ifsc} onChangeText={(value) => updateBank('ifsc', value.toUpperCase().slice(0, 11))} error={errors.ifsc} autoCapitalize="characters" />
        <Field label="Branch Name" value={bank.branch} onChangeText={(value) => updateBank('branch', value)} error={errors.branch} />
        <Field label="UAN Number" value={bank.uan} onChangeText={(value) => updateBank('uan', value)} />
        <Field label="PF Account Number" value={bank.pf} onChangeText={(value) => updateBank('pf', value)} />
      </Section>
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onSkip={() => saveBank({ skip: true })} onNext={() => saveBank()} />
    </>
  );

  const renderEducation = () => (
    <>
      {education.map((item, index) => {
        const rowErrors = errors[`education-${index}`] || {};
        return (
          <Section key={`education-${index}`} title={`Education ${index + 1}`}>
            <SelectionField label="Qualification" value={item.qualification} options={QUALIFICATION_OPTIONS} onChange={(value) => updateList(setEducation, index, 'qualification', value)} error={rowErrors.qualification} placeholder="Select qualification" />
            {item.qualification === 'Other' && <Field label="Custom Qualification" value={item.customQualification} onChangeText={(value) => updateList(setEducation, index, 'customQualification', value)} error={rowErrors.qualification} />}
            <Field label="University / Board" value={item.university} onChangeText={(value) => updateList(setEducation, index, 'university', value)} error={rowErrors.university} />
            <Field label="Year of Passing" value={item.year} onChangeText={(value) => updateList(setEducation, index, 'year', value.replace(/[^\d]/g, '').slice(0, 4))} error={rowErrors.year} keyboardType="number-pad" />
            <Field label="Percentage / CGPA" value={item.percentage} onChangeText={(value) => updateList(setEducation, index, 'percentage', value)} error={rowErrors.percentage} keyboardType="decimal-pad" />
            <Field label="Specialization" value={item.specialization} onChangeText={(value) => updateList(setEducation, index, 'specialization', value)} error={rowErrors.specialization} />
            {!!rowErrors.duplicate && <Text style={styles.errorText}>{rowErrors.duplicate}</Text>}
            <TouchableOpacity style={styles.removeButton} onPress={() => { setEducation((current) => current.filter((_, i) => i !== index)); setDirty(true); }} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.employeeEdit.removeText} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </Section>
        );
      })}
      <TouchableOpacity style={styles.addButton} onPress={() => { setEducation((current) => [...current, { ...EMPTY_EDUCATION }]); setDirty(true); }} accessibilityRole="button">
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.addText}>Add Another Education</Text>
      </TouchableOpacity>
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onNext={saveEducation} />
    </>
  );

  const renderExperience = () => (
    <>
      {experience.map((item, index) => {
        const rowErrors = errors[`experience-${index}`] || {};
        return (
          <Section key={`experience-${index}`} title={`Experience ${index + 1}`}>
            <Field label="Company Name" value={item.company} onChangeText={(value) => updateList(setExperience, index, 'company', value)} error={rowErrors.company} />
            <Field label="Designation" value={item.designation} onChangeText={(value) => updateList(setExperience, index, 'designation', value)} error={rowErrors.designation} />
            <DateField label="From Date" value={item.fromDate} onChange={(value) => updateList(setExperience, index, 'fromDate', value)} error={rowErrors.fromDate} />
            <DateField label="To Date" value={item.toDate} onChange={(value) => updateList(setExperience, index, 'toDate', value)} error={rowErrors.toDate} />
            <Field label="Years of Experience" value={String(experienceYears(item.fromDate, item.toDate))} editable={false} />
            <Field label="Reason for Leaving" value={item.reason} onChangeText={(value) => updateList(setExperience, index, 'reason', value)} error={rowErrors.reason} />
            <Field label="Description" value={item.description} onChangeText={(value) => updateList(setExperience, index, 'description', value)} error={rowErrors.description} multiline />
            <TouchableOpacity style={styles.removeButton} onPress={() => { setExperience((current) => current.filter((_, i) => i !== index)); setDirty(true); }} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.employeeEdit.removeText} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </Section>
        );
      })}
      <TouchableOpacity style={styles.addButton} onPress={() => { setExperience((current) => [...current, { ...EMPTY_EXPERIENCE }]); setDirty(true); }} accessibilityRole="button">
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.addText}>Add Another Experience</Text>
      </TouchableOpacity>
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onSkip={() => saveExperience({ skip: true })} onNext={() => saveExperience()} />
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
          <Section title="Upload Document">
            <SelectionField label="Document Type" value={documentType} options={groupedDocumentOptions} onChange={(value) => { setDocumentType(value); setDirty(true); }} placeholder="Select document type" />
            <TouchableOpacity style={styles.fileButton} onPress={() => chooseFile()} accessibilityRole="button">
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              <Text style={styles.fileButtonText}>{selectedFile?.name || 'Select PDF, JPG, JPEG or PNG'}</Text>
            </TouchableOpacity>
            <Text style={styles.helperText}>Maximum file size: 3 MB</Text>
            <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={uploadDocument} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Upload Document</Text>}
            </TouchableOpacity>
          </Section>
          <Section title="Uploaded Documents">
            {documents.length ? documents.map((document) => (
              <View key={document.id} style={styles.documentRow}>
                <View style={styles.documentInfo}>
                  <Text style={styles.rowTitle}>{document.documentType}</Text>
                  <Text style={styles.rowMeta}>{document.fileName}</Text>
                  <Text style={styles.rowMeta}>{formatFileSize(document.size)} - {formatDisplayDate(document.uploadedAt)}</Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.iconAction} onPress={() => handleDocumentAction(document, 'view')} accessibilityRole="button"><Ionicons name="eye-outline" size={18} color={colors.primary} /></TouchableOpacity>
                  <TouchableOpacity style={styles.iconAction} onPress={() => handleDocumentAction(document, 'download')} accessibilityRole="button"><Ionicons name="download-outline" size={18} color={colors.primary} /></TouchableOpacity>
                  <TouchableOpacity style={styles.iconActionDanger} onPress={() => confirmDeleteDocument(document)} accessibilityRole="button"><Ionicons name="trash-outline" size={18} color={colors.employeeEdit.removeText} /></TouchableOpacity>
                </View>
              </View>
            )) : <Text style={styles.emptyText}>No documents uploaded.</Text>}
          </Section>
        </>
      ) : (
        <Section title="Employee Agreements">
          {agreements.length ? agreements.map((agreement) => (
            <View key={agreement.id} style={styles.documentRow}>
              <View style={styles.documentInfo}>
                <Text style={styles.rowTitle}>{agreement.agreementName}</Text>
                <Text style={styles.rowMeta}>{agreement.agreementType || 'Agreement'} - {agreement.status}</Text>
                <Text style={styles.rowMeta}>{agreement.agreementCode || '-'}</Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.iconAction} onPress={() => handleAgreementAction(agreement, 'view')} accessibilityRole="button"><Ionicons name="eye-outline" size={18} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity style={styles.iconAction} onPress={() => handleAgreementAction(agreement, 'signed')} accessibilityRole="button"><Ionicons name="document-text-outline" size={18} color={colors.primary} /></TouchableOpacity>
                <TouchableOpacity style={styles.iconAction} onPress={() => handleAgreementAction(agreement, 'download')} accessibilityRole="button"><Ionicons name="download-outline" size={18} color={colors.primary} /></TouchableOpacity>
              </View>
            </View>
          )) : <Text style={styles.emptyText}>No employee agreements available.</Text>}
          {!!agreements.length && (
            <>
              <SelectionField label="Agreement Type" value={agreementForm.agreementId} options={agreementOptions} onChange={(value) => { setAgreementForm((current) => ({ ...current, agreementId: value })); setDirty(true); }} placeholder="Select agreement" />
              <Field label="Signature Name" value={agreementForm.signatureName} onChangeText={(value) => { setAgreementForm((current) => ({ ...current, signatureName: value })); setDirty(true); }} />
              <Field label="Signed Location" value={agreementForm.signedLocation} onChangeText={(value) => { setAgreementForm((current) => ({ ...current, signedLocation: value })); setDirty(true); }} />
              <TouchableOpacity style={styles.fileButton} onPress={() => chooseFile({ signature: true })} accessibilityRole="button">
                <Ionicons name="image-outline" size={20} color={colors.primary} />
                <Text style={styles.fileButtonText}>{agreementForm.signatureFile?.name || 'Select signature image'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={submitAgreement} disabled={saving} accessibilityRole="button">
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Submit Agreement</Text>}
              </TouchableOpacity>
            </>
          )}
        </Section>
      )}
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onNext={() => { setDirty(false); setMaxStep((current) => Math.max(current, 5)); setStep(5); }} />
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
        <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(0)}><Text style={styles.addText}>Edit Personal Information</Text></TouchableOpacity>
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
        <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(1)}><Text style={styles.addText}>Edit Bank Information</Text></TouchableOpacity>
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
        <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(2)}><Text style={styles.addText}>Edit Education</Text></TouchableOpacity>
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
        <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(3)}><Text style={styles.addText}>Edit Experience</Text></TouchableOpacity>
      </Section>
      <Section title="Uploaded Documents">
        {documents.length ? documents.map((item) => (
          <View key={item.id} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{item.documentType}</Text>
            <TouchableOpacity onPress={() => handleDocumentAction(item, 'view')}><Text style={styles.addText}>{item.fileName}</Text></TouchableOpacity>
          </View>
        )) : <Text style={styles.emptyText}>No uploaded documents.</Text>}
        <TouchableOpacity style={styles.editStepButton} onPress={() => goToStep(4)}><Text style={styles.addText}>Edit Documents</Text></TouchableOpacity>
      </Section>
      {!!agreements.length && (
        <Section title="Employee Agreements">
          {agreements.map((item) => <ReviewRow key={item.id} label={item.agreementName} value={item.status} />)}
        </Section>
      )}
      <ActionRow step={step} loading={saving} onBack={() => goToStep(step - 1)} onNext={finishReview} nextLabel="Finish" />
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAll({ refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.screenTitle}>Add Employee Details</Text>
          <Text style={styles.screenSubtitle}>Review and update your employee profile details.</Text>
        </View>

        <Stepper step={step} maxStep={maxStep} onStepPress={goToStep} />

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
