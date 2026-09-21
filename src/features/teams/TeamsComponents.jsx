import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';

const WORK_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function getInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('') || '--';
}

export function TeamsState({ title, message, actionLabel, onAction, loading = false }) {
  return (
    <View style={styles.stateBox} accessibilityLiveRegion={loading ? 'polite' : 'none'}>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="people-outline" size={24} color={colors.primary} />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {onAction ? (
        <TouchableOpacity
          style={styles.stateButton}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel || 'Retry'}
        >
          <Text style={styles.stateButtonText}>{actionLabel || 'Retry'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ReportingDayChips({ days = [] }) {
  const activeDays = new Set(
    (Array.isArray(days) ? days : []).map((day) => String(day ?? '').trim().toLowerCase())
  );
  const displayedActiveDays = WORK_WEEK_DAYS.filter((day) => activeDays.has(day.toLowerCase()));

  return (
    <View style={styles.dayGrid} accessibilityLabel={`Reporting days ${displayedActiveDays.join(', ') || 'not available'}`}>
      {WORK_WEEK_DAYS.map((day) => {
        const isActive = activeDays.has(day.toLowerCase());
        return (
          <View key={day} style={[styles.dayChip, isActive ? styles.dayChipActive : styles.dayChipInactive]}>
            <Text style={[styles.dayChipText, isActive ? styles.dayChipTextActive : styles.dayChipTextInactive]}>
              {day}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function TeamCard({ team, onPress, disabled = false }) {
  const memberLabel = `${team.memberCount} ${team.memberCount === 1 ? 'member' : 'members'}`;

  return (
    <TouchableOpacity
      style={[styles.teamCard, disabled && styles.teamCardDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      accessibilityLabel={`Open ${team.teamName} team details, ${memberLabel}.`}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.teamNumberBadge}>
          <Text style={styles.teamNumberText}>{team.teamNumber}</Text>
        </View>
        <View style={styles.arrowBadge}>
          <Ionicons name="arrow-forward" size={20} color={colors.primary} />
        </View>
      </View>

      <Text style={styles.teamName} numberOfLines={2}>{team.teamName}</Text>
      {disabled ? <Text style={styles.teamHint}>Details unavailable</Text> : null}

      <View style={styles.metaGroup}>
        <View style={styles.metaRow}>
          <Ionicons name="person" size={16} color={colors.primary} />
          <View style={styles.metaTextWrap}>
            <Text style={styles.metaLabel}>Reporting Manager</Text>
            <Text style={styles.metaValue} numberOfLines={2}>{team.reportingManager}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="git-network" size={16} color={colors.primary} />
          <View style={styles.metaTextWrap}>
            <Text style={styles.metaLabel}>Project</Text>
            <Text style={styles.metaValue} numberOfLines={2}>{team.projectName}</Text>
          </View>
        </View>
      </View>

      <ReportingDayChips days={team.reportingDays} />

      <View style={styles.teamFooter}>
        <Text style={styles.footerLabel}>Reporting days</Text>
        <View style={styles.memberCount}>
          <Ionicons name="people" size={15} color={colors.textPrimary} />
          <Text style={styles.memberCountText}>{memberLabel}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function SummaryRow({ label, value, icon }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.summaryTextWrap}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

export function MemberRow({ member }) {
  const hasDetails = member.projectName !== '-' || member.engagementType !== '-' || member.wfoDays.length > 0 || member.wfhDays.length > 0;

  return (
    <View
      style={styles.memberRow}
      accessibilityLabel={`${member.name}, ${member.role}, employee ID ${member.employeeId}.`}
    >
      <View style={styles.memberHeader}>
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>{getInitials(member.name)}</Text>
        </View>
        <View style={styles.memberMain}>
          <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
          <Text style={styles.memberRole} numberOfLines={1}>{member.role}</Text>
          {member.isCrossTeam ? (
            <View style={styles.crossTeamBadge}>
              <Text style={styles.crossTeamText}>cross-team</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.employeeIdPill}>
          <Text style={styles.employeeIdText} numberOfLines={1}>{member.employeeId}</Text>
        </View>
      </View>

      {hasDetails ? (
        <View style={styles.memberDetails}>
          {member.projectName !== '-' ? <Text style={styles.detailText} numberOfLines={1}>Project: {member.projectName}</Text> : null}
          {member.engagementType !== '-' ? <Text style={styles.detailText} numberOfLines={1}>Engagement: {member.engagementType}</Text> : null}
          {member.wfoDays.length > 0 ? <Text style={styles.detailText}>WFO: {member.wfoDays.join(', ')}</Text> : null}
          {member.wfhDays.length > 0 ? <Text style={styles.detailText}>WFH: {member.wfhDays.join(', ')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.teams.emptySurface,
    borderWidth: 1,
    borderColor: colors.teams.border,
    borderRadius: radii.compactCard,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 19,
    textAlign: 'center',
  },
  stateButton: {
    minHeight: sizes.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  stateButtonText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  teamCard: {
    backgroundColor: colors.teams.surface,
    borderWidth: 1,
    borderColor: colors.teams.border,
    borderRadius: radii.compactCard,
    padding: spacing.xxl,
    gap: spacing.md,
    ...shadows.subtle,
  },
  teamCardDisabled: {
    opacity: 0.72,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamNumberBadge: {
    minHeight: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teams.teamNumberBackground,
    borderWidth: 1,
    borderColor: colors.teams.border,
    paddingHorizontal: spacing.lg,
  },
  teamNumberText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  arrowBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teams.actionBackground,
  },
  teamName: {
    color: colors.textPrimary,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 23,
  },
  teamHint: {
    marginTop: -spacing.md,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
  },
  metaGroup: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  metaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  metaValue: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  dayGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.xs,
  },
  dayChip: {
    flex: 1,
    minHeight: 28,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  dayChipActive: {
    backgroundColor: colors.teams.dayActiveBackground,
    borderColor: colors.teams.dayActiveBorder,
  },
  dayChipInactive: {
    backgroundColor: colors.teams.dayInactiveBackground,
    borderColor: colors.teams.dayInactiveBorder,
  },
  dayChipText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  dayChipTextActive: {
    color: colors.teams.dayActiveText,
  },
  dayChipTextInactive: {
    color: colors.teams.dayInactiveText,
  },
  teamFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  footerLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberCountText: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.teams.rowDivider,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teams.actionBackground,
  },
  summaryTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  memberRow: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.teams.border,
    borderRadius: radii.compactCard,
    backgroundColor: colors.teams.surface,
    ...shadows.subtle,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.teams.teamNumberBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  memberName: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  memberRole: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  crossTeamBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.teams.crossTeamBackground,
  },
  crossTeamText: {
    color: colors.teams.crossTeamText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  employeeIdPill: {
    maxWidth: '32%',
    minHeight: 28,
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.teams.employeeIdBackground,
  },
  employeeIdText: {
    color: colors.teams.employeeIdText,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  memberDetails: {
    marginTop: spacing.sm,
    marginLeft: 38 + spacing.md,
    gap: spacing.xs,
  },
  detailText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
  },
});
