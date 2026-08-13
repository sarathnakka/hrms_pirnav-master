import React, { forwardRef } from 'react';
import { TextInput } from 'react-native';

import { useKeyboardTabBarGuard } from '../keyboard/KeyboardTabBarGuard';

const AppTextInput = forwardRef(function AppTextInput(
  {
    onFocus,
    onPressIn,
    ...props
  },
  ref
) {
  const { prepareForKeyboard } = useKeyboardTabBarGuard();

  const handlePressIn = (event) => {
    /*
     * Android reports keyboardDidShow after window resize begins, so hide the
     * floating navigation at the user's first input interaction.
     */
    prepareForKeyboard();
    onPressIn?.(event);
  };

  const handleFocus = (event) => {
    prepareForKeyboard();
    onFocus?.(event);
  };

  return (
    <TextInput
      ref={ref}
      {...props}
      onPressIn={handlePressIn}
      onFocus={handleFocus}
    />
  );
});

export default AppTextInput;
