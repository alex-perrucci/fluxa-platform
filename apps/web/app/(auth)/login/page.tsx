import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon } from '@/components/control-center/icons';

export const metadata: Metadata = {
  title: 'Accesso partner',
  description: 'Accedi al Control Center Fluxa del tuo locale.',
};

const venueTypes = [
  'Ristoranti',
  'Pub',
  'Cocktail bar',
  'Rooftop',
  'Club',
  'Event venue',
];

export default function LoginPage() {
  return (
    <main className="mc-partner-page">
      <header className="mc-header shell">
        <Link aria-label="Fluxa home" className="mc-brand" href="/">
          <FluxaMark />
          <strong>FLUXA</strong>
        </Link>
        <nav aria-label="Navigazione partner" className="mc-nav">
          <Link href="/">Per i clienti</Link>
          <a href="#vantaggi">Come funziona</a>
          <a href="#supporto">Supporto</a>
        </nav>
        <Link className="mc-login-link" href="/">
          Torna al sito →
        </Link>
      </header>

      <section className="mc-partner-hero shell">
        <div>
          <p className="mc-kicker">Area partner</p>
          <h1>Accedi al tuo locale.</h1>
          <p>
            Gestisci prenotazioni, eventi, tavoli e operatività da un unico
            Control Center.
          </p>
          <span className="mc-secure-note">
            <Icon name="shield" />
            Accesso sicuro e protetto
          </span>
        </div>
        <div className="mc-partner-cut" aria-hidden="true">
          <div />
          <span />
          <i />
        </div>
      </section>

      <section className="mc-partner-grid shell">
        <div className="mc-login-card">
          <p className="mc-kicker">Workspace sicuro</p>
          <h2>Accedi al tuo account</h2>
          <p>Il tuo ruolo apre automaticamente l’area corretta.</p>
          <LoginForm />
        </div>

        <aside className="mc-partner-features" id="vantaggi">
          <p className="mc-kicker">Control Center</p>
          <h2>Tutto ciò che serve, in un’unica piattaforma.</h2>
          <article>
            <Icon name="calendar" />
            <div>
              <h3>Gestisci prenotazioni</h3>
              <p>Visualizza clienti, tavoli, stati e storico operativo.</p>
            </div>
          </article>
          <article>
            <Icon name="sparkles" />
            <div>
              <h3>Pubblica eventi</h3>
              <p>Crea, modifica e pubblica le serate dal tuo workspace.</p>
            </div>
          </article>
          <article>
            <Icon name="ticket" />
            <div>
              <h3>Controlla tavoli e depositi</h3>
              <p>Disponibilità, assegnazioni e pagamenti nello stesso flusso.</p>
            </div>
          </article>
          <article>
            <Icon name="activity" />
            <div>
              <h3>Segui l’operatività</h3>
              <p>Eventi, ospiti e volume incassato sempre aggiornati.</p>
            </div>
          </article>
        </aside>
      </section>

      <section className="mc-partner-section shell">
        <div className="mc-section-heading compact">
          <div>
            <p className="mc-kicker">Pensato per</p>
            <h2>Locali diversi. Un solo flusso.</h2>
          </div>
        </div>
        <div className="mc-venue-grid">
          {venueTypes.map((type) => (
            <div key={type}>
              <Icon name="location" />
              <strong>{type}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="mc-partner-support shell" id="supporto">
        <article>
          <Icon name="activity" />
          <div>
            <h3>Attivazione guidata</h3>
            <p>Organizzazione, sede, area e tavoli iniziali in un unico onboarding.</p>
          </div>
        </article>
        <article>
          <Icon name="shield" />
          <div>
            <h3>Accesso protetto</h3>
            <p>Ruoli, cookie HttpOnly e isolamento tra organizzazioni.</p>
          </div>
        </article>
        <article>
          <Icon name="sparkles" />
          <div>
            <h3>Operatività collegata</h3>
            <p>Control Center web e POS lavorano sullo stesso dominio operativo.</p>
          </div>
        </article>
      </section>

      <section className="mc-cta shell">
        <div>
          <p className="mc-kicker">Non sei ancora partner?</p>
          <h2>Scopri cosa può gestire Fluxa.</h2>
        </div>
        <Link className="mc-button mc-button-gold" href="/">
          Torna al sito
          <Icon name="arrow" />
        </Link>
        <FluxaMark className="mc-cta-mark" />
      </section>

      <footer className="mc-footer shell">
        <div className="mc-footer-brand">
          <Link className="mc-brand" href="/">
            <FluxaMark />
            <strong>FLUXA</strong>
          </Link>
          <p>Scopri. Prenota. Vivi.</p>
        </div>
        <div>
          <strong>Fluxa</strong>
          <Link href="/">Per i clienti</Link>
          <Link href="/events">Eventi</Link>
        </div>
        <div>
          <strong>Partner</strong>
          <Link href="/login">Accedi al locale</Link>
          <span>Supporto</span>
        </div>
        <div>
          <strong>Sistema</strong>
          <Link href="/health">Stato dei servizi</Link>
          <span>Privacy e condizioni</span>
        </div>
      </footer>
    </main>
  );
}