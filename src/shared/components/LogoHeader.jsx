import React from 'react';
import { StyleSheet, View, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme';

export default function LogoHeader({ onBack, showBack, compact = false }) {
  const { width } = useWindowDimensions();
  const isSmallDevice = width < 360;
  const isTablet = width >= 768;

  return (
    <View style={[styles.logoCard, compact && styles.logoCardCompact, { paddingVertical: compact ? 12 : isSmallDevice ? 12 : 18 }]}>
      {showBack && (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
      )}
      <Image
        source={require('../../../assets/headerlogo.png')}
        style={[styles.logoImage, { height: compact ? (isSmallDevice ? 70 : 82) : isSmallDevice ? 54 : isTablet ? 92 : 74 }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoCard: {
    backgroundColor: colors.transparentWhite,
    borderRadius: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
  },
  logoCardCompact: {
    borderRadius: 22,
    marginBottom: 20,
    paddingHorizontal: 22,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: [{ translateY: -18 }],
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tealTintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brandBorderSoft,
    zIndex: 10,
  },
  logoImage: {
    width: '100%',
    maxWidth: 360,
  },
});


