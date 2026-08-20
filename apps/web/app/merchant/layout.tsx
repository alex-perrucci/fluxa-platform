// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requireMerchantSession } from '@/lib/auth/session';
import { merchantNavigation } from '@/lib/control-center/merchant-navigation';

export const dynamic = 'force-dynamic';

export default async function MerchantLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireMerchantSession();
  return (
    <ControlCenterShell
      mode="merchant"
      nav={[...merchantNavigation]}
      organizations={session.availableOrganizations}
      session={session}
      subtitle={`${session.organization?.name ?? 'Organizzazione'} · ${session.session.role ?? ''}`}
      title="Gestione locale"
    >
      {children}
    </ControlCenterShell>
  );
}
