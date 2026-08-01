export const PLATFORM_ONBOARDING_FINAL_STEP = 4;

export type PlatformOnboardingSubmitIntent =
  | { kind: 'advance'; nextStep: number }
  | { kind: 'submit'; nextStep: typeof PLATFORM_ONBOARDING_FINAL_STEP };

export function platformOnboardingSubmitIntent(
  currentStep: number,
): PlatformOnboardingSubmitIntent {
  const normalizedStep = Math.min(
    PLATFORM_ONBOARDING_FINAL_STEP,
    Math.max(1, Math.trunc(currentStep)),
  );

  if (normalizedStep < PLATFORM_ONBOARDING_FINAL_STEP) {
    return {
      kind: 'advance',
      nextStep: normalizedStep + 1,
    };
  }

  return {
    kind: 'submit',
    nextStep: PLATFORM_ONBOARDING_FINAL_STEP,
  };
}
