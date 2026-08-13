import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROUTES } from '../../app/navigation/routeNames';
import AppTextInput from '../../shared/components/AppTextInput';
import { useAuth } from '../auth/AuthContext';
import { colors, fontSizes, fontWeights, lineHeights, radii, shadows, sizes, spacing } from '../../theme';
import { TeamCard, TeamsState } from './TeamsComponents';
import { getTeams } from './teamsApi';
import { normalizeTeams } from './teamMappers';

function teamCountLabel(count) {
  return `${count} ${count === 1 ? 'Team' : 'Teams'}`;
}

export default function TeamsScreen({ navigation }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const abortRef = useRef(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const contentWidth = Math.min(Math.max(width - spacing.screen * 2, 288), 680);

  const loadTeams = useCallback(async ({ refresh = false } = {}) => {
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
      const response = await getTeams(token, { signal: controller.signal });
      const normalizedTeams = normalizeTeams(response);
      if (!controller.signal.aborted) {
        setTeams(normalizedTeams);
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError?.message || 'Unable to load teams.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    loadTeams();
    return () => abortRef.current?.abort();
  }, [loadTeams]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return teams;
    return teams.filter((team) => team.searchText.includes(query));
  }, [search, teams]);

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

  const renderHeader = () => (
    <View style={[styles.headerContent, { width: contentWidth }]}>
      <View style={styles.headingBlock}>
        <Text style={styles.title} accessibilityRole="header">Teams</Text>
        <Text style={styles.subtitle}>
          Click a team to view members, projects and reporting days.
        </Text>
      </View>

      <View style={styles.countBadge}>
        <Ionicons name="people" size={18} color={colors.primary} />
        <Text style={styles.countText}>{teamCountLabel(teams.length)}</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <AppTextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search teams, manager, project or members"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search teams, manager, project or members"
        />
        {search ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearch('')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Clear team search"
          >
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState title="Loading teams" message="Fetching your assigned teams." loading />
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.stateWrap, { width: contentWidth }]}>
          <TeamsState
            title="Unable to load teams."
            message="Please check your connection and try again."
            actionLabel="Retry"
            onAction={() => loadTeams()}
          />
        </View>
      );
    }

    return (
      <View style={[styles.stateWrap, { width: contentWidth }]}>
        <TeamsState
          title={search.trim() ? 'No teams match your search.' : 'No teams available.'}
          message={search.trim() ? 'Try a different team, manager, project or member.' : 'Assigned teams will appear here.'}
        />
      </View>
    );
  };

  return (
    <FlatList
      data={error ? [] : filteredTeams}
      keyExtractor={(item) => item.key}
      renderItem={renderTeam}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingBottom: insets.bottom + sizes.floatingTabHeight + spacing.screenVertical,
        },
      ]}
      columnWrapperStyle={undefined}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadTeams({ refresh: true })}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    alignItems: 'center',
    padding: spacing.screen,
    gap: spacing.sectionGap,
    backgroundColor: colors.teams.background,
  },
  headerContent: {
    maxWidth: 680,
    gap: spacing.xxl,
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
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  countBadge: {
    minHeight: sizes.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.teams.countBadgeBackground,
    borderWidth: 1,
    borderColor: colors.teams.border,
  },
  countText: {
    color: colors.primary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
  },
  searchWrap: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.teams.searchBackground,
    borderWidth: 1,
    borderColor: colors.teams.searchBorder,
    ...shadows.subtle,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    paddingVertical: spacing.md,
  },
  clearButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  stateWrap: {
    maxWidth: 680,
  },
  separator: {
    height: spacing.sectionGap,
  },
});
