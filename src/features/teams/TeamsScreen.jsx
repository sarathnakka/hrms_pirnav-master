import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { ROUTES } from '../../app/navigation/routeNames';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, radii, sizes, spacing } from '../../theme';
import { TeamCard, TeamsState } from './TeamsComponents';
import { getMyTeam } from './teamsApi';
import { normalizeMyTeam } from './teamMappers';

export default function TeamsScreen({ navigation }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const abortRef = useRef(null);
  const [teamResult, setTeamResult] = useState({ token, team: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);
  const team = teamResult.token === token ? teamResult.team : null;
  const isLoading = loading || teamResult.token !== token;

  const loadMyTeam = useCallback(async ({ refresh = false } = {}) => {
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
          setError(requestError?.message || 'Unable to load your team.');
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
    loadMyTeam();
    return () => abortRef.current?.abort();
  }, [loadMyTeam]);

  const openTeam = useCallback((team) => {
    if (!team.id) {
      return;
    }

    navigation.navigate(ROUTES.TEAM_DETAILS, {
      teamId: team.id,
      initialTeam: team,
    });
  }, [navigation]);

  const renderTeam = useCallback(({ item }) => (
    <View style={{ width: contentWidth }}>
      <TeamCard team={item} onPress={() => openTeam(item)} disabled={!item.id} />
    </View>
  ), [contentWidth, openTeam]);

  const header = (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      <View style={styles.headingBlock}>
        <Text style={styles.title} accessibilityRole="header">My Team</Text>
      </View>

      {!isLoading && !error && team && <View style={styles.countBadge}>
        <Ionicons name="people" size={18} color={colors.primary} />
        <Text style={styles.countText}>My Team</Text>
      </View>}
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState title="Loading your team" message="Fetching your assigned team." loading />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState
            title="Unable to load your team"
            message="Please check your connection and try again."
            actionLabel="Retry"
            onAction={() => loadMyTeam()}
          />
        </View>
      );
    }

    return (
      <View style={[styles.stateWrap, { width: contentWidth }]}>
        <TeamsState
          title="No team assigned"
          message="You are not currently assigned to a team."
        />
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.list}
        data={isLoading || error || !team ? [] : [team]}
        keyExtractor={(item) => item.key}
        renderItem={renderTeam}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + sizes.floatingTabHeight + spacing.screenVertical },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMyTeam({ refresh: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.teams.background,
  },
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
    alignSelf: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sectionGap,
  },
  headingBlock: {
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.dashboardTitle,
    fontWeight: fontWeights.extraBold,
    lineHeight: 31,
  },
  countBadge: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.teams.countBadgeBackground,
    borderWidth: 1,
    borderColor: colors.teams.border,
  },
  countText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  stateWrap: {
    width: '100%',
    maxWidth: 680,
  },
  separator: {
    height: spacing.sectionGap,
  },
});
