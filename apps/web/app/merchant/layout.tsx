// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/merchant', label: 'Panoramica', icon: 'dashboard' as const },
  { href: '/merchant/location', label: 'Locale', icon: 'building' as const },
  {
    href: '/merchant/floor-plan',
    label: 'Piantina',
    icon: 'location' as const,
  },
  { href: '/merchant/events', label: 'Eventi', icon: 'calendar' as const },
  {
    href: '/merchant/reservations',
    label: 'Prenotazioni',
    icon: 'ticket' as const,
  },
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
      subtitle={`${session.organization?.name ?? 'Workspace'} · ${session.session.role ?? ''}`}
      title="Venue Control Center"
    >
      {children}
    </ControlCenterShell>
  );
}
