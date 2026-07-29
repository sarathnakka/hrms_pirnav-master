import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ROUTES } from '../../../app/navigation/routeNames';
import BackgroundGrid from '../../../shared/components/BackgroundGrid';
import LogoHeader from '../../../shared/components/LogoHeader';
import { colors } from '../../../theme';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';

import { resetPassword } from '../authApi';

export default function ResetPasswordScreen({ route, navigation }) {
  const { width } = useWindowDimensions();
  const isSmallDevice = width < 360;
  const isTablet = width >= 768;
  const cardWidth = Math.min(width - 32, isTablet ? 520 : 440);
  const cardPadding = isSmallDevice ? 18 : isTablet ? 32 : 24;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1)), useNativeDriver: true }),
    ]).start();
  }, []);

  const email = route?.params?.email || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password validation rules
  const ruleUppercase = /^[A-Z]/.test(newPassword);
  const ruleMinLength = newPassword.length >= 8;
  const ruleNumber = /\d/.test(newPassword);
  const ruleSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

  const satisfiedRulesCount =
    (ruleUppercase ? 1 : 0) +
    (ruleMinLength ? 1 : 0) +
    (ruleNumber ? 1 : 0) +
    (ruleSpecial ? 1 : 0);

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'Please enter both password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }
    if (satisfiedRulesCount < 4) {
      Alert.alert('Weak Password', 'Please fulfill all password requirements.');
      return;
    }

    setIsLoading(true);

    const result = await resetPassword(newPassword, confirmPassword, email);

    setIsLoading(false);

    if (result.success) {
      Alert.alert(
        'Password Reset Successful!',
        result.message || 'Your password has been updated. Please sign in with your new credentials.',
        [
          {
            text: 'Sign In Now',
            onPress: () => navigation.navigate(ROUTES.LOGIN),
          },
        ]
      );
    } else {
      Alert.alert(
        'Reset Failed',
        result.message || 'Unable to reset password. Please try again.',
        [
          { text: 'Try Again', style: 'cancel' },
          {
            text: 'Back to Login',
            onPress: () => navigation.navigate(ROUTES.LOGIN),
          },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <BackgroundGrid />
        <Animated.View style={[styles.mainWrapper, { width: cardWidth, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <LogoHeader showBack={true} onBack={() => navigation.goBack()} />

          <View style={[styles.formCard, { padding: cardPadding }]}>
            <Text style={styles.welcomeTag}>ACCOUNT SECURITY</Text>

            <Text style={[styles.titleText, isSmallDevice && { fontSize: 19 }]}>
              Reset Your Password
            </Text>

            <Text style={styles.subtitleText}>
              Create a new secure password for your PIRNAV HRMS account.
            </Text>

            {/* New Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <View style={[styles.inputContainer, isSmallDevice && { height: 46 }]}>
                <Ionicons
                  name="lock-closed"
                  size={19}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeIconPressable}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Password Strength Box */}
            <PasswordStrengthMeter password={newPassword} />

            {/* Confirm New Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
              <View style={[styles.inputContainer, isSmallDevice && { height: 46 }]}>
                <Ionicons
                  name="lock-closed"
                  size={19}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIconPressable}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Reset Password Action Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 4 }, isSmallDevice && { height: 48 }]}
              onPress={handleResetPassword}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            {/* Back to Sign In Link */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Remembered your password? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate(ROUTES.LOGIN)}
                activeOpacity={0.7}
              >
                <Text style={styles.accentText}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  mainWrapper: {
    alignSelf: 'center',
  },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    shadowColor: colors.primaryShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  welcomeTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  subtitleText: {
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
    fontWeight: '400',
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: colors.inputBorder,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  eyeIconPressable: {
    padding: 6,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 24,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13.5,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  accentText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.primary,
  },
});


