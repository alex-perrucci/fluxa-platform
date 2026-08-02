'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

interface TableMember {
  groupId: string;
  diningTableId: string;
  code: string;
  name: string;
  areaName: string;
  capacity: number;
  sortOrder: number;
}

interface TableUnit {
  inventoryId: string;
  kind: 'TABLE' | 'GROUP';
  diningTableId?: string;
  groupId?: string;
  code: string;
  name: string;
  areaName?: string;
  capacity: number;
  enabled: boolean;
  activeAssignmentCount: number;
  members?: TableMember[];
}

export interface EventInventoryView {
  event: {
    id: string;
    locationId: string;
    status: string;
    version: number;
  };
  units: TableUnit[];
  metrics: {
    unitCount: number;
    physicalTableCount: number;
    capacity: number;
  };
}

function responseMessage(value: unknown, fallback: string) {
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message;
  }
  return fallback;
}

export function EventTableGroupsManager({
  eventId,
  initialInventory,
}: {
  eventId: string;
  initialInventory: EventInventoryView;
}) {
  const [inventory, setInventory] = useState(initialInventory);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const individualUnits = useMemo(
    () =>
      inventory.units.filter(
        (unit): unit is TableUnit & { diningTableId: string } =>
          unit.kind === 'TABLE' && Boolean(unit.diningTableId),
      ),
    [inventory.units],
  );
  const groups = useMemo(
    () =>
      inventory.units.filter(
        (unit): unit is TableUnit & { groupId: string } =>
          unit.kind === 'GROUP' && Boolean(unit.groupId),
      ),
    [inventory.units],
  );
  const selectedCapacity = useMemo(
    () =>
      individualUnits
        .filter((unit) => selectedTableIds.includes(unit.diningTableId))
        .reduce((total, unit) => total + unit.capacity, 0),
    [individualUnits, selectedTableIds],
  );

  function toggleTable(tableId: string) {
    setSelectedTableIds((current) =>
      current.includes(tableId)
        ? current.filter((id) => id !== tableId)
        : [...current, tableId],
    );
  }

  async function merge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTableIds.length < 2) {
      setError('Seleziona almeno due tavoli singoli da combinare.');
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/control-center/merchant/events/${eventId}/table-groups`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: String(form.get('code') ?? ''),
            name: String(form.get('name') ?? ''),
            tableIds: selectedTableIds,
          }),
        },
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(responseMessage(body, 'Gruppo tavoli non creato.'));
      }
      setInventory(body as EventInventoryView);
      setSelectedTableIds([]);
      event.currentTarget.reset();
      setMessage('Tavoli combinati in una nuova unità prenotabile.');
    } catch (mergeError) {
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : 'Gruppo tavoli non creato.',
      );
    } finally {
      setPending(false);
    }
  }

  async function split(groupId: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/control-center/merchant/events/${eventId}/table-groups/${groupId}`,
        { method: 'DELETE' },
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(responseMessage(body, 'Gruppo tavoli non separato.'));
      }
      setInventory(body as EventInventoryView);
      setMessage('Gruppo separato nei tavoli individuali originali.');
    } catch (splitError) {
      setError(
        splitError instanceof Error
          ? splitError.message
          : 'Gruppo tavoli non separato.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Inventario non aggiornato"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Inventario evento aggiornato"
      />

      <div className="metrics-grid">
        <article className="metric-card">
          <span>Unità prenotabili</span>
          <strong>{inventory.metrics.unitCount}</strong>
          <p>Singoli tavoli e gruppi</p>
        </article>
        <article className="metric-card">
          <span>Tavoli fisici</span>
          <strong>{inventory.metrics.physicalTableCount}</strong>
          <p>Risorse realmente bloccate</p>
        </article>
        <article className="metric-card">
          <span>Capienza inventario</span>
          <strong>{inventory.metrics.capacity}</strong>
          <p>Posti disponibili nell’evento</p>
        </article>
      </div>

      <form className="glass-panel panel-padding mt-5" onSubmit={merge}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Merge</p>
            <h2>Crea un gruppo di tavoli</h2>
          </div>
          <span className="muted">
            {selectedTableIds.length} tavoli · {selectedCapacity} posti
          </span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Codice gruppo</span>
            <input name="code" placeholder="G1" required />
          </label>
          <label className="field">
            <span>Nome gruppo</span>
            <input name="name" placeholder="Tavolata centrale" required />
          </label>
        </div>
        <div className="table-selector mt-5">
          {individualUnits.map((unit) => {
            const selected = selectedTableIds.includes(unit.diningTableId);
            const locked = unit.activeAssignmentCount > 0;
            return (
              <button
                className={selected ? 'selected' : ''}
                disabled={pending || locked}
                key={unit.inventoryId}
                onClick={() => toggleTable(unit.diningTableId)}
                type="button"
              >
                <span>{unit.code}</span>
                <strong>{unit.name}</strong>
                <small>
                  {unit.capacity} posti · {unit.areaName}
                  {locked ? ' · già assegnato' : ''}
                </small>
              </button>
            );
          })}
        </div>
        <div className="wizard-actions mt-5">
          <span className="muted">
            I tavoli con hold o prenotazioni attive non sono selezionabili.
          </span>
          <button
            className="button-primary"
            disabled={pending || selectedTableIds.length < 2}
            type="submit"
          >
            {pending ? 'Aggiornamento…' : 'Combina tavoli'}
          </button>
        </div>
      </form>

      <section className="glass-panel panel-padding mt-5">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Split</p>
            <h2>Gruppi attivi</h2>
          </div>
          <StatusBadge status={inventory.event.status} />
        </div>
        <div className="data-list">
          {groups.map((group) => (
            <article className="data-row" key={group.inventoryId}>
              <div>
                <strong>
                  {group.code} · {group.name}
                </strong>
                <small>
                  {group.members?.map((member) => member.code).join(' + ')}
                </small>
              </div>
              <div>
                <span>{group.capacity} posti</span>
                <small>
                  {group.members?.length ?? 0} tavoli fisici ·{' '}
                  {group.activeAssignmentCount} assegnazioni attive
                </small>
              </div>
              <button
                className="button-secondary"
                disabled={pending || group.activeAssignmentCount > 0}
                onClick={() => void split(group.groupId)}
                type="button"
              >
                Separa
              </button>
            </article>
          ))}
          {groups.length === 0 ? (
            <p className="muted">Nessun gruppo configurato per l’evento.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
