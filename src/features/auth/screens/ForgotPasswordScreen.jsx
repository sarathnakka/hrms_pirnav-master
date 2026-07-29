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
import { forgotPassword } from '../authApi';

export default function ForgotPasswordScreen({ route, navigation }) {
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

  const initialEmail = route?.params?.email || '';
  const [recoveryEmail, setRecoveryEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOTP = async () => {
    if (!recoveryEmail || !recoveryEmail.trim()) {
      Alert.alert('Validation Error', 'Please enter your registered email address.');
      return;
    }

    setIsLoading(true);

    const result = await forgotPassword(recoveryEmail);

    setIsLoading(false);

    if (result.success) {
      Alert.alert(
        'OTP Sent!',
        result.message || `A 6-digit secure OTP has been sent to ${recoveryEmail}`,
        [
          {
            text: 'Enter OTP',
            onPress: () => navigation.navigate(ROUTES.VERIFY_OTP, { email: recoveryEmail }),
          },
        ]
      );
    } else {
      Alert.alert(
        'Request Failed',
        result.message || 'Unable to process forgot password request. Please try again.',
        [
          { text: 'Try Again', style: 'cancel' },
          {
            text: 'Enter OTP',
            onPress: () => navigation.navigate(ROUTES.VERIFY_OTP, { email: recoveryEmail }),
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
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.inlineBackButton}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.welcomeTag}>PASSWORD RECOVERY</Text>
            </View>

            <Text style={[styles.titleText, isSmallDevice && { fontSize: 19 }]}>
              Forgot Password?
            </Text>
            <Text style={styles.subtitleText}>
              Enter your registered email address and we'll send a secure OTP to continue.
            </Text>

            {/* Email Address Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={[styles.inputContainer, isSmallDevice && { height: 46 }]}>
                <Ionicons
                  name="mail"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={recoveryEmail}
                  onChangeText={setRecoveryEmail}
                  placeholder="Enter your email address"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Send OTP Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 8 }, isSmallDevice && { height: 48 }]}
              onPress={handleSendOTP}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Send OTP</Text>
              )}
            </TouchableOpacity>

            {/* Back to Login Link */}
            <TouchableOpacity
              style={styles.backToLoginContainer}
              onPress={() => navigation.navigate(ROUTES.LOGIN)}
              activeOpacity={0.7}
            >
              <Text style={styles.accentText}>Back to Login</Text>
            </TouchableOpacity>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  inlineBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tealTintSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandBorderSoft,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 4,
  },
  welcomeTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.2,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textHeading,
    marginBottom: 10,
    letterSpacing: -0.3,
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
    borderRadius: 14,
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 20,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  backToLoginContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  accentText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});


