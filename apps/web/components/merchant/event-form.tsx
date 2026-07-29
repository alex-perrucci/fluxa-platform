// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { parseEventDateWindow } from '@/lib/control-center/event-form-validation';
import type {
  DiningTableSummary,
  EventDetail,
  LocationSummary,
} from '@/lib/control-center/types';

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function EventForm({
  locations,
  event,
}: {
  locations: LocationSummary[];
  event?: EventDetail;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(
    event?.locationId ?? locations[0]?.id ?? '',
  );
  const [tables, setTables] = useState<DiningTableSummary[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>(
    event?.tables
      .filter((table) => table.enabled)
      .map((table) => table.diningTableId) ?? [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCapacity = useMemo(
    () =>
      tables
        .filter((table) => selectedTables.includes(table.id))
        .reduce((sum, table) => sum + table.capacity, 0),
    [selectedTables, tables],
  );

  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    fetch(`/api/control-center/merchant/tables?locationId=${locationId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Tavoli non disponibili.');
        return (await response.json()) as DiningTableSummary[];
      })
      .then((rows) =>
        setTables(rows.filter((table) => table.status === 'ACTIVE')),
      )
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Tavoli non disponibili.',
        );
      });

    return () => controller.abort();
  }, [locationId]);

  function toggleTable(tableId: string) {
    setSelectedTables((current) =>
      current.includes(tableId)
        ? current.filter((id) => id !== tableId)
        : [...current, tableId],
    );
  }

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setPending(true);
    setError(null);

    try {
      const form = new FormData(submitEvent.currentTarget);
      const dateWindow = parseEventDateWindow({
        startsAt: form.get('startsAt'),
        endsAt: form.get('endsAt'),
        bookingOpensAt: form.get('bookingOpensAt'),
        bookingClosesAt: form.get('bookingClosesAt'),
      });
      const body = {
        locationId,
        title: String(form.get('title') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? ''),
        timezone: String(form.get('timezone') ?? 'Europe/Rome'),
        coverImageUrl: String(form.get('coverImageUrl') ?? '') || undefined,
        ...dateWindow,
        bookingAmountCents: Math.round(
          Number(form.get('bookingAmountEuro')) * 100,
        ),
        currency: 'EUR',
        capacity: Number(form.get('capacity')),
        cancellationPolicy:
          String(form.get('cancellationPolicy') ?? '') || undefined,
        bookingRules: {
          minPartySize: Number(form.get('minPartySize')),
          maxPartySize: Number(form.get('maxPartySize')),
          holdMinutes: Number(form.get('holdMinutes')),
          bookingCutoffMinutes: Number(form.get('bookingCutoffMinutes')),
          cancellationCutoffMinutes: Number(
            form.get('cancellationCutoffMinutes'),
          ),
          autoAssignSmallestTable: true,
          allowManualAssignment: true,
          requirePhone: form.get('requirePhone') === 'on',
        },
        tableIds: selectedTables,
      };

      const endpoint = event
        ? `/api/control-center/merchant/events/${event.id}`
        : '/api/control-center/merchant/events';
      const response = await fetch(endpoint, {
        method: event ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        id?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? 'Salvataggio evento non riuscito.');
        return;
      }

      const eventId = event?.id ?? payload.id;

      if (!eventId) {
        throw new Error('Identificativo evento mancante.');
      }

      router.push(`/merchant/events/${eventId}`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Salvataggio evento non riuscito.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="event-editor" noValidate onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title={event ? 'Evento non aggiornato' : 'Evento non creato'}
      />
      <section className="editor-hero">
        <div>
          <p className="eyebrow">Event studio</p>
          <h2>
            {event
              ? 'Modifica esperienza'
              : 'Crea qualcosa che riempia la sala.'}
          </h2>
          <p>
            Contenuti, disponibilità e regole restano allineati con il motore
            transazionale Fluxa.
          </p>
        </div>
        <div className="event-live-preview">
          <span>Capienza tavoli selezionati</span>
          <strong>{selectedCapacity}</strong>
          <small>Capienza evento dichiarata sotto</small>
        </div>
      </section>

      <div className="editor-grid">
        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>01</span>
            <div>
              <h3>Identità dell’evento</h3>
              <p>Il primo impatto che vedrà il cliente.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Titolo</span>
              <input
                defaultValue={event?.title}
                minLength={3}
                name="title"
                placeholder="Midnight Garden"
                required
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input defaultValue={event?.slug} name="slug" />
            </label>
            <label className="field">
              <span>Immagine cover URL</span>
              <input
                defaultValue={event?.coverImageUrl ?? ''}
                name="coverImageUrl"
                placeholder="https://..."
                type="url"
              />
            </label>
            <label className="field span-2">
              <span>Descrizione</span>
              <textarea
                defaultValue={event?.description}
                name="description"
                required
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className="editor-card">
          <div className="editor-card-title">
            <span>02</span>
            <div>
              <h3>Luogo</h3>
              <p>Sede e fuso orario operativo.</p>
            </div>
          </div>
          <label className="field">
            <span>Sede</span>
            <select
              disabled={Boolean(event)}
              onChange={(changeEvent) => {
                setLocationId(changeEvent.target.value);
                setSelectedTables([]);
              }}
              value={locationId}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {location.city}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              defaultValue={event?.timezone ?? 'Europe/Rome'}
              name="timezone"
              required
            />
          </label>
        </section>

        <section className="editor-card">
          <div className="editor-card-title">
            <span>03</span>
            <div>
              <h3>Calendario</h3>
              <p>Evento e finestra di vendita.</p>
            </div>
          </div>
          <label className="field">
            <span>Inizio evento</span>
            <input
              defaultValue={localDateTime(event?.startsAt)}
              name="startsAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Fine evento</span>
            <input
              defaultValue={localDateTime(event?.endsAt)}
              name="endsAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Apertura prenotazioni</span>
            <input
              defaultValue={localDateTime(event?.bookingOpensAt)}
              name="bookingOpensAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Chiusura prenotazioni</span>
            <input
              defaultValue={localDateTime(event?.bookingClosesAt)}
              name="bookingClosesAt"
              required
              type="datetime-local"
            />
          </label>
        </section>

        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>04</span>
            <div>
              <h3>Tavoli e capacità</h3>
              <p>Scegli l’inventario bloccabile dal motore prenotazioni.</p>
            </div>
          </div>
          <div className="table-selector">
            {tables.map((table) => {
              const selected = selectedTables.includes(table.id);

              return (
                <button
                  className={selected ? 'selected' : ''}
                  key={table.id}
                  onClick={() => toggleTable(table.id)}
                  type="button"
                >
                  <span>{table.code}</span>
                  <strong>{table.name}</strong>
                  <small>
                    {table.capacity} posti · {table.areaName}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="form-grid mt-5">
            <label className="field">
              <span>Capienza evento</span>
              <input
                defaultValue={event?.capacity ?? Math.max(selectedCapacity, 1)}
                min={1}
                name="capacity"
                required
                type="number"
              />
            </label>
            <label className="field">
              <span>Deposito per prenotazione (€)</span>
              <input
                defaultValue={
                  event ? (event.bookingAmountCents / 100).toFixed(2) : '10.00'
                }
                min={0}
                name="bookingAmountEuro"
                required
                step="0.01"
                type="number"
              />
            </label>
          </div>
        </section>

        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>05</span>
            <div>
              <h3>Regole operative</h3>
              <p>Controllano hold, cutoff e assegnazione.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Minimo persone</span>
              <input
                defaultValue={event?.bookingRules?.minPartySize ?? 1}
                min={1}
                name="minPartySize"
                type="number"
              />
            </label>
            <label className="field">
              <span>Massimo persone</span>
              <input
                defaultValue={event?.bookingRules?.maxPartySize ?? 8}
                min={1}
                name="maxPartySize"
                type="number"
              />
            </label>
            <label className="field">
              <span>Durata hold</span>
              <input
                defaultValue={event?.bookingRules?.holdMinutes ?? 15}
                min={1}
                name="holdMinutes"
                type="number"
              />
            </label>
            <label className="field">
              <span>Cutoff prenotazione</span>
              <input
                defaultValue={event?.bookingRules?.bookingCutoffMinutes ?? 60}
                min={0}
                name="bookingCutoffMinutes"
                type="number"
              />
            </label>
            <label className="field">
              <span>Cutoff cancellazione</span>
              <input
                defaultValue={
                  event?.bookingRules?.cancellationCutoffMinutes ?? 1440
                }
                min={0}
                name="cancellationCutoffMinutes"
                type="number"
              />
            </label>
            <label className="toggle-field">
              <input
                defaultChecked={event?.bookingRules?.requirePhone ?? true}
                name="requirePhone"
                type="checkbox"
              />
              <span>
                Telefono obbligatorio
                <small>Richiedilo nel checkout pubblico.</small>
              </span>
            </label>
            <label className="field span-2">
              <span>Policy di cancellazione</span>
              <textarea
                defaultValue={event?.cancellationPolicy ?? ''}
                name="cancellationPolicy"
                rows={4}
              />
            </label>
          </div>
        </section>
      </div>

      <div className="sticky-submit">
        <div>
          <span>{event ? 'Aggiornamento evento' : 'Nuovo draft'}</span>
          <strong>
            {selectedTables.length} tavoli · {selectedCapacity} posti
          </strong>
        </div>
        <button className="button-primary" disabled={pending} type="submit">
          {pending ? 'Salvataggio…' : event ? 'Salva modifiche' : 'Crea evento'}
          <Icon name={event ? 'sparkles' : 'plus'} />
        </button>
      </div>
    </form>
  );
}
