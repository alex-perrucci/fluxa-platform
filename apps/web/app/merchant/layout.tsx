import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function MerchantLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireMerchantSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <div>
            <Link className="font-semibold" href="/merchant">
              Fluxa Gestionale
            </Link>
            <p className="muted text-xs">
              {session.organization?.name} · {session.session.role}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
