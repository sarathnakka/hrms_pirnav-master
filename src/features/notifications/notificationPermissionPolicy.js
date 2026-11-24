export const NOTIFICATION_ONBOARDING_ACTIONS = {
  REGISTER: 'register',
  REQUEST_PERMISSION: 'request-permission',
  OFFER_UPGRADE: 'offer-upgrade',
  OPEN_SETTINGS: 'open-settings',
  NONE: 'none',
};

export function isLegacyNotificationOnboardingPresented(value) {
  return ['1', 'true', 'presented'].includes(
    String(value || '').trim().toLowerCase()
  );
}

export function getNotificationOnboardingDecision({
  granted,
  canAskAgain,
  legacyOnboardingPresented,
  rolloutState,
  promptAttemptedThisRuntime,
  userInitiated,
}) {
  if (granted) {
    return {
      action: NOTIFICATION_ONBOARDING_ACTIONS.REGISTER,
      reason: 'already-granted',
    };
  }

  if (userInitiated) {
    return {
      action: canAskAgain
        ? NOTIFICATION_ONBOARDING_ACTIONS.REQUEST_PERMISSION
        : NOTIFICATION_ONBOARDING_ACTIONS.OPEN_SETTINGS,
      reason: canAskAgain ? 'user-requested' : 'os-cannot-ask-again',
    };
  }

  if (rolloutState) {
    return {
      action: NOTIFICATION_ONBOARDING_ACTIONS.NONE,
      reason: 'current-rollout-handled',
    };
  }

  if (legacyOnboardingPresented) {
    return {
      action: NOTIFICATION_ONBOARDING_ACTIONS.OFFER_UPGRADE,
      reason: 'legacy-state-ambiguous',
    };
  }

  if (canAskAgain && !promptAttemptedThisRuntime) {
    return {
      action: NOTIFICATION_ONBOARDING_ACTIONS.REQUEST_PERMISSION,
      reason: 'fresh-onboarding-eligible',
    };
  }

  return {
    action: NOTIFICATION_ONBOARDING_ACTIONS.OFFER_UPGRADE,
    reason: canAskAgain
      ? 'prompt-already-attempted-this-session'
      : 'os-cannot-ask-again',
  };
}
