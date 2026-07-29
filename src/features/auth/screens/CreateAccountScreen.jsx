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
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROUTES } from '../../../app/navigation/routeNames';
import BackgroundGrid from '../../../shared/components/BackgroundGrid';
import LogoHeader from '../../../shared/components/LogoHeader';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  shadows,
  sizes,
  spacing,
} from '../../../theme';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';

import { getRoles, registerUser } from '../authApi';

export default function CreateAccountScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isSmallDevice = width < 360;
  const isTablet = width >= 768;
  const cardWidth = Math.min(width - 24, isTablet ? 520 : 410);
  const cardPadding = isSmallDevice ? spacing.xxl : isTablet ? 32 : 20;

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1)), useNativeDriver: true }),
    ]).start();
  }, []);

  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    async function fetchRoles() {
      const res = await getRoles();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        // Filter out inactive roles
        const activeRoles = res.data.filter((r) => r.isActive !== false);
        const rolesToUse = activeRoles.length > 0 ? activeRoles : res.data;
        setSelectedRole(rolesToUse[0]);
      } else {
        const fallbackRoles = [
          { id: 1, name: 'Admin', isActive: true },
          { id: 4, name: 'Manager', isActive: true },
          { id: 5, name: 'HR Admin', isActive: true },
        ];
        setSelectedRole(fallbackRoles[0]);
      }
    }
    fetchRoles();
  }, []);

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

  const handleCreateAccount = async () => {
    if (!fullName.trim() || !regEmail || !newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
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

    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const result = await registerUser(firstName, lastName, regEmail, newPassword, confirmPassword, selectedRole);

    setIsLoading(false);

    if (result.success) {
      Alert.alert(
        'Account Created!',
        `Welcome ${firstName}! Your PIRNAV HRMS account has been created successfully.`,
        [
          {
            text: 'Proceed to Login',
            onPress: () => navigation.navigate(ROUTES.LOGIN),
          },
        ]
      );
    } else {
      Alert.alert(
        'Registration Failed',
        result.message || 'Unable to create account. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.authStatusBar} />
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
            <LogoHeader showBack={false} compact />

            <View style={[styles.formCard, { padding: cardPadding }]}>
              <Text style={styles.welcomeTag}>EMPLOYEE ONBOARDING</Text>

              <Text style={[styles.titleText, isSmallDevice && styles.titleTextSmall]}>
                Create Your PIRNAV HRMS{'\n'}Account
              </Text>

            {/* Full Name Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <View style={[styles.inputContainer, isSmallDevice && styles.inputContainerSmall]}>
                <Ionicons
                  name="person"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            {/* Email Address Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={[styles.inputContainer, isSmallDevice && styles.inputContainerSmall]}>
                <Ionicons
                  name="mail"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={regEmail}
                  onChangeText={setRegEmail}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Email address"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={[styles.inputContainer, isSmallDevice && styles.inputContainerSmall]}>
                <Ionicons
                  name="lock-closed"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  style={styles.eyeIconPressable}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
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

            {/* Confirm Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
              <View style={[styles.inputContainer, isSmallDevice && styles.inputContainerSmall]}>
                <Ionicons
                  name="lock-closed"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  accessibilityLabel="Confirm password"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIconPressable}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Create Account Action Button */}
            <TouchableOpacity
              style={[styles.primaryButton, isSmallDevice && styles.primaryButtonSmall]}
              onPress={handleCreateAccount}
              disabled={isLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityState={{ disabled: isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {/* Footer Back to Sign In */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate(ROUTES.LOGIN)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                <Text style={styles.accentText}>Sign in</Text>
              </TouchableOpacity>
            </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.authStatusBar,
  },
  keyboardAvoidingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 30,
    backgroundColor: colors.background,
  },
  mainWrapper: {
    alignSelf: 'center',
  },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.primaryShadow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 5,
  },
  welcomeTag: {
    fontSize: 12,
    fontWeight: fontWeights.extraBold,
    color: colors.primary,
    letterSpacing: 2.2,
    marginBottom: 13,
  },
  titleText: {
    fontSize: 24,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
    marginBottom: 24,
    letterSpacing: 0,
    lineHeight: 28,
  },
  titleTextSmall: {
    fontSize: 21,
    lineHeight: 25,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 9,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radii.compactCard,
    borderWidth: 1.2,
    borderColor: colors.inputBorder,
    paddingHorizontal: 22,
    height: sizes.authInputHeight,
  },
  inputContainerSmall: {
    height: sizes.authInputHeightSmall,
    paddingHorizontal: 18,
  },
  inputIcon: {
    marginRight: 22,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
  },
  eyeIconPressable: {
    padding: spacing.md,
    marginRight: -spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.compactCard,
    height: sizes.authButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.primary,
    marginTop: spacing.xs,
    marginBottom: 28,
  },
  primaryButtonSmall: {
    height: sizes.buttonHeightSmall,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  accentText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.extraBold,
    color: colors.primary,
  },
});


