import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';
import { fromDateOnly, toDateOnly } from './teamDateUtils';
import { sameEmployeeId } from './teamRequestMappers';

function shiftLabel(shift) {
  if (!shift) return 'Shift not assigned';
  const time = shift.startTime || shift.endTime
    ? ` (${shift.startTime || '?'} - ${shift.endTime || '?'})`
    : '';
  return `${shift.name}${time}`;
}

function RequestModalShell({ visible, title, subtitle, icon, onClose, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard} accessibilityViewIsModal>
          <View style={styles.modalHeader}>
            <View style={styles.modalIcon}>
              <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function ReadonlyField({ label, value }) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel>{label}</FieldLabel>
      <View style={[styles.fieldControl, styles.readonlyField]}>
        <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.readonlyText}>{value}</Text>
        <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
      </View>
    </View>
  );
}

function SelectionField({ label, placeholder, value, options, open, onToggle, onSelect, disabled }) {
  const selected = options.find((option) => String(option.value) === String(value));
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel>{label}</FieldLabel>
      <TouchableOpacity
        style={[styles.fieldControl, disabled && styles.disabledField]}
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: Boolean(disabled) }}
      >
        <Text style={[styles.fieldText, !selected && styles.placeholderText]} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
      </TouchableOpacity>
      {open ? (
        <ScrollView style={styles.optionList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((option) => (
            <Pressable
              key={String(option.value)}
              style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
            >
              <Text style={styles.optionText}>{option.label}</Text>
              {String(option.value) === String(value) ? (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function DateField({ label, value, onChange, disabled = false }) {
  const [showIosPicker, setShowIosPicker] = useState(false);
  const selectedDate = fromDateOnly(value) || new Date();

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toDateOnly(date));
        },
      });
      return;
    }
    setShowIosPicker((current) => !current);
  };

  return (
    <View style={styles.fieldGroup}>
      <FieldLabel>{label}</FieldLabel>
      <TouchableOpacity
        style={[styles.fieldControl, disabled && styles.disabledField]}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text style={[styles.fieldText, !value && styles.placeholderText]}>
          {value || 'Select date'}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
      </TouchableOpacity>
      {showIosPicker ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="inline"
          onChange={(_, date) => {
            if (date) onChange(toDateOnly(date));
          }}
        />
      ) : null}
    </View>
  );
}

