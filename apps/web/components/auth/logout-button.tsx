'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button
      className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900 disabled:opacity-60"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? 'Uscita…' : 'Esci'}
    </button>
  );
}
