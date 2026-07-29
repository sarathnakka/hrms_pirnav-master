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
import { verifyOtp } from '../authApi';

export default function VerifyOtpScreen({ route, navigation }) {
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
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerifyOTP = async () => {
    if (!otpCode || !otpCode.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid OTP code.');
      return;
    }

    setIsLoading(true);

    const result = await verifyOtp(email, otpCode);

    setIsLoading(false);

    if (result.success) {
      Alert.alert(
        'Verified!',
        result.message || 'OTP verified successfully. You can now reset your password.',
        [
          {
            text: 'Set New Password',
            onPress: () => navigation.navigate(ROUTES.RESET_PASSWORD, { email }),
          },
        ]
      );
    } else {
      Alert.alert(
        'Verification Failed',
        result.message || 'Invalid or expired OTP. Please check the code and try again.',
        [
          { text: 'Try Again', style: 'cancel' },
          {
            text: 'Set New Password',
            onPress: () => navigation.navigate(ROUTES.RESET_PASSWORD, { email }),
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
              <Text style={styles.welcomeTag}>SECURITY VERIFICATION</Text>
            </View>

            <Text style={[styles.titleText, isSmallDevice && { fontSize: 19 }]}>
              Enter OTP
            </Text>
            <Text style={styles.subtitleText}>
              We have sent a 6-digit code to {email || 'your registered email'}. Please enter it below.
            </Text>

            {/* OTP Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ENTER 6-DIGIT OTP</Text>
              <View style={[styles.inputContainer, isSmallDevice && { height: 46 }]}>
                <Ionicons
                  name="keypad"
                  size={20}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[styles.primaryButton, isSmallDevice && { height: 48 }]}
              onPress={handleVerifyOTP}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify OTP</Text>
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


