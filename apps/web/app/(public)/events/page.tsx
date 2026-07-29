// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { EventCard } from '@/components/public/event-card';
import { PublicHeader } from '@/components/public/public-header';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { PublicEventListResponse } from '@/lib/public-booking/types';

function value(input: string | string[] | undefined): string {
  return typeof input === 'string' ? input : '';
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const q = value(raw.q);
  const city = value(raw.city);
  const page = Math.max(1, Number(value(raw.page)) || 1);
  const query = new URLSearchParams();

  if (q) query.set('q', q);
  if (city) query.set('city', city);
  query.set('page', String(page));
  query.set('pageSize', '12');

  let result: PublicEventListResponse | null = null;
  let loadError: string | null = null;

  try {
    result = await fluxaServerFetch<PublicEventListResponse>(
      `/public/events?${query.toString()}`,
    );
  } catch {
    loadError = 'Il catalogo eventi non è disponibile in questo momento.';
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();

    if (q) params.set('q', q);
    if (city) params.set('city', city);
    params.set('page', String(nextPage));

    return `/events?${params.toString()}`;
  }

  return (
    <main className="public-events-page">
      <PublicHeader />

      <section className="event-discovery-hero shell">
        <div>
          <p className="eyebrow">Fluxa nights</p>
          <h1>Trova la prossima serata. Il tavolo è già sotto controllo.</h1>
          <p>
            Eventi reali, disponibilità aggiornata e deposito sicuro. Scegli
            quante persone siete: Fluxa assegna il tavolo giusto senza
            overbooking.
          </p>
        </div>
        <form className="event-search" method="get">
          <label className="field">
            <span>Cerca evento o locale</span>
            <input defaultValue={q} name="q" placeholder="DJ set, aperitivo…" />
          </label>
          <label className="field">
            <span>Città</span>
            <input defaultValue={city} name="city" placeholder="Parma" />
          </label>
          <button className="button-primary" type="submit">
            Cerca eventi
          </button>
        </form>
      </section>

      <section className="event-catalog shell">
        <div className="event-catalog-heading">
          <div>
            <p className="eyebrow">Eventi disponibili</p>
            <h2>
              {result
                ? `${result.total} ${result.total === 1 ? 'evento' : 'eventi'}`
                : 'Catalogo non disponibile'}
            </h2>
          </div>
          {(q || city) && (
            <Link className="button-secondary" href="/events">
              Azzera filtri
            </Link>
          )}
        </div>

        {loadError ? (
          <div className="public-empty-state">
            <strong>Connessione non riuscita</strong>
            <p>{loadError}</p>
          </div>
        ) : null}

        {result && result.items.length > 0 ? (
          <div className="public-event-grid">
            {result.items.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        ) : null}

        {result && result.items.length === 0 ? (
          <div className="public-empty-state">
            <strong>Nessun evento trovato</strong>
            <p>
              Cambia città o ricerca. I nuovi eventi pubblicati compariranno qui
              automaticamente.
            </p>
          </div>
        ) : null}

        {result && totalPages > 1 ? (
          <nav className="public-pagination" aria-label="Pagine eventi">
            {page > 1 ? (
              <Link href={pageHref(page - 1)}>← Precedente</Link>
            ) : (
              <span />
            )}
            <strong>
              Pagina {page} di {totalPages}
            </strong>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)}>Successiva →</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
