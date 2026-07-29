// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';

export function PublicHeader() {
  return (
    <header className="public-header">
      <div className="public-header-inner shell">
        <Link className="public-brand" href="/">
          <FluxaMark className="h-10 w-10" />
          <span>
            <strong>Fluxa</strong>
            <small>Event discovery</small>
          </span>
        </Link>
        <nav className="public-header-links" aria-label="Navigazione pubblica">
          <Link href="/events">Eventi</Link>
          <Link href="/health">Stato sistema</Link>
          <Link className="button-secondary" href="/login">
            Area operatori
          </Link>
        </nav>
      </div>
    </header>
  );
}
