import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { EventCard } from '@/components/public/event-card';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { PublicEventListResponse } from '@/lib/public-booking/types';

export const dynamic = 'force-dynamic';

const moods = [
  { label: 'Aperitivo', query: 'aperitivo', icon: 'sparkles' as const },
  { label: 'Rooftop', query: 'rooftop', icon: 'location' as const },
  { label: 'Cena spettacolo', query: 'cena spettacolo', icon: 'ticket' as const },
  { label: 'Live music', query: 'live music', icon: 'activity' as const },
  { label: 'Club', query: 'club', icon: 'users' as const },
];

const cities = ['Milano', 'Roma', 'Firenze', 'Bologna', 'Torino'];

async function loadFeaturedEvents() {
  try {
    const result = await fluxaServerFetch<PublicEventListResponse>(
      '/public/events?page=1&pageSize=4',
    );
    return result.items;
  } catch {
    return [];
  }
}

export default async function PublicHomePage() {
  const featuredEvents = await loadFeaturedEvents();

  return (
    <main className="mc-home mc-home-v3">
      <header className="mc-header shell">
        <Link aria-label="Fluxa home" className="mc-brand" href="/">
          <FluxaMark />
          <strong>FLUXA</strong>
        </Link>
        <nav aria-label="Navigazione principale" className="mc-nav">
          <Link href="/events">Scopri</Link>
          <a href="#come-funziona">Come funziona</a>
          <Link href="/login">Per i locali</Link>
        </nav>
        <div className="mc-header-actions">
          <Link className="mc-login-link" href="/login">
            Accedi
          </Link>
          <Link className="mc-button mc-button-gold" href="/events">
            Trova la tua serata
          </Link>
        </div>
      </header>

      <section className="mc-hero shell">
        <div className="mc-hero-top">
          <div className="mc-hero-copy">
            <h1>
              Scopri la serata giusta.
              <br />
              Prenota in pochi secondi.
            </h1>
            <p className="mc-lead">
              Eventi esclusivi, i migliori locali e tavoli riservati.
              <br />
              Scegli, prenota e vivi la notte senza pensieri.
            </p>
          </div>

          <div className="mc-hero-visual" aria-hidden="true">
            <Image
              alt=""
              fill
              priority
              sizes="(max-width: 800px) 90vw, 430px"
              src="/brand/fluxa/hero/rooftop-fallback.png"
            />
          </div>
        </div>

        <form action="/events" className="mc-search mc-search-v3" method="get">
          <label>
            <span>Dove vuoi andare?</span>
            <input name="city" placeholder="Citt&agrave; o locale" />
          </label>
          <label>
            <span>Quando?</span>
            <input aria-label="Data" name="date" type="date" />
          </label>
          <label>
            <span>Persone</span>
            <select aria-label="Numero di persone" defaultValue="2" name="partySize">
              <option value="1">1 persona</option>
              <option value="2">2 persone</option>
              <option value="3">3 persone</option>
              <option value="4">4 persone</option>
              <option value="5">5 persone</option>
              <option value="6">6 persone</option>
              <option value="8">8 persone</option>
              <option value="10">10 persone</option>
            </select>
          </label>
          <button className="mc-button mc-button-gold" type="submit">
            Cerca serata
            <Icon name="search" />
          </button>
        </form>

        <div className="mc-social-proof">
          <span>Scelto da migliaia di persone ogni settimana</span>
          <div>
            <span className="mc-avatar-stack" aria-hidden="true">
              <i>A</i><i>M</i><i>G</i><i>L</i><i>F</i>
            </span>
            <span className="mc-stars" aria-label="5 stelle su 5">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span>4.9/5 su oltre 3.200 recensioni</span>
          </div>
        </div>
      </section>

      <section className="mc-section shell mc-featured-section">
        <div className="mc-section-heading">
          <div>
            <h2>Eventi in evidenza</h2>
            <p>Le serate pi&ugrave; amate, selezionate per te.</p>
          </div>
          <Link href="/events">Vedi tutti gli eventi &rarr;</Link>
        </div>

        {featuredEvents.length > 0 ? (
          <div className="mc-featured-grid">
            {featuredEvents.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        ) : (
          <div className="mc-empty-events">
            <div>
              <p className="mc-kicker">Catalogo Fluxa</p>
              <h3>Le prossime serate stanno arrivando.</h3>
              <p>Apri il catalogo per vedere gli eventi pubblicati nella tua citt&agrave;.</p>
            </div>
            <Link className="mc-button mc-button-dark" href="/events">
              Esplora gli eventi
            </Link>
          </div>
        )}
      </section>

      <section className="mc-section shell">
        <div className="mc-section-heading compact">
          <div>
            <h2>Che serata hai in mente?</h2>
            <p>Scegli l&apos;atmosfera perfetta per te.</p>
          </div>
        </div>
        <div className="mc-mood-grid">
          {moods.map((mood) => (
            <Link href={`/events?q=${encodeURIComponent(mood.query)}`} key={mood.label}>
              <Icon name={mood.icon} />
              <strong>{mood.label}</strong>
              <span>Scopri le proposte</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mc-section mc-how shell" id="come-funziona">
        <div className="mc-section-heading compact">
          <div>
            <h2>Come funziona</h2>
            <p>Prenotare &egrave; semplice, vivere &egrave; meglio.</p>
          </div>
        </div>
        <div className="mc-steps">
          <article>
            <span>1</span>
            <div><h3>Scopri</h3><p>Esplora eventi e locali nella tua citt&agrave;.</p></div>
          </article>
          <article>
            <span>2</span>
            <div><h3>Prenota</h3><p>Scegli il tavolo, inserisci i dettagli e conferma.</p></div>
          </article>
          <article>
            <span>3</span>
            <div><h3>Vivi la serata</h3><p>Arriva, goditi l&apos;esperienza e crea ricordi.</p></div>
          </article>
        </div>
      </section>

      <section className="mc-section shell">
        <div className="mc-section-heading compact">
          <div><h2>Perch&eacute; scegliere FLUXA</h2><p>La tua serata, senza pensieri.</p></div>
        </div>
        <div className="mc-benefit-grid">
          <article><Icon name="shield" /><h3>Conferma immediata</h3><p>Prenoti e ricevi conferma in pochi secondi.</p></article>
          <article><Icon name="activity" /><h3>Disponibilit&agrave; aggiornata</h3><p>Tavoli reali, sempre aggiornati in tempo reale.</p></article>
          <article><Icon name="location" /><h3>Posti selezionati</h3><p>Solo i migliori locali e le zone pi&ugrave; esclusive.</p></article>
          <article><Icon name="ticket" /><h3>Prenotazione veloce</h3><p>Pochi passaggi, massima semplicit&agrave;.</p></article>
          <article><Icon name="money" /><h3>Pagamenti sicuri</h3><p>Transazioni protette al 100%.</p></article>
        </div>
      </section>

      <section className="mc-section shell">
        <div className="mc-section-heading">
          <div><h2>Le citt&agrave; pi&ugrave; popolari</h2><p>Scopri i locali pi&ugrave; amati nelle principali citt&agrave;.</p></div>
          <Link href="/events">Tutte le citt&agrave; &rarr;</Link>
        </div>
        <div className="mc-city-grid">
          {cities.map((city) => (
            <Link href={`/events?city=${encodeURIComponent(city)}`} key={city}>
              <strong>{city}</strong><span>Scopri eventi e locali</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mc-section shell">
        <div className="mc-section-heading compact">
          <div><h2>Domande frequenti</h2></div>
        </div>
        <div className="mc-faq">
          <details><summary>Come funziona la prenotazione su FLUXA?</summary><p>Apri un evento, indica il numero di persone, inserisci i dati e conferma.</p></details>
          <details><summary>&Egrave; gratuito prenotare su FLUXA?</summary><p>Il prezzo e l&apos;eventuale deposito sono sempre mostrati prima della conferma.</p></details>
          <details><summary>Posso modificare o cancellare la prenotazione?</summary><p>Lo stato e le azioni disponibili sono mostrati nel riepilogo della prenotazione.</p></details>
          <details><summary>Come vengono gestiti i pagamenti?</summary><p>Quando richiesto, il deposito viene gestito tramite Stripe Checkout.</p></details>
        </div>
      </section>

      <section className="mc-cta shell">
        <div><h2>La tua prossima serata ti aspetta.</h2><p>Scopri gli eventi, prenota il tuo tavolo e vivi la notte.</p></div>
        <Link className="mc-button mc-button-gold" href="/events">Trova la tua serata <Icon name="arrow" /></Link>
        <FluxaMark className="mc-cta-mark" />
      </section>

      <footer className="mc-footer shell">
        <div className="mc-footer-brand"><Link className="mc-brand" href="/"><FluxaMark /><strong>FLUXA</strong></Link><p>Scopri. Prenota. Vivi.</p></div>
        <div><strong>Esplora</strong><Link href="/events">Eventi</Link><a href="#come-funziona">Come funziona</a></div>
        <div><strong>Per i locali</strong><Link href="/login">Accedi</Link><Link href="/login">Area partner</Link></div>
        <div><strong>Supporto</strong><Link href="/health">Stato del sistema</Link><span>Privacy e condizioni</span></div>
      </footer>
    </main>
  );
}