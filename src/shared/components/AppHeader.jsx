import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSizes, fontWeights, shadows, sizes, spacing } from '../../theme';

const iconLogo = require('../../../assets/iconlogo.png');

export default function AppHeader({ navigation, title }) {
  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={openDrawer}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Open navigation drawer"
        >
          <Ionicons name="menu" size={sizes.headerIcon} color={colors.textPrimary} />
        </TouchableOpacity>

        <Image
          source={iconLogo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="PIRNAV logo"
        />

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.trailingSpace} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.navigation.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.subtle,
  },
  container: {
    minHeight: sizes.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    gap: spacing.md,
  },
  iconButton: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
    borderRadius: sizes.minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navigation.headerIconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    flex: 1,
    color: colors.navigation.headerTitle,
    fontSize: fontSizes.headerTitle,
    fontWeight: fontWeights.extraBold,
    textAlign: 'left',
  },
  logo: {
    width: sizes.headerLogoWidth,
    height: sizes.headerLogoHeight,
  },
  trailingSpace: {
    width: sizes.minTouchTarget,
    height: sizes.minTouchTarget,
  },
});
