import Link from 'next/link';

export function PlanFeatureGate({
  title,
  description,
  planName,
  upgradePlanName,
}: {
  title: string;
  description: string;
  planName: string;
  upgradePlanName?: string | null;
}) {
  return (
    <section className="glass-panel panel-padding">
      <p className="eyebrow">Funzione non inclusa</p>
      <h2>{title}</h2>
      <p className="muted mt-2 max-w-3xl">{description}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="platform-pill">Piano attuale: {planName}</span>
        <Link className="button-secondary" href="/merchant/settings/plan">
          {upgradePlanName ? `Scopri ${upgradePlanName}` : 'Vedi il piano'}
        </Link>
      </div>
    </section>
  );
}
