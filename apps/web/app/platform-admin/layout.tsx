// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  {
    href: '/platform-admin',
    label: 'Panoramica',
    icon: 'dashboard' as const,
  },
  {
    href: '/platform-admin/organizations',
    label: 'Organizzazioni',
    icon: 'building' as const,
  },
  {
    href: '/platform-admin/organizations/new',
    label: 'Nuovo tenant',
    icon: 'plus' as const,
  },
];

export default async function PlatformAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requirePlatformAdminSession();

  return (
    <ControlCenterShell
      mode="platform"
      nav={nav}
      session={session}
      subtitle="Global operations"
      title="Platform Control Center"
    >
      {children}
    </ControlCenterShell>
  );
}
