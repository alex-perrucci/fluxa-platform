'use client';

import { useState } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';

interface MemberOption {
  membershipId: string;
  displayName: string;
  email: string;
  role: string;
}

interface AccessRow {
  locationId: string;
  locationCode: string;
  locationName: string;
  active: boolean;
  canManageLocation: boolean;
  canManageEvents: boolean;
  canManageTables: boolean;
  canManageFloorPlan: boolean;
  canManageStaff: boolean;
}

interface Props {
  organizationId: string;
  members: MemberOption[];
}

export function LocationAccessManager({ organizationId, members }: Props) {
  const scopedMembers = members.filter(
    (member) => member.role !== 'OWNER' && member.role !== 'ADMIN',
  );
  const [membershipId, setMembershipId] = useState('');
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(nextMembershipId: string) {
    setMembershipId(nextMembershipId);
    setRows([]);
    setError(null);
    if (!nextMembershipId) return;
    setPending(true);
    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/members/${nextMembershipId}/location-access`,
      );
      const body = (await response.json()) as AccessRow[] | { message?: string };
      if (!response.ok) {
        throw new Error(
          !Array.isArray(body) && body.message
            ? body.message
            : 'Accessi non caricati.',
        );
      }
      setRows(body as AccessRow[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Accessi non caricati.',
      );
    } finally {
      setPending(false);
    }
  }

  function patch(locationId: string, change: Partial<AccessRow>) {
    setRows((current) =>
      current.map((row) =>
        row.locationId === locationId ? { ...row, ...change } : row,
      ),
    );
  }

  async function save() {
    if (!membershipId) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/members/${membershipId}/location-access`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            assignments: rows
              .filter((row) => row.active)
              .map((row) => ({
                locationId: row.locationId,
                canManageLocation: row.canManageLocation,
                canManageEvents: row.canManageEvents,
                canManageTables: row.canManageTables,
                canManageFloorPlan: row.canManageFloorPlan,
                canManageStaff: row.canManageStaff,
              })),
          }),
        },
      );
      const body = (await response.json()) as AccessRow[] | { message?: string };
      if (!response.ok) {
        throw new Error(
          !Array.isArray(body) && body.message
            ? body.message
            : 'Permessi non salvati.',
        );
      }
      setRows(body as AccessRow[]);
      setMessage('Permessi per location aggiornati.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Permessi non salvati.',
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
        title="Permessi non aggiornati"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Accessi aggiornati"
      />

      <label className="field">
        <span>Membro</span>
        <select
          disabled={pending}
          onChange={(event) => void load(event.target.value)}
          value={membershipId}
        >
          <option value="">Seleziona un membro</option>
          {scopedMembers.map((member) => (
            <option key={member.membershipId} value={member.membershipId}>
              {member.displayName} · {member.role} · {member.email}
            </option>
          ))}
        </select>
      </label>

      {membershipId ? (
        <div className="data-list mt-5">
          {rows.map((row) => (
            <div className="data-row" key={row.locationId}>
              <div>
                <strong>{row.locationName}</strong>
                <small>{row.locationCode}</small>
              </div>
              <div className="form-grid span-2">
                <label className="field">
                  <span>
                    <input
                      checked={row.active}
                      onChange={(event) =>
                        patch(row.locationId, { active: event.target.checked })
                      }
                      type="checkbox"
                    />{' '}
                    Accesso
                  </span>
                </label>
                {[
                  ['canManageLocation', 'Location'],
                  ['canManageEvents', 'Eventi'],
                  ['canManageTables', 'Tavoli'],
                  ['canManageFloorPlan', 'Piantina'],
                  ['canManageStaff', 'Staff'],
                ].map(([key, label]) => (
                  <label className="field" key={key}>
                    <span>
                      <input
                        checked={Boolean(row[key as keyof AccessRow])}
                        disabled={!row.active}
                        onChange={(event) =>
                          patch(row.locationId, {
                            [key]: event.target.checked,
                          } as Partial<AccessRow>)
                        }
                        type="checkbox"
                      />{' '}
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="wizard-actions">
            <span className="muted">
              La prima location selezionata diventa quella predefinita del membro.
            </span>
            <button
              className="button-primary"
              disabled={pending}
              onClick={() => void save()}
              type="button"
            >
              {pending ? 'Salvataggio…' : 'Salva permessi'}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted mt-5">
          OWNER e ADMIN hanno accesso globale. Seleziona un altro ruolo per
          limitarlo a una o più location.
        </p>
      )}
    </div>
  );
}
