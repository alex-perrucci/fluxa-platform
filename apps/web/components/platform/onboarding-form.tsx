// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';

type SubscriptionPlan = 'START' | 'SALA' | 'PRO';

interface OnboardingResult {
  organization: { id: string; name: string; slug: string };
  owner: { email: string; displayName: string };
  location: { name: string };
  subscription?: { plan: SubscriptionPlan; status: string };
  tables: Array<{ id: string }>;
}

interface EditableTable {
  code: string;
  name: string;
  capacity: number;
}

function createTable(index: number, capacity: number): EditableTable {
  return {
    code: `T${index + 1}`,
    name: `Tavolo ${index + 1}`,
    capacity,
  };
}

export function PlatformOnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [defaultTableCapacity, setDefaultTableCapacity] = useState(4);
  const [tables, setTables] = useState<EditableTable[]>(() =>
    Array.from({ length: 8 }, (_, index) => createTable(index, 4)),
  );
  const progress = useMemo(() => `${(step / 4) * 100}%`, [step]);

  function resizeTables(nextCount: number) {
    const safeCount = Math.min(100, Math.max(1, nextCount || 1));

    setTables((current) =>
      Array.from(
        { length: safeCount },
        (_, index) =>
          current[index] ?? createTable(index, defaultTableCapacity),
      ),
    );
  }

  function updateTable(index: number, patch: Partial<EditableTable>) {
    setTables((current) =>
      current.map((table, tableIndex) =>
        tableIndex === index ? { ...table, ...patch } : table,
      ),
    );
  }

  function applyCapacityToAll() {
    setTables((current) =>
      current.map((table) => ({
        ...table,
        capacity: defaultTableCapacity,
      })),
    );
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const ownerEmail = String(form.get('ownerEmail') ?? '')
      .trim()
      .toLowerCase();
    const ownerDisplayName = String(form.get('ownerDisplayName') ?? '').trim();
    const ownerTemporaryPassword = String(
      form.get('ownerTemporaryPassword') ?? '',
    );
    const legalName = String(form.get('legalName') ?? '').trim();
    const tradeName = String(form.get('tradeName') ?? '').trim();
    const vatNumber = String(form.get('vatNumber') ?? '').trim();
    const taxCode = String(form.get('taxCode') ?? '').trim();
    const locationCode = String(form.get('locationCode') ?? '')
      .trim()
      .toUpperCase();
    const locationName = String(form.get('locationName') ?? '').trim();
    const addressLine1 = String(form.get('addressLine1') ?? '').trim();
    const addressLine2 = String(form.get('addressLine2') ?? '').trim();
    const postalCode = String(form.get('postalCode') ?? '').trim();
    const city = String(form.get('city') ?? '').trim();
    const province = String(form.get('province') ?? '')
      .trim()
      .toUpperCase();
    const areaCode = String(form.get('areaCode') ?? '')
      .trim()
      .toUpperCase();
    const areaName = String(form.get('areaName') ?? '').trim();

    function reject(targetStep: number, message: string) {
      setStep(targetStep);
      setError(message);
      setPending(false);
    }

    if (
      organizationName.trim().length < 2 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) ||
      !legalName ||
      !vatNumber ||
      !plan
    ) {
      reject(
        1,
        'Completa nome, slug, ragione sociale, partita IVA e seleziona un piano.',
      );
      return;
    }

    if (
      !ownerDisplayName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      ownerTemporaryPassword.length < 12
    ) {
      reject(
        2,
        'Controlla nome, email e password OWNER di almeno 12 caratteri.',
      );
      return;
    }

    if (
      !locationCode ||
      !locationName ||
      !addressLine1 ||
      !postalCode ||
      !city
    ) {
      reject(3, 'Completa tutti i dati obbligatori della sede.');
      return;
    }

    if (!areaCode || !areaName) {
      reject(4, 'Completa codice e nome dell’area.');
      return;
    }

    const normalizedTables = tables.map((table) => ({
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      capacity: table.capacity,
    }));
    const tableCodes = normalizedTables.map((table) => table.code);

    if (
      normalizedTables.some(
        (table) =>
          !table.code ||
          !table.name ||
          !Number.isInteger(table.capacity) ||
          table.capacity < 1 ||
          table.capacity > 100,
      )
    ) {
      reject(4, 'Controlla codice, nome e posti di ogni tavolo.');
      return;
    }

    if (new Set(tableCodes).size !== tableCodes.length) {
      reject(4, 'I codici dei tavoli devono essere univoci.');
      return;
    }

    const payload = {
      organizationName: organizationName.trim(),
      organizationSlug,
      plan,
      ownerEmail,
      ownerDisplayName,
      ownerTemporaryPassword,
      legalName,
      tradeName: tradeName || undefined,
      vatNumber,
      taxCode: taxCode || undefined,
      countryCode: 'IT',
      locationCode,
      locationName,
      addressLine1,
      addressLine2: addressLine2 || undefined,
      postalCode,
      city,
      province: province || undefined,
      timezone: 'Europe/Rome',
      areaCode,
      areaName,
      tables: normalizedTables,
    };

    try {
      const response = await fetch('/api/control-center/platform/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as
        | OnboardingResult
        | { message?: string };

      if (!response.ok) {
        setError(
          'message' in body && body.message
            ? body.message
            : 'Onboarding non completato.',
        );
        return;
      }

      setResult(body as OnboardingResult);
      router.refresh();
    } catch {
      setError('Control Center non raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="success-canvas">
        <div className="success-ring">
          <Icon className="h-9 w-9" name="sparkles" />
        </div>
        <p className="eyebrow">Tenant online</p>
        <h2>{result.organization.name} è pronta.</h2>
        <p>
          Organizzazione, account OWNER, sede, sala, piano e{' '}
          {result.tables.length} tavoli creati in una singola transazione.
        </p>
        <div className="success-grid">
          <div>
            <span>Owner</span>
            <strong>{result.owner.email}</strong>
          </div>
          <div>
            <span>Sede</span>
            <strong>{result.location.name}</strong>
          </div>
          <div>
            <span>Piano</span>
            <strong>{result.subscription?.plan ?? plan}</strong>
          </div>
          <div>
            <span>Slug</span>
            <strong>{result.organization.slug}</strong>
          </div>
        </div>
        <button
          className="button-primary"
          onClick={() =>
            router.push(
              `/platform-admin/organizations/${result.organization.id}`,
            )
          }
          type="button"
        >
          Apri il tenant
          <Icon name="arrow" />
        </button>
      </div>
    );
  }

  return (
    <form className="wizard" noValidate onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Controlla i dati inseriti"
      />
      <div className="wizard-progress">
        <div style={{ width: progress }} />
      </div>
      <div className="wizard-steps">
        {['Identità', 'Titolare', 'Sede', 'Layout'].map((label, index) => (
          <button
            className={step === index + 1 ? 'active' : ''}
            key={label}
            onClick={() => setStep(index + 1)}
            type="button"
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <section className={step === 1 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">01 · Identità tenant</p>
        <h2>Diamo un’identità al nuovo workspace.</h2>
        <div className="form-grid">
          <label className="field span-2">
            <span>Nome organizzazione</span>
            <input
              minLength={2}
              onChange={(changeEvent) => {
                setOrganizationName(changeEvent.target.value);
                setOrganizationSlug(slugify(changeEvent.target.value));
              }}
              placeholder="Lumen Hospitality"
              required
              value={organizationName}
            />
          </label>
          <label className="field span-2">
            <span>Slug pubblico</span>
            <input
              minLength={3}
              onChange={(changeEvent) =>
                setOrganizationSlug(changeEvent.target.value)
              }
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={organizationSlug}
            />
          </label>
          <label className="field span-2">
            <span>Piano Fluxa</span>
            <select
              onChange={(changeEvent) =>
                setPlan(changeEvent.target.value as SubscriptionPlan | '')
              }
              required
              value={plan}
            >
              <option value="">Seleziona un piano</option>
              <option value="START">Fluxa Start · Cassa</option>
              <option value="SALA">Fluxa Sala · Cassa + tavoli</option>
              <option value="PRO">Fluxa Pro · Sala + cucina/KDS</option>
            </select>
            <small>
              Obbligatorio: il tenant non viene creato senza una subscription.
            </small>
          </label>
          <label className="field">
            <span>Ragione sociale</span>
            <input name="legalName" required />
          </label>
          <label className="field">
            <span>Nome commerciale</span>
            <input name="tradeName" />
          </label>
          <label className="field">
            <span>Partita IVA</span>
            <input name="vatNumber" required />
          </label>
          <label className="field">
            <span>Codice fiscale</span>
            <input name="taxCode" />
          </label>
        </div>
      </section>

      <section className={step === 2 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">02 · Account OWNER</p>
        <h2>Creiamo l’accesso del titolare.</h2>
        <div className="form-grid">
          <label className="field span-2">
            <span>Nome completo</span>
            <input name="ownerDisplayName" required />
          </label>
          <label className="field span-2">
            <span>Email di accesso</span>
            <input name="ownerEmail" required type="email" />
          </label>
          <label className="field span-2">
            <span>Password temporanea</span>
            <input
              minLength={12}
              name="ownerTemporaryPassword"
              required
              type="password"
            />
            <small>
              Almeno 12 caratteri. Comunicala al titolare in modo sicuro.
            </small>
          </label>
        </div>
      </section>

      <section className={step === 3 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">03 · Prima sede</p>
        <h2>Configuriamo il punto operativo principale.</h2>
        <div className="form-grid">
          <label className="field">
            <span>Codice sede</span>
            <input defaultValue="MAIN" name="locationCode" required />
          </label>
          <label className="field">
            <span>Nome sede</span>
            <input name="locationName" required />
          </label>
          <label className="field span-2">
            <span>Indirizzo</span>
            <input name="addressLine1" required />
          </label>
          <label className="field span-2">
            <span>Dettagli indirizzo</span>
            <input name="addressLine2" />
          </label>
          <label className="field">
            <span>CAP</span>
            <input name="postalCode" required />
          </label>
          <label className="field">
            <span>Città</span>
            <input name="city" required />
          </label>
          <label className="field">
            <span>Provincia</span>
            <input maxLength={8} name="province" />
          </label>
        </div>
      </section>

      <section className={step === 4 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">04 · Layout iniziale</p>
        <h2>Configura ogni tavolo prima di attivare il locale.</h2>
        <div className="form-grid">
          <label className="field">
            <span>Codice area</span>
            <input defaultValue="SALA" name="areaCode" required />
          </label>
          <label className="field">
            <span>Nome area</span>
            <input defaultValue="Sala principale" name="areaName" required />
          </label>
          <label className="field">
            <span>Numero tavoli</span>
            <input
              max={100}
              min={1}
              onChange={(changeEvent) =>
                resizeTables(Number(changeEvent.target.value))
              }
              type="number"
              value={tables.length}
            />
          </label>
          <label className="field">
            <span>Posti predefiniti per nuovi tavoli</span>
            <input
              max={100}
              min={1}
              onChange={(changeEvent) =>
                setDefaultTableCapacity(
                  Math.min(
                    100,
                    Math.max(1, Number(changeEvent.target.value) || 1),
                  ),
                )
              }
              type="number"
              value={defaultTableCapacity}
            />
          </label>
        </div>

        <div className="table-editor-toolbar">
          <div>
            <strong>{tables.length} tavoli configurati</strong>
            <span>
              Codice, nome e posti possono essere diversi per ogni tavolo.
            </span>
          </div>
          <button
            className="button-secondary"
            onClick={applyCapacityToAll}
            type="button"
          >
            Applica {defaultTableCapacity} posti a tutti
          </button>
        </div>

        <div className="table-editor">
          {tables.map((table, index) => (
            <div className="table-editor-row" key={index}>
              <div className="table-editor-index">{index + 1}</div>
              <label className="field">
                <span>Codice</span>
                <input
                  aria-label={`Codice tavolo ${index + 1}`}
                  maxLength={40}
                  onChange={(changeEvent) =>
                    updateTable(index, { code: changeEvent.target.value })
                  }
                  required
                  value={table.code}
                />
              </label>
              <label className="field">
                <span>Nome</span>
                <input
                  aria-label={`Nome tavolo ${index + 1}`}
                  maxLength={120}
                  onChange={(changeEvent) =>
                    updateTable(index, { name: changeEvent.target.value })
                  }
                  required
                  value={table.name}
                />
              </label>
              <label className="field table-editor-capacity">
                <span>Posti</span>
                <input
                  aria-label={`Posti tavolo ${index + 1}`}
                  max={100}
                  min={1}
                  onChange={(changeEvent) =>
                    updateTable(index, {
                      capacity: Math.min(
                        100,
                        Math.max(1, Number(changeEvent.target.value) || 1),
                      ),
                    })
                  }
                  required
                  type="number"
                  value={table.capacity}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="wizard-actions">
        <button
          className="button-secondary"
          disabled={step === 1}
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          type="button"
        >
          Indietro
        </button>
        {step < 4 ? (
          <button
            className="button-primary"
            onClick={() => setStep((value) => Math.min(4, value + 1))}
            type="button"
          >
            Continua
            <Icon name="arrow" />
          </button>
        ) : (
          <button className="button-primary" disabled={pending} type="submit">
            {pending ? 'Creazione in corso…' : 'Attiva organizzazione'}
            <Icon name="sparkles" />
          </button>
        )}
      </div>
    </form>
  );
}
