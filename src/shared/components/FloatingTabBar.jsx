import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROUTES } from '../../app/navigation/routeNames';
import { colors, fontSizes, fontWeights, radii, shadows, sizes, spacing } from '../../theme';

const TAB_ICONS = {
  [ROUTES.DASHBOARD]: ['grid-outline', 'grid'],
  [ROUTES.MY_ATTENDANCE]: ['calendar-outline', 'calendar'],
  [ROUTES.EMPLOYEE_LEAVES]: ['document-text-outline', 'document-text'],
  [ROUTES.PROFILE]: ['person-outline', 'person'],
};

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, spacing.tabBottomOffset) + spacing.xs },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key].options;
          const label = options.tabBarLabel || options.title || route.name;
          const isFocused = state.index === index;
          const [inactiveIcon, activeIcon] = TAB_ICONS[route.name] || ['ellipse-outline', 'ellipse'];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.item, isFocused && styles.itemActive]}
              onPress={onPress}
              activeOpacity={0.82}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || `${label} tab`}
            >
              <View style={[styles.iconBubble, isFocused && styles.iconBubbleActive]}>
                <Ionicons
                  name={isFocused ? activeIcon : inactiveIcon}
                  size={20}
                  color={isFocused ? colors.navigation.tabActiveIcon : colors.navigation.tabInactiveIcon}
                />
              </View>
              <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.tabHorizontalMargin,
  },
  container: {
    minHeight: sizes.floatingTabHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navigation.tabSurface,
    borderRadius: radii.tabBar,
    borderWidth: 1,
    borderColor: colors.navigation.tabBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  item: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: {},
  iconBubble: {
    width: sizes.tabIconBubble,
    height: sizes.tabIconBubble,
    borderRadius: sizes.tabIconBubble / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: {
    backgroundColor: colors.navigation.tabActiveBackground,
    borderWidth: 1,
    borderColor: colors.navigation.tabBorder,
  },
  label: {
    marginTop: 2,
    color: colors.navigation.tabInactiveText,
    fontSize: fontSizes.tabLabel,
    fontWeight: fontWeights.semibold,
  },
  labelActive: {
    color: colors.navigation.tabActiveText,
    fontWeight: fontWeights.extraBold,
  },
});
