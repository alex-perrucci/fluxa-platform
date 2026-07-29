// PHASE_8_TRUE_CONTROL_CENTER
import type { Metadata } from 'next';
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon } from '@/components/control-center/icons';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Accesso',
};

export default function LoginPage() {
  return (
    <main className="login-stage">
      <section className="login-visual">
        <Link className="public-brand" href="/">
          <FluxaMark className="h-11 w-11" />
          <span>
            <strong>Fluxa</strong>
            <small>Venue operating system</small>
          </span>
        </Link>

        <div className="login-manifesto">
          <p className="eyebrow">One system. Every moving part.</p>
          <h1>La notte inizia dal controllo.</h1>
          <p>
            Accedi al workspace del tuo locale oppure alla regia globale della
            piattaforma Fluxa.
          </p>
        </div>

        <div className="login-quote">
          <div>
            <Icon name="sparkles" />
          </div>
          <p>
            Eventi e prenotazioni sono sincronizzati con il motore
            transazionale, Stripe e i worker in background.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <p className="eyebrow">Secure workspace</p>
          <h2>Bentornato.</h2>
          <p>
            Usa il tuo account Fluxa. Il ruolo determina automaticamente il
            Control Center.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
