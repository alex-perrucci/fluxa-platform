'use client';

import type { FormEvent, ReactNode } from 'react';
import { platformOnboardingSubmitIntent } from '@/lib/control-center/onboarding-step';

interface PlatformOnboardingSubmitGuardProps {
  children: ReactNode;
}

export function PlatformOnboardingSubmitGuard({
  children,
}: PlatformOnboardingSubmitGuardProps) {
  function guardSubmit(event: FormEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLFormElement) || !target.matches('form.wizard')) {
      return;
    }

    const panels = Array.from(
      target.querySelectorAll<HTMLElement>('.wizard-panel'),
    );
    const activePanelIndex = panels.findIndex((panel) =>
      panel.classList.contains('active'),
    );
    const currentStep = activePanelIndex >= 0 ? activePanelIndex + 1 : 1;
    const intent = platformOnboardingSubmitIntent(currentStep);

    if (intent.kind === 'submit') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const continueButton = target.querySelector<HTMLButtonElement>(
      '.wizard-actions button.button-primary[type="button"]',
    );

    continueButton?.click();
  }

  return <div onSubmitCapture={guardSubmit}>{children}</div>;
}
