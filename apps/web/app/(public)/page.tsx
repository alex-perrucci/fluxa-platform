// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon } from '@/components/control-center/icons';

export default function PublicHomePage() {
  return (
    <main className="landing">
      <nav className="public-nav shell">
        <Link className="public-brand" href="/">
          <FluxaMark className="h-10 w-10" />
          <span>
            <strong>Fluxa</strong>
            <small>Venue operating system</small>
          </span>
        </Link>
        <div className="public-nav-actions">
          <Link className="nav-link" href="/events">
            Scopri eventi
          </Link>
          <Link className="nav-link" href="/health">
            System status
          </Link>
          <Link className="button-secondary" href="/login">
            Accedi
          </Link>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Control every unforgettable night</p>
          <h1>
            Il locale si muove.
            <br />
            <span>Fluxa lo orchestra.</span>
          </h1>
          <p>
            Eventi, tavoli, depositi, prenotazioni e operatività vivono nello
            stesso sistema. Meno strumenti scollegati. Più controllo quando la
            sala si riempie.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/events">
              Scopri gli eventi
              <Icon name="arrow" />
            </Link>
            <Link className="button-secondary" href="/login">
              Apri il Control Center
            </Link>
          </div>
        </div>

        <div className="hero-system">
          <div className="system-window">
            <div className="system-top">
              <div className="system-dots">
                <span />
                <span />
                <span />
              </div>
              <p className="eyebrow">Fluxa booking engine</p>
            </div>
            <div className="system-body">
              <div className="system-sidebar-demo">
                <FluxaMark className="h-9 w-9" />
                <div className="system-nav-demo">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="system-main-demo">
                <div className="demo-metrics">
                  <div>
                    <span />
                    <strong />
                  </div>
                  <div>
                    <span />
                    <strong />
                  </div>
                </div>
                <div className="demo-list">
                  <span />
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              </div>
            </div>
          </div>
          <div className="floating-signal">
            <span>Prenotazioni confermate</span>
            <strong>128 ospiti</strong>
            <small>Motore atomico, stato in tempo reale</small>
          </div>
        </div>
      </section>

      <section className="trust-row shell">
        <article>
          <strong>Atomic booking</strong>
          <span>Lock PostgreSQL e idempotenza contro l’overbooking.</span>
        </article>
        <article>
          <strong>Tenant isolation</strong>
          <span>Ruoli, organizzazioni e sedi separati nel backend.</span>
        </article>
        <article>
          <strong>Stripe native</strong>
          <span>Depositi, webhook firmati e fee di piattaforma.</span>
        </article>
        <article>
          <strong>POS connected</strong>
          <span>Lo stesso dominio operativo dell’app Flutter.</span>
        </article>
      </section>
    </main>
  );
}
