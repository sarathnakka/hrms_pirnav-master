import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';

const PRE_KEYBOARD_HIDE_FAILSAFE_MS = 800;

const KeyboardTabBarContext = createContext(null);

function getKeyboardVisible() {
  return typeof Keyboard.isVisible === 'function' ? Keyboard.isVisible() : false;
}

export function KeyboardTabBarProvider({ children }) {
  const preparationTimerRef = useRef(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(getKeyboardVisible);
  const [isKeyboardOpening, setIsKeyboardOpening] = useState(false);

  const clearPreparationTimer = useCallback(() => {
    if (preparationTimerRef.current) {
      clearTimeout(preparationTimerRef.current);
      preparationTimerRef.current = null;
    }
  }, []);

  const cancelKeyboardPreparation = useCallback(() => {
    clearPreparationTimer();
    setIsKeyboardOpening(false);
  }, [clearPreparationTimer]);

  const prepareForKeyboard = useCallback(() => {
    clearPreparationTimer();
    setIsKeyboardOpening(true);

    preparationTimerRef.current = setTimeout(() => {
      if (!getKeyboardVisible()) {
        setIsKeyboardOpening(false);
      }

      preparationTimerRef.current = null;
    }, PRE_KEYBOARD_HIDE_FAILSAFE_MS);
  }, [clearPreparationTimer]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = () => {
      clearPreparationTimer();
      setIsKeyboardOpening(false);
      setIsKeyboardVisible(true);
    };

    const handleKeyboardHide = () => {
      clearPreparationTimer();
      setIsKeyboardOpening(false);
      setIsKeyboardVisible(false);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [clearPreparationTimer]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      const visible = getKeyboardVisible();
      setIsKeyboardVisible(visible);

      if (!visible) {
        setIsKeyboardOpening(false);
      }
    });

    return () => {
      subscription.remove();
      clearPreparationTimer();
    };
  }, [clearPreparationTimer]);

  const value = useMemo(() => ({
    shouldHideFloatingTabBar: isKeyboardOpening || isKeyboardVisible,
    prepareForKeyboard,
    cancelKeyboardPreparation,
  }), [cancelKeyboardPreparation, isKeyboardOpening, isKeyboardVisible, prepareForKeyboard]);

  return (
    <KeyboardTabBarContext.Provider value={value}>
      {children}
    </KeyboardTabBarContext.Provider>
  );
}

export function useKeyboardTabBarGuard() {
  const context = useContext(KeyboardTabBarContext);

  if (!context) {
    return {
      shouldHideFloatingTabBar: false,
      prepareForKeyboard: () => {},
      cancelKeyboardPreparation: () => {},
    };
  }

  return context;
}
