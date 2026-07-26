import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function PlatformAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requirePlatformAdminSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <div>
            <Link className="font-semibold" href="/platform-admin">
              Fluxa Platform Admin
            </Link>
            <p className="muted text-xs">{session.user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