function FormFooter({ onClose, onSubmit, saving, disabled }) {
  return (
    <View style={styles.footer}>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onClose}
        disabled={saving}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
        onPress={onSubmit}
        disabled={disabled}
        accessibilityRole="button"
      >
        {saving ? <ActivityIndicator size="small" color={colors.white} /> : null}
        <Text style={styles.primaryButtonText}>{saving ? 'Submitting...' : 'Submit Request'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ShiftSwapModal({ visible, member, members, shifts, loadingShifts, saving, onClose, onSubmit }) {
  const lockRef = useRef(false);
  const [technology, setTechnology] = useState('');
  const [toEmployeeId, setToEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  const [reason, setReason] = useState('');
  const [openSelect, setOpenSelect] = useState('');
  const [error, setError] = useState('');

  const colleagues = useMemo(() => (
    (members || []).filter((candidate) => !sameEmployeeId(candidate.employeeId, member?.employeeId))
  ), [member?.employeeId, members]);
  const technologies = useMemo(() => (
    [...new Set(colleagues.map((candidate) => candidate.technology).filter(Boolean))]
  ), [colleagues]);
  const eligibleColleagues = technology
    ? colleagues.filter((candidate) => candidate.technology === technology)
    : colleagues;
  const currentShift = shifts.find((shift) => String(shift.id) === String(member?.shiftId));

  const submit = async () => {
    if (lockRef.current || saving) return;
    const today = toDateOnly(new Date());
    if (!member?.shiftId) setError('Your current shift could not be identified.');
    else if (!toEmployeeId) setError('Select an eligible team member.');
    else if (!shiftId || !shiftDate) setError('Choose a shift and request date.');
    else if (shiftDate < today) setError('Request date cannot be in the past.');
    else {
      lockRef.current = true;
      setError('');
      try {
        await onSubmit({
          fromEmployeeId: member.employeeId,
          toEmployeeId,
          shiftDate,
          shiftId: Number(shiftId),
          reason: reason.trim(),
        });
      } catch (submitError) {
        setError(submitError?.message || 'Unable to submit the shift swap request.');
      } finally {
        lockRef.current = false;
      }
    }
  };

  return (
    <RequestModalShell
      visible={visible}
      title="Request Shift Swap"
      subtitle="Swap your shift with another team member"
      icon="swap-horizontal"
      onClose={onClose}
    >
      <ScrollView style={styles.formScroll} contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
        <ReadonlyField label="Current Shift" value={shiftLabel(currentShift || (member?.shiftName ? { name: member.shiftName } : null))} />
        <SelectionField
          label="Technology"
          placeholder={technologies.length ? 'All technologies' : 'No technology data'}
          value={technology}
          options={[{ value: '', label: 'All technologies' }, ...technologies.map((item) => ({ value: item, label: item }))]}
          open={openSelect === 'technology'}
          onToggle={() => setOpenSelect(openSelect === 'technology' ? '' : 'technology')}
          onSelect={(value) => {
            setTechnology(value);
            setToEmployeeId('');
            setOpenSelect('');
            setError('');
          }}
          disabled={!technologies.length}
        />
        <SelectionField
          label="Swap With"
          placeholder={eligibleColleagues.length ? 'Select employee' : 'No eligible team members'}
          value={toEmployeeId}
          options={eligibleColleagues.map((candidate) => ({
            value: candidate.employeeId,
            label: `${candidate.name} (${candidate.employeeId})`,
          }))}
          open={openSelect === 'employee'}
          onToggle={() => setOpenSelect(openSelect === 'employee' ? '' : 'employee')}
          onSelect={(value) => { setToEmployeeId(value); setOpenSelect(''); setError(''); }}
          disabled={!eligibleColleagues.length}
        />
        <DateField label="Request Date" value={shiftDate} onChange={(value) => { setShiftDate(value); setError(''); }} />
        <SelectionField
          label="Shift"
          placeholder={loadingShifts ? 'Loading active shifts...' : shifts.length ? 'Select shift' : 'No active shifts available'}
          value={shiftId}
          options={shifts.map((shift) => ({ value: shift.id, label: shiftLabel(shift) }))}
          open={openSelect === 'shift'}
          onToggle={() => setOpenSelect(openSelect === 'shift' ? '' : 'shift')}
          onSelect={(value) => { setShiftId(value); setOpenSelect(''); setError(''); }}
          disabled={loadingShifts || !shifts.length}
        />
        <View style={styles.fieldGroup}>
          <FieldLabel>Reason (Optional)</FieldLabel>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Enter reason..."
            placeholderTextColor={colors.placeholder}
            multiline
            textAlignVertical="top"
          />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
      <FormFooter onClose={onClose} onSubmit={submit} saving={saving} disabled={saving || loadingShifts} />
    </RequestModalShell>
  );
}

export function ShiftChangeModal({ visible, member, shifts, loadingShifts, saving, onClose, onSubmit }) {
  const lockRef = useRef(false);
  const [requestedShiftId, setRequestedShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [reason, setReason] = useState('');
  const [openSelect, setOpenSelect] = useState(false);
  const [error, setError] = useState('');
  const currentShift = shifts.find((shift) => String(shift.id) === String(member?.shiftId));
  const alternatives = shifts.filter((shift) => String(shift.id) !== String(member?.shiftId));

  const submit = async () => {
    if (lockRef.current || saving) return;
    const today = toDateOnly(new Date());
    if (!member?.shiftId) setError('Your current shift could not be identified.');
    else if (!requestedShiftId || !effectiveFrom || (!isPermanent && !effectiveTo)) {
      setError('Choose a new shift and complete the required dates.');
    } else if (effectiveFrom < today) setError('From date cannot be in the past.');
    else if (!isPermanent && effectiveTo < effectiveFrom) setError('To date must be on or after the from date.');
    else {
      lockRef.current = true;
      setError('');
      try {
        await onSubmit({
          employeeId: member.employeeId,
          currentShiftId: Number(member.shiftId),
          requestedShiftId: Number(requestedShiftId),
          effectiveFrom,
          effectiveTo: isPermanent ? null : effectiveTo,
          isPermanent,
          reason: reason.trim(),
        });
      } catch (submitError) {
        setError(submitError?.message || 'Unable to submit the shift change request.');
      } finally {
        lockRef.current = false;
      }
    }
  };

  return (
    <RequestModalShell
      visible={visible}
      title="Request Shift Change"
      subtitle="Request a temporary or permanent shift change"
      icon="calendar-outline"
      onClose={onClose}
    >
      <ScrollView style={styles.formScroll} contentContainerStyle={styles.formBody} keyboardShouldPersistTaps="handled">
        <ReadonlyField label="Current Shift" value={shiftLabel(currentShift || (member?.shiftName ? { name: member.shiftName } : null))} />
        <SelectionField
          label="New Shift"
          placeholder={loadingShifts ? 'Loading active shifts...' : alternatives.length ? 'Select new shift' : 'No other shifts available'}
          value={requestedShiftId}
          options={alternatives.map((shift) => ({ value: shift.id, label: shiftLabel(shift) }))}
          open={openSelect}
          onToggle={() => setOpenSelect((current) => !current)}
          onSelect={(value) => { setRequestedShiftId(value); setOpenSelect(false); setError(''); }}
          disabled={loadingShifts || !alternatives.length}
        />
        <DateField label="From Date" value={effectiveFrom} onChange={(value) => { setEffectiveFrom(value); setError(''); }} />
        <DateField label="To Date" value={effectiveTo} onChange={(value) => { setEffectiveTo(value); setError(''); }} disabled={isPermanent} />
        <View style={styles.switchRow}>
          <Switch
            value={isPermanent}
            onValueChange={(value) => {
              setIsPermanent(value);
              if (value) setEffectiveTo('');
              setError('');
            }}
            trackColor={{ false: colors.inputBorderMuted, true: colors.primaryLight }}
            thumbColor={isPermanent ? colors.primary : colors.white}
          />
          <Text style={styles.switchText}>Permanent</Text>
        </View>
        <View style={styles.fieldGroup}>
          <FieldLabel>Reason (Optional)</FieldLabel>
          <TextInput
            style={styles.reasonInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Enter reason..."
            placeholderTextColor={colors.placeholder}
            multiline
            textAlignVertical="top"
          />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
      <FormFooter onClose={onClose} onSubmit={submit} saving={saving} disabled={saving || loadingShifts} />
    </RequestModalShell>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.screen,
    backgroundColor: colors.overlay,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radii.compactCard,
    backgroundColor: colors.surface,
    ...shadows.modal,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.primaryTint,
  },
  modalHeading: { flex: 1, minWidth: 0 },
  modalTitle: { color: colors.textPrimary, fontSize: fontSizes.headerTitle, fontWeight: fontWeights.extraBold },
  modalSubtitle: { marginTop: spacing.xs, color: colors.textSecondary, fontSize: fontSizes.base },
  closeButton: { width: sizes.minTouchTarget, height: sizes.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  formScroll: { flexShrink: 1 },
  formBody: { gap: spacing.lg, padding: spacing.xxl },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.textSecondary, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  fieldControl: {
    minHeight: sizes.inputHeightSmall,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
  },
  readonlyField: { backgroundColor: colors.mutedBackground },
  readonlyText: { flex: 1, color: colors.textSecondary, fontSize: fontSizes.body, fontWeight: fontWeights.semibold },
  disabledField: { opacity: 0.58 },
  fieldText: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.semibold },
  placeholderText: { color: colors.placeholder },
  optionList: {
    maxHeight: 176,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  optionRow: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  optionRowPressed: { backgroundColor: colors.primaryTintSoft },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: fontSizes.base, fontWeight: fontWeights.semibold },
  reasonInput: {
    minHeight: 88,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radii.md,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    backgroundColor: colors.inputBackground,
  },
  switchRow: { minHeight: sizes.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { color: colors.textPrimary, fontSize: fontSizes.body, fontWeight: fontWeights.bold },
  errorText: { color: colors.error, fontSize: fontSizes.base, fontWeight: fontWeights.semibold },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    padding: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondaryButton: {
    minHeight: sizes.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.textSecondary, fontSize: fontSizes.base, fontWeight: fontWeights.bold },
  primaryButton: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: colors.white, fontSize: fontSizes.base, fontWeight: fontWeights.extraBold },
});

