import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { SectionHeading } from '@/components/control-center/shell';

export default function SettingsPage() {
  return (
    <section className="glass-panel panel-padding">
      <SectionHeading eyebrow="Impostazioni" title="Configurazione essenziale" />
      <p className="muted max-w-3xl">
        Qui trovi solo le impostazioni che servono al locale. Le configurazioni tecniche della piattaforma sono gestite da Fluxa.
      </p>

      <div className="quick-action-grid mt-5">
        <Link className="quick-action" href="/merchant/fiscal-configuration">
          <div><Icon name="shield" /></div>
          <div>
            <strong>Fiscalizzazione</strong>
            <span>Verifica che l’emissione sia operativa</span>
          </div>
        </Link>
        <Link className="quick-action" href="/merchant/health">
          <div><Icon name="activity" /></div>
          <div>
            <strong>Assistenza</strong>
            <span>Controlla lo stato del locale e risolvi i problemi</span>
          </div>
        </Link>
      </div>
    </section>
  );
}
