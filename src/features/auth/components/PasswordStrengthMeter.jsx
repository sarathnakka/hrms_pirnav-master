import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme';

export default function PasswordStrengthMeter({ password }) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 390;
  const ruleUppercase = /^[A-Z]/.test(password);
  const ruleMinLength = password.length >= 8;
  const ruleNumber = /\d/.test(password);
  const ruleSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const satisfiedRulesCount =
    (ruleUppercase ? 1 : 0) +
    (ruleMinLength ? 1 : 0) +
    (ruleNumber ? 1 : 0) +
    (ruleSpecial ? 1 : 0);

  const getStrengthLabel = () => {
    if (password.length === 0) return 'Start typing to check strength';
    if (satisfiedRulesCount <= 1) return 'Weak';
    if (satisfiedRulesCount === 2) return 'Fair';
    if (satisfiedRulesCount === 3) return 'Good';
    return 'Strong';
  };

  const getStrengthColor = () => {
    if (password.length === 0) return colors.textSecondary;
    if (satisfiedRulesCount <= 1) return colors.error;
    if (satisfiedRulesCount === 2) return colors.warning;
    if (satisfiedRulesCount === 3) return colors.primary;
    return colors.success;
  };

  return (
    <View style={styles.strengthBoxContainer}>
      <View style={[styles.strengthHeaderRow, isNarrow && styles.strengthHeaderRowNarrow]}>
        <Text style={styles.strengthTitleText}>
          Password Strength
        </Text>
        <View style={[styles.strengthBadge, isNarrow && styles.strengthBadgeNarrow]}>
          <Text
            style={[
              styles.strengthBadgeText,
              { color: getStrengthColor() },
            ]}
          >
            {getStrengthLabel()}
          </Text>
        </View>
      </View>

      {/* 4 Segmented Progress Bars */}
      <View style={styles.barsContainer}>
        {[1, 2, 3, 4].map((step) => {
          const isFilled = password.length > 0 && satisfiedRulesCount >= step;
          return (
            <View
              key={step}
              style={[
                styles.strengthBar,
                isFilled && { backgroundColor: getStrengthColor() },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.rulesList}>
        <View style={styles.ruleItem}>
          <View style={[styles.bulletDot, ruleUppercase && styles.bulletDotSatisfied]} />
          <Text style={[styles.ruleText, ruleUppercase && styles.ruleTextSatisfied]}>
            Start with an uppercase letter
          </Text>
        </View>
        <View style={styles.ruleItem}>
          <View style={[styles.bulletDot, ruleMinLength && styles.bulletDotSatisfied]} />
          <Text style={[styles.ruleText, ruleMinLength && styles.ruleTextSatisfied]}>
            Minimum 8 characters
          </Text>
        </View>
        <View style={styles.ruleItem}>
          <View style={[styles.bulletDot, ruleNumber && styles.bulletDotSatisfied]} />
          <Text style={[styles.ruleText, ruleNumber && styles.ruleTextSatisfied]}>
            At least one number
          </Text>
        </View>
        <View style={styles.ruleItem}>
          <View style={[styles.bulletDot, ruleSpecial && styles.bulletDotSatisfied]} />
          <Text style={[styles.ruleText, ruleSpecial && styles.ruleTextSatisfied]}>
            At least one special character
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strengthBoxContainer: {
    backgroundColor: colors.passwordPanel,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 17,
    marginTop: 2,
    marginBottom: 19,
    borderWidth: 1,
    borderColor: colors.brandBorderSoft,
    shadowColor: colors.primaryShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  strengthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: spacing.md,
  },
  strengthHeaderRowNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  strengthTitleText: {
    fontSize: fontSizes.body,
    lineHeight: 20,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  strengthBadge: {
    backgroundColor: colors.white,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.passwordBorder,
    flexShrink: 1,
    maxWidth: '62%',
  },
  strengthBadgeNarrow: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  strengthBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
    flexShrink: 1,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  strengthBar: {
    flex: 1,
    height: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.passwordTrack,
    marginHorizontal: 4,
  },
  rulesList: {
    width: '100%',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.passwordDot,
    marginRight: spacing.md,
    marginTop: 5,
  },
  bulletDotSatisfied: {
    backgroundColor: colors.primary,
  },
  ruleText: {
    fontSize: fontSizes.base,
    lineHeight: 19,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  ruleTextSatisfied: {
    color: colors.primary,
    fontWeight: '700',
  },
});


