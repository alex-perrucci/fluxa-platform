import Link from 'next/link';
import { SectionHeading } from '@/components/control-center/shell';
import { getMerchantEntitlements } from '@/lib/subscriptions/entitlements';

export default async function MerchantPlanPage() {
  const subscription = await getMerchantEntitlements();

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Piano" title={subscription.planName} />
        <p className="muted max-w-3xl">{subscription.planDescription}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className="platform-pill">Stato: {subscription.status}</span>
          <span className="platform-pill">Codice piano: {subscription.plan}</span>
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading eyebrow="Incluso" title="Funzioni attive" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {subscription.includedFeatures.map((feature) => (
            <div className="data-row" key={feature}>
              <strong>{feature}</strong>
              <span>Incluso</span>
            </div>
          ))}
        </div>
      </section>

      {subscription.upgrade ? (
        <section className="glass-panel panel-padding mt-5">
          <SectionHeading
            eyebrow="Upgrade"
            title={`Passa a ${subscription.upgrade.planName}`}
          />
          <p className="muted max-w-3xl">
            L’upgrade aggiunge queste funzioni senza cambiare il flusso di cassa
            già configurato.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {subscription.upgrade.features.map((feature) => (
              <span className="platform-pill" key={feature}>
                {feature}
              </span>
            ))}
          </div>
          <p className="muted mt-5 text-sm">
            Gli upgrade vengono attivati da Fluxa e diventano disponibili al
            successivo refresh della sessione.
          </p>
        </section>
      ) : null}

      <div className="mt-5">
        <Link className="button-secondary" href="/merchant/settings">
          Torna alle impostazioni
        </Link>
      </div>
    </>
  );
}
