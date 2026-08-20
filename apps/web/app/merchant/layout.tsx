// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/merchant', label: 'Panoramica', icon: 'dashboard' as const },
  { href: '/merchant/location', label: 'Sedi', icon: 'building' as const },
  { href: '/merchant/floor-plan', label: 'Piantina', icon: 'location' as const },
  { href: '/merchant/catalog', label: 'Menu', icon: 'money' as const },
  { href: '/merchant/kitchen-configuration', label: 'Stampanti e cucina', icon: 'activity' as const },
  { href: '/merchant/pos-configuration', label: 'Dispositivi POS', icon: 'activity' as const },
  { href: '/merchant/fiscal-configuration', label: 'Fiscalizzazione', icon: 'building' as const },
  { href: '/merchant/events', label: 'Eventi', icon: 'calendar' as const },
  { href: '/merchant/reservations', label: 'Prenotazioni', icon: 'ticket' as const },
  { href: '/merchant/sales', label: 'Vendite', icon: 'money' as const },
  { href: '/merchant/payments', label: 'Pagamenti', icon: 'money' as const },
  { href: '/merchant/fiscal-documents', label: 'Documenti fiscali', icon: 'building' as const },
  { href: '/merchant/reports', label: 'Report', icon: 'dashboard' as const },
  { href: '/merchant/health', label: 'Assistenza', icon: 'activity' as const },
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
