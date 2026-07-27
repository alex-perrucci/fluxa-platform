'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface LoginResult {
  user?: {
    platformAdmin?: boolean;
  };
  organization?: {
    id: string;
  } | null;
  code?: string;
  message?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const organizationId = String(form.get('organizationId') ?? '').trim();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          ...(organizationId ? { organizationId } : {}),
        }),
      });

      const payload = (await response.json()) as LoginResult;

      if (!response.ok) {
        setError(payload.message ?? 'Accesso non riuscito.');
        return;
      }

      const destination =
        payload.user?.platformAdmin && !payload.organization
          ? '/platform-admin'
          : '/merchant';

      router.replace(destination);
      router.refresh();
    } catch {
      setError('Il server non è raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={submit}>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Email</span>
        <input
          autoComplete="email"
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          name="email"
          required
          type="email"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Password</span>
        <input
          autoComplete="current-password"
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">
          ID organizzazione <span className="muted">(solo se richiesto)</span>
        </span>
        <input
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          name="organizationId"
          placeholder="UUID"
          type="text"
        />
      </label>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <button
        className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Accesso in corso…' : 'Accedi'}
      </button>
    </form>
  );
}
