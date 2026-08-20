// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/merchant', label: 'Home', icon: 'dashboard' as const },
  { href: '/merchant/catalog', label: 'Menu', icon: 'money' as const },
  { href: '/merchant/venue', label: 'Locale', icon: 'building' as const },
  { href: '/merchant/operations', label: 'Operatività', icon: 'activity' as const },
  { href: '/merchant/sales', label: 'Vendite', icon: 'money' as const },
  { href: '/merchant/settings', label: 'Impostazioni', icon: 'shield' as const },
];

export default async function MerchantLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireMerchantSession();
  return (
    <ControlCenterShell
      mode="merchant"
      nav={nav}
      organizations={session.availableOrganizations}
      session={session}
      subtitle={`${session.organization?.name ?? 'Organizzazione'} · ${session.session.role ?? ''}`}
      title="Gestione locale"
    >
      {children}
    </ControlCenterShell>
  );
}
