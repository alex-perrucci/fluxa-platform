import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  FiscalDocumentRow,
  PaginatedResponse,
} from '@/lib/control-center/sales-backoffice-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function FiscalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['locationId', 'type', 'status', 'q', 'from', 'to']) {
    if (params[key]) query.set(key, params[key]);
  }
  query.set('pageSize', '100');
  const documents = await authenticatedFluxaFetch<
    PaginatedResponse<FiscalDocumentRow>
  >(`/control-center/sales/fiscal-documents?${query}`);

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        eyebrow="Fiscal status"
        title={`${documents.total} documenti fiscali`}
      />
      <form className="filter-bar">
        <select defaultValue={params.locationId ?? ''} name="locationId">
          <option value="">Tutte le sedi</option>
          {documents.scope.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input defaultValue={params.q} name="q" placeholder="Ordine o documento…" />
        <select defaultValue={params.type ?? ''} name="type">
          <option value="">Tutti i tipi</option>
          <option value="SALE">Vendita</option>
          <option value="VOID">Storno</option>
        </select>
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="QUEUED">In coda</option>
          <option value="PROCESSING">In elaborazione</option>
          <option value="ISSUED">Emessi</option>
          <option value="RETRY">Da ritentare</option>
          <option value="REJECTED">Rifiutati</option>
          <option value="VOIDED">Stornati</option>
          <option value="CANCELLED">Annullati</option>
        </select>
        <input defaultValue={params.from} name="from" type="date" />
        <input defaultValue={params.to} name="to" type="date" />
        <button className="button-secondary" type="submit">
          Filtra
        </button>
      </form>
      {documents.items.length ? (
        <div className="data-list">
          {documents.items.map((document) => (
            <Link
              className="data-row"
              href={`/merchant/sales/${document.orderId}`}
              key={document.id}
            >
              <div>
                <strong>{document.documentNumber ?? document.orderNumber}</strong>
                <small>
                  {document.locationName} · {document.type} · {document.provider}
                </small>
              </div>
              <div>
                <span>{euro(document.totalCents)}</span>
                <small>
                  Contanti {euro(document.cashPaymentCents)} · Elettronico{' '}
                  {euro(document.electronicPaymentCents)}
                </small>
              </div>
              <div>
                <StatusBadge status={document.status} />
                <small>{document.errorCode ?? document.externalStatus ?? ''}</small>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Nessun documento fiscale corrisponde ai filtri selezionati."
          title="Nessun documento"
        />
      )}
    </section>
  );
}
