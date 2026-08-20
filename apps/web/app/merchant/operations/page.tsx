import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { SectionHeading } from '@/components/control-center/shell';

const tasks = [
  {
    href: '/merchant/reservations',
    icon: 'ticket' as const,
    title: 'Prenotazioni',
    description: 'Clienti, tavoli e stato delle prenotazioni',
  },
  {
    href: '/merchant/events',
    icon: 'calendar' as const,
    title: 'Eventi',
    description: 'Programma e gestisci gli eventi del locale',
  },
  {
    href: '/merchant/kitchen-configuration',
    icon: 'activity' as const,
    title: 'Stampa e cucina',
    description: 'Dove arrivano comande di cucina e bar',
  },
  {
    href: '/merchant/pos-configuration',
    icon: 'dashboard' as const,
    title: 'Dispositivi POS',
    description: 'Casse e dispositivi usati nel locale',
  },
];

export default function OperationsPage() {
  return (
    <section className="glass-panel panel-padding">
      <SectionHeading eyebrow="Operatività" title="Gestisci il lavoro quotidiano" />
      <p className="muted max-w-3xl">
        Tutto ciò che serve durante il servizio è raccolto qui. I dettagli tecnici restano nascosti finché non servono per l’assistenza.
      </p>

      <div className="quick-action-grid mt-5">
        {tasks.map((task) => (
          <Link className="quick-action" href={task.href} key={task.href}>
            <div><Icon name={task.icon} /></div>
            <div>
              <strong>{task.title}</strong>
              <span>{task.description}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
