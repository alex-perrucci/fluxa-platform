import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { SectionHeading } from '@/components/control-center/shell';

export default function VenuePage() {
  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        eyebrow="Locale"
        title="Spazi e tavoli"
      />
      <p className="muted max-w-3xl">
        Gestisci le sedi e organizza sale e tavoli senza entrare nelle configurazioni tecniche del sistema.
      </p>

      <div className="quick-action-grid mt-5">
        <Link className="quick-action" href="/merchant/location">
          <div><Icon name="building" /></div>
          <div>
            <strong>Sedi</strong>
            <span>Dati del locale e sedi operative</span>
          </div>
        </Link>
        <Link className="quick-action" href="/merchant/floor-plan">
          <div><Icon name="location" /></div>
          <div>
            <strong>Sale e tavoli</strong>
            <span>Organizza la piantina del locale</span>
          </div>
        </Link>
      </div>
    </section>
  );
}
