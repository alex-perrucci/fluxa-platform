'use client';

import { useRef, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { platformOnboardingSubmitIntent } from '@/lib/control-center/onboarding-step';

interface PlatformOnboardingSubmitGuardProps {
  children: ReactNode;
}

const LAYOUT_ARM_DELAY_MS = 800;

function wizardStep(form: HTMLFormElement) {
  const panels = Array.from(
    form.querySelectorAll<HTMLElement>('.wizard-panel'),
  );
  const activePanelIndex = panels.findIndex((panel) =>
    panel.classList.contains('active'),
  );

  return activePanelIndex >= 0 ? activePanelIndex + 1 : 1;
}

function continueWizard(form: HTMLFormElement) {
  const continueButton = form.querySelector<HTMLButtonElement>(
    '.wizard-actions button.button-primary[type="button"]',
  );

  continueButton?.click();
}

export function PlatformOnboardingSubmitGuard({
  children,
}: PlatformOnboardingSubmitGuardProps) {
  const layoutEnteredAt = useRef(0);

  function guardClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>(
      'form.wizard .wizard-actions button.button-primary',
    );
    const form = button?.form;

    if (!button || !form) {
      return;
    }

    const currentStep = wizardStep(form);

    if (button.type === 'button' && currentStep === 3) {
      layoutEnteredAt.current = Date.now();
      return;
    }

    if (
      button.type === 'submit' &&
      currentStep === 4 &&
      Date.now() - layoutEnteredAt.current < LAYOUT_ARM_DELAY_MS
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function guardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const form = target.closest<HTMLFormElement>('form.wizard');

    if (!form || target instanceof HTMLTextAreaElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentStep = wizardStep(form);

    if (currentStep < 4) {
      if (currentStep === 3) {
        layoutEnteredAt.current = Date.now();
      }
      continueWizard(form);
    }
  }

  function guardSubmit(event: FormEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLFormElement) || !target.matches('form.wizard')) {
      return;
    }

    const currentStep = wizardStep(target);
    const intent = platformOnboardingSubmitIntent(currentStep);

    if (
      intent.kind === 'submit' &&
      Date.now() - layoutEnteredAt.current >= LAYOUT_ARM_DELAY_MS
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (intent.kind === 'advance') {
      if (currentStep === 3) {
        layoutEnteredAt.current = Date.now();
      }
      continueWizard(target);
    }
  }

  return (
    <div
      onClickCapture={guardClick}
      onKeyDownCapture={guardKeyDown}
      onSubmitCapture={guardSubmit}
    >
      {children}
    </div>
  );
}
