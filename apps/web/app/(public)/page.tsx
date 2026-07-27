import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default function PublicHomePage() {
  return (
    <main className="shell py-16">
      <section className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">
            Fluxa Events
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Eventi, tavoli e prenotazioni collegati al gestionale del locale.
          </h1>
          <p className="muted mt-6 max-w-2xl text-lg leading-8">
            Questa è la base del nuovo portale web. Il catalogo pubblico degli eventi
            verrà collegato al backend Fluxa nelle fasi successive.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400"
              href="/login"
            >
              Accedi al gestionale
            </Link>
            <Link
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold hover:bg-slate-900"
              href="/health"
            >
              Verifica configurazione
            </Link>
          </div>
        </div>

        <Card>
          <h2 className="text-xl font-semibold">Interfacce previste</h2>
          <ul className="muted mt-5 space-y-3">
            <li>Portale pubblico per le prenotazioni</li>
            <li>Gestionale web per gli esercenti</li>
            <li>Super-admin di piattaforma</li>
            <li>Integrazione con il POS Flutter</li>
          </ul>
        </Card>
      </section>
    </main>
  );
}
