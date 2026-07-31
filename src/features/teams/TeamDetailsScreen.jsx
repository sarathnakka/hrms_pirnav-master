import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { MemberRow, ReportingDayChips, SummaryRow, TeamsState } from './TeamsComponents';
import { getTeamById } from './teamsApi';
import { normalizeTeamDetails } from './teamMappers';

export default function TeamDetailsScreen({ route }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const abortRef = useRef(null);
  const teamId = route?.params?.teamId;
  const initialTeam = route?.params?.initialTeam || null;
  const [team, setTeam] = useState(initialTeam);
  const [loading, setLoading] = useState(!initialTeam);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const members = useMemo(() => team?.members || [], [team]);

  const loadTeamDetails = useCallback(async ({ refresh = false } = {}) => {
    if (!teamId) {
      setError('Team details are unavailable.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await getTeamById(teamId, token, { signal: controller.signal });
      const normalizedTeam = normalizeTeamDetails(response, initialTeam);
      if (!controller.signal.aborted) {
        setTeam(normalizedTeam);
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError?.message || 'Unable to load team details.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [initialTeam, teamId, token]);

  useEffect(() => {
    loadTeamDetails();
    return () => abortRef.current?.abort();
  }, [loadTeamDetails]);

  const renderHeader = () => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      {team ? (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.kickerBadge}>
              <Text style={styles.kickerText}>Team Summary</Text>
            </View>
            <Text style={styles.teamName} accessibilityRole="header">{team.teamName}</Text>
            <Text style={styles.description}>Members, project alignment and reporting setup.</Text>

            <View style={styles.summaryList}>
              <SummaryRow label="Team Number" value={team.teamNumber} icon="albums-outline" />
              <SummaryRow label="Reporting Manager" value={team.reportingManager} icon="person-outline" />
              <SummaryRow label="Project Name" value={team.projectName} icon="git-network-outline" />
              <SummaryRow label="Engagement Type" value={team.engagementType} icon="briefcase-outline" />
              <SummaryRow label="Total Members" value={String(team.memberCount)} icon="people-outline" />
            </View>

            <View style={styles.reportingBlock}>
              <Text style={styles.reportingTitle}>Reporting Days</Text>
              <ReportingDayChips days={team.reportingDays} />
            </View>
          </View>

          <View style={styles.countCard}>
            <View style={styles.countTextBlock}>
              <Text style={styles.countLabel}>Members Count</Text>
              <Text style={styles.countValue}>{team.memberCount}</Text>
              <Text style={styles.countDescription}>
                Employees currently assigned to {team.teamName}.
              </Text>
            </View>
            <View style={styles.countIcon}>
              <Ionicons name="people" size={24} color={colors.primary} />
            </View>
          </View>

          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>Members</Text>
            <Text style={styles.membersSubtitle}>
              Project alignment, reporting days and member information.
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState title="Loading team details" message="Fetching the latest members and reporting setup." loading />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState
            title="Unable to load team details."
            message="Please check your connection and try again."
            actionLabel="Retry"
            onAction={() => loadTeamDetails()}
          />
        </View>
      );
    }

    return (
      <View style={[styles.stateWrap, { width: contentWidth }]}>
        <TeamsState
          title="No team members"
          message={team ? `${team.teamName} does not have assigned members yet.` : 'Team details were not found.'}
        />
      </View>
    );
  };

  const renderMember = useCallback(({ item }) => (
    <View style={{ width: contentWidth }}>
      <MemberRow member={item} />
    </View>
  ), [contentWidth]);

  return (
    <FlatList
      data={error ? [] : members}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderMember}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingBottom: insets.bottom + sizes.floatingTabHeight + spacing.screenVertical,
        },
      ]}
      ItemSeparatorComponent={null}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadTeamDetails({ refresh: true })}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
      accessibilityLabel={`Team details for ${team?.teamName || 'selected team'}`}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    alignItems: 'center',
    padding: spacing.screen,
    backgroundColor: colors.teams.background,
  },
  headerContent: {
    maxWidth: 680,
    gap: spacing.sectionGap,
  },
  summaryCard: {
    gap: spacing.xxl,
    padding: spacing.xxl,
    borderRadius: radii.compactCard,
    backgroundColor: colors.teams.surface,
    borderWidth: 1,
    borderColor: colors.teams.border,
    ...shadows.dashboard,
  },
  kickerBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.teams.countBadgeBackground,
  },
  kickerText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  teamName: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: lineHeights.title,
  },
  description: {
    marginTop: -spacing.md,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  summaryList: {
    gap: spacing.lg,
  },
  reportingBlock: {
    gap: spacing.md,
  },
  reportingTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  countCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xxl,
    padding: spacing.xxl,
    borderRadius: radii.compactCard,
    backgroundColor: colors.teams.surface,
    borderWidth: 1,
    borderColor: colors.teams.border,
    ...shadows.dashboard,
  },
  countTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  countLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
  },
  countValue: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: fontWeights.extraBold,
  },
  countDescription: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },
  countIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teams.membersCountBackground,
  },
  membersHeader: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  membersTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardSectionTitle,
    fontWeight: fontWeights.extraBold,
  },
  membersSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  stateWrap: {
    maxWidth: 680,
    marginTop: spacing.sectionGap,
  },
});
