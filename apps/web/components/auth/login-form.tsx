// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';

interface LoginOrganization {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
}

interface LoginResult {
  user?: { platformAdmin?: boolean };
  organization?: { id: string } | null;
  code?: string;
  message?: string;
  details?: { organizations?: LoginOrganization[] };
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  async function login(
    email: string,
    password: string,
    organizationId?: string,
  ) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(organizationId ? { organizationId } : {}),
        }),
      });
      const payload = (await response.json()) as LoginResult;

      if (!response.ok) {
        const available = payload.details?.organizations;

        if (
          payload.code === 'ORGANIZATION_SELECTION_REQUIRED' &&
          available?.length
        ) {
          setCredentials({ email, password });
          setOrganizations(available);
          return;
        }

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
      setError('Il server Fluxa non è raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await login(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
    );
  }

  if (organizations.length > 0 && credentials) {
    return (
      <div className="organization-choice">
        <ControlCenterNotification
          message={error}
          onDismiss={() => setError(null)}
          title="Accesso non riuscito"
        />
        <p className="eyebrow">Scegli workspace</p>
        <h2>Dove vuoi entrare?</h2>
        <p>Il tuo account è collegato a più organizzazioni.</p>
        <div className="organization-choice-list">
          {organizations.map((organization) => (
            <button
              disabled={pending}
              key={organization.organizationId}
              onClick={() =>
                void login(
                  credentials.email,
                  credentials.password,
                  organization.organizationId,
                )
              }
              type="button"
            >
              <span>
                <strong>{organization.organizationName}</strong>
                <small>
                  {organization.role} · {organization.organizationSlug}
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Accesso non riuscito"
      />
      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          name="email"
          placeholder="nome@azienda.it"
          required
          type="email"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          minLength={8}
          name="password"
          placeholder="••••••••••••"
          required
          type="password"
        />
      </label>
      <button
        className="button-primary login-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Accesso sicuro…' : 'Entra in Fluxa'}
        <Icon name="arrow" />
      </button>
      <p className="login-security">
        Sessione protetta con token HttpOnly e isolamento tenant.
      </p>
    </form>
  );
}
