import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { MemberRow, ReportingDayChips, SummaryRow, TeamsState } from './TeamsComponents';
import { getMyTeam } from './teamsApi';
import { normalizeMyTeam } from './teamMappers';

export default function TeamDetailsScreen({ route }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const abortRef = useRef(null);
  const initialTokenRef = useRef(token);
  const initialTeam = route?.params?.initialTeam || null;
  const [teamResult, setTeamResult] = useState({ token, team: initialTeam });
  const [loading, setLoading] = useState(!initialTeam);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const team = teamResult.token === token ? teamResult.team : null;
  const isLoading = loading || teamResult.token !== token;
  const members = useMemo(() => team?.members || [], [team]);

  const loadTeamDetails = useCallback(async ({ refresh = false } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setTeamResult({ token, team: null });
    }
    setError('');

    try {
      const response = await getMyTeam(token, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setTeamResult({ token, team: normalizeMyTeam(response) });
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        if (requestError?.status === 404 || requestError?.status === 204) {
          setTeamResult({ token, team: null });
        } else {
          setError(requestError?.message || 'Unable to load team details.');
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!initialTeam || initialTokenRef.current !== token) {
      loadTeamDetails();
    }
    return () => abortRef.current?.abort();
  }, [initialTeam, loadTeamDetails, token]);

  const renderHeader = () => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      {team ? (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.kickerText}>Team Summary</Text>
              <View style={styles.teamNumberBadge}>
                <Text style={styles.teamNumberText}>{team.teamNumber}</Text>
              </View>
            </View>
            <Text style={styles.teamName} accessibilityRole="header">{team.teamName}</Text>
            <Text style={styles.description}>Members, project alignment and reporting setup.</Text>

            <View style={styles.summaryList}>
              <SummaryRow label="Reporting Manager" value={team.reportingManager} icon="person-outline" />
              <SummaryRow label="Project Name" value={team.projectName} icon="git-network-outline" />
              <SummaryRow label="Engagement Type" value={team.engagementType} icon="briefcase-outline" />
            </View>

            <View style={styles.reportingBlock}>
              <Text style={styles.reportingTitle}>Reporting Days</Text>
              <ReportingDayChips days={team.reportingDays} />
            </View>
          </View>

          <View style={styles.membersHeader}>
            <Text style={styles.membersTitle}>Members</Text>
            <View style={styles.membersCountBadge}>
              <Text style={styles.membersCountText}>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
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
          title={team ? 'No team members' : 'No team assigned'}
          message={team ? `${team.teamName} does not have assigned members yet.` : 'You are not currently assigned to a team.'}
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
      style={styles.list}
      data={isLoading || error ? [] : members}
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
      ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
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
  list: {
    flex: 1,
    backgroundColor: colors.teams.background,
  },
  listContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: spacing.screen,
    backgroundColor: colors.teams.background,
  },
  headerContent: {
    maxWidth: 680,
    gap: spacing.md,
  },
  summaryCard: {
    gap: spacing.md,
    padding: spacing.xxl,
    borderRadius: radii.compactCard,
    backgroundColor: colors.teams.surface,
    borderWidth: 1,
    borderColor: colors.teams.border,
    ...shadows.subtle,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  teamNumberBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.teams.countBadgeBackground,
  },
  teamNumberText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  kickerText: {
    color: colors.primary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    textTransform: 'uppercase',
  },
  teamName: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: lineHeights.title,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  summaryList: {
    marginTop: spacing.sm,
  },
  reportingBlock: {
    gap: spacing.md,
  },
  reportingTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  membersTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardSectionTitle,
    fontWeight: fontWeights.extraBold,
  },
  membersCountBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.teams.membersCountBackground,
  },
  membersCountText: {
    color: colors.primary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  memberSeparator: {
    height: spacing.md,
  },
  stateWrap: {
    maxWidth: 680,
    marginTop: spacing.sectionGap,
  },
});
