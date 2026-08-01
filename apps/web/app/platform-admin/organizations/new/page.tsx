// PHASE_8_TRUE_CONTROL_CENTER
import { PlatformOnboardingForm } from '@/components/platform/onboarding-form';
import { PlatformOnboardingSubmitGuard } from '@/components/platform/onboarding-submit-guard';

export default function NewOrganizationPage() {
  return (
    <PlatformOnboardingSubmitGuard>
      <PlatformOnboardingForm />
    </PlatformOnboardingSubmitGuard>
  );
}
