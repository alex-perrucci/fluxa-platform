'use client';

import { useEffect } from 'react';

export default function MerchantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('merchant page error', error);
  }, [error]);

  return (
    <section className="glass-panel panel-padding">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Gestione locale
      </p>
      <h1 className="mt-2 text-2xl font-semibold">
        Questa pagina non è disponibile al momento
      </h1>
      <p className="muted mt-2 max-w-2xl">
        Non è necessario modificare il dispositivo o cambiare sede. Riprova; se
        il problema continua, contatta l’assistenza Fluxa.
      </p>
      <button className="button-primary mt-5" onClick={reset} type="button">
        Riprova
      </button>
    </section>
  );
}
