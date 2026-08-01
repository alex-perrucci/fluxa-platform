import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ONBOARDING_FINAL_STEP,
  platformOnboardingSubmitIntent,
} from './onboarding-step';

describe('platformOnboardingSubmitIntent', () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
  ])('advances from step %s to step %s', (currentStep, nextStep) => {
    expect(platformOnboardingSubmitIntent(currentStep)).toEqual({
      kind: 'advance',
      nextStep,
    });
  });

  it('allows submission only from the layout step', () => {
    expect(platformOnboardingSubmitIntent(PLATFORM_ONBOARDING_FINAL_STEP)).toEqual(
      {
        kind: 'submit',
        nextStep: PLATFORM_ONBOARDING_FINAL_STEP,
      },
    );
  });

  it('normalizes values outside the wizard range', () => {
    expect(platformOnboardingSubmitIntent(0)).toEqual({
      kind: 'advance',
      nextStep: 2,
    });
    expect(platformOnboardingSubmitIntent(99)).toEqual({
      kind: 'submit',
      nextStep: PLATFORM_ONBOARDING_FINAL_STEP,
    });
  });
});
