import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Accesso',
};

export default function LoginPage() {
  return (
    <main className="shell grid min-h-screen place-items-center py-10">
      <div className="w-full max-w-lg">
        <Link className="muted mb-5 inline-block text-sm hover:text-white" href="/">
          ← Torna al sito
        </Link>

        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
            Fluxa
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Accedi al gestionale</h1>
          <p className="muted mt-3">
            Usa lo stesso account gestito dal backend Fluxa.
          </p>

          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
