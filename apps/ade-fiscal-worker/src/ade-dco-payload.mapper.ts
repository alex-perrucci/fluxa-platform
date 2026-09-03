import { AdeAutomationError } from './ade-automation-error';
import type {
  AdeDocumentItemInput,
  AdeDocumentPaymentInput,
} from './ade-document-browser.service';

export interface AdeDcoSellerIdentity {
  identificativiFiscali: {
    codicePaese: string;
    partitaIva: string;
    codiceFiscale: string;
  };
  altriDatiIdentificativi: {
    denominazione: string;
    indirizzo: string;
    numeroCivico: string;
    cap: string;
    comune: string;
    provincia: string;
    nazione: string;
    modificati: boolean;
    defAliquotaIVA: string;
    nuovoUtente: boolean;
  };
  multiAttivita: unknown[];
}

export interface AdeDcoSalePayload {
  datiTrasmissione: { formato: 'DCW10' };
  cedentePrestatore: AdeDcoSellerIdentity;
  documentoCommerciale: {
    flagDocCommPerRegalo: false;
    progressivoCollegato: '';
    dataOra: string;
    multiAttivita: { codiceAttivita: ''; descAttivita: '' };
    importoTotaleIva: string;
    scontoTotale: '0.00000000';
    scontoTotaleLordo: '0.00000000';
    totaleImponibile: string;
    ammontareComplessivo: string;
    totaleNonRiscosso: '0.00000000';
    elementiContabili: Array<{
      idElementoContabile: '';
      resiPregressi: '0.00';
      reso: '0.00';
      quantita: string;
      descrizioneProdotto: string;
      prezzoLordo: string;
      prezzoUnitario: string;
      scontoUnitario: '0.00000000';
      scontoLordo: '0.00000000';
      aliquotaIVA: string;
      importoIVA: string;
      imponibile: string;
      imponibileNetto: string;
      totale: string;
      omaggio: 'N';
    }>;
    vendita: Array<{
      tipo: 'PC' | 'PE' | 'TR' | 'NR_EF' | 'NR_PS' | 'NR_CS';
      importo: string;
      numero?: '0';
    }>;
    scontoAbbuono: '0.00';
    importoDetraibileDeducibile: '0.00000000';
  };
  flagIdentificativiModificati: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function fastPathUnavailable(message: string): never {
  throw new AdeAutomationError(
    message,
    'ADE_DCO_FAST_PATH_UNAVAILABLE',
    'CONFIGURATION',
    true,
  );
}

function sellerCandidates(raw: unknown): unknown[] {
  if (!isRecord(raw)) return [];
  const values: unknown[] = [raw, raw.cedentePrestatore];

  if (isRecord(raw.datiFiscali)) {
    values.push(raw.datiFiscali, raw.datiFiscali.cedentePrestatore);
  }
  if (isRecord(raw.content)) {
    values.push(raw.content, raw.content.cedentePrestatore);
  }

  return values;
}

export function normalizeAdeDcoSeller(
  raw: unknown,
  expectedFiscalId: string,
): AdeDcoSellerIdentity {
  for (const candidate of sellerCandidates(raw)) {
    if (!isRecord(candidate)) continue;
    const fiscal = candidate.identificativiFiscali;
    const other = candidate.altriDatiIdentificativi;
    if (!isRecord(fiscal) || !isRecord(other)) continue;

    const partitaIva = stringValue(fiscal.partitaIva);
    const codicePaese = stringValue(fiscal.codicePaese);
    const codiceFiscale = stringValue(fiscal.codiceFiscale);
    const denominazione = stringValue(other.denominazione);
    const indirizzo = stringValue(other.indirizzo);
    const cap = stringValue(other.cap);
    const comune = stringValue(other.comune);
    const nazione = stringValue(other.nazione);

    if (
      !/^\d{11}$/.test(partitaIva) ||
      partitaIva !== expectedFiscalId ||
      !codicePaese ||
      !codiceFiscale ||
      !denominazione ||
      !indirizzo ||
      !cap ||
      !comune ||
      !nazione
    ) {
      continue;
    }

    const multiAttivita = Array.isArray(candidate.multiAttivita)
      ? candidate.multiAttivita
      : [];
    if (multiAttivita.length > 0) {
      fastPathUnavailable(
        'Il profilo AdE usa multi-attività: il fast path non sceglie automaticamente un’attività fiscale.',
      );
    }

    if (booleanValue(other.nuovoUtente, false)) {
      fastPathUnavailable(
        'Il profilo AdE richiede il completamento iniziale dei dati fiscali prima del fast path.',
      );
    }

    return {
      identificativiFiscali: {
        codicePaese,
        partitaIva,
        codiceFiscale,
      },
      altriDatiIdentificativi: {
        denominazione,
        indirizzo,
        numeroCivico: stringValue(other.numeroCivico),
        cap,
        comune,
        provincia: stringValue(other.provincia),
        nazione,
        modificati: booleanValue(other.modificati, false),
        defAliquotaIVA: stringValue(other.defAliquotaIVA),
        nuovoUtente: false,
      },
      multiAttivita: [],
    };
  }

  fastPathUnavailable(
    'I dati fiscali restituiti da AdE non sono compatibili con il mapper DCW10 o non corrispondono all’incaricante richiesto.',
  );
}

function euroFromCents(cents: number, decimals: number): string {
  return (cents / 100).toFixed(decimals);
}

function rationalEuroFromGrossCents(
  grossCents: number,
  vatRate: number,
): number {
  return grossCents / (100 + vatRate);
}

function decimal(value: number, digits = 8): string {
  return value.toFixed(digits);
}

function italianDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('day')}/${byType.get('month')}/${byType.get('year')}`;
}

export function mapAdeDcoSalePayload(input: {
  fiscalId: string;
  fiscalData: unknown;
  items: AdeDocumentItemInput[];
  payment: AdeDocumentPaymentInput;
  expectedGrossTotalCents: number;
  now?: Date;
}): AdeDcoSalePayload {
  const seller = normalizeAdeDcoSeller(input.fiscalData, input.fiscalId);

  let calculatedGrossCents = 0;
  let taxableTotal = 0;
  let vatTotal = 0;

  const elementiContabili = input.items.map((item) => {
    const lineGrossCents = item.grossUnitPriceCents * item.quantity;
    calculatedGrossCents += lineGrossCents;

    const unitTaxable = rationalEuroFromGrossCents(
      item.grossUnitPriceCents,
      item.vatRate,
    );
    const lineTaxable = rationalEuroFromGrossCents(
      lineGrossCents,
      item.vatRate,
    );
    const lineGross = lineGrossCents / 100;
    const lineVat = lineGross - lineTaxable;
    taxableTotal += lineTaxable;
    vatTotal += lineVat;

    return {
      idElementoContabile: '' as const,
      resiPregressi: '0.00' as const,
      reso: '0.00' as const,
      quantita: item.quantity.toFixed(2),
      descrizioneProdotto: item.description,
      prezzoLordo: euroFromCents(item.grossUnitPriceCents, 8),
      prezzoUnitario: decimal(unitTaxable),
      scontoUnitario: '0.00000000' as const,
      scontoLordo: '0.00000000' as const,
      aliquotaIVA: String(item.vatRate),
      importoIVA: decimal(lineVat),
      imponibile: decimal(lineTaxable),
      imponibileNetto: decimal(lineTaxable),
      totale: euroFromCents(lineGrossCents, 8),
      omaggio: 'N' as const,
    };
  });

  if (calculatedGrossCents !== input.expectedGrossTotalCents) {
    fastPathUnavailable(
      'Il totale del payload DCW10 non coincide con il totale validato dal documento Fluxa.',
    );
  }
  if (
    input.payment.cashCents + input.payment.electronicCents !==
    input.expectedGrossTotalCents
  ) {
    fastPathUnavailable(
      'Il totale dei pagamenti non coincide con il totale DCW10.',
    );
  }

  return {
    datiTrasmissione: { formato: 'DCW10' },
    cedentePrestatore: seller,
    documentoCommerciale: {
      flagDocCommPerRegalo: false,
      progressivoCollegato: '',
      dataOra: italianDate(input.now ?? new Date()),
      multiAttivita: { codiceAttivita: '', descAttivita: '' },
      importoTotaleIva: decimal(vatTotal),
      scontoTotale: '0.00000000',
      scontoTotaleLordo: '0.00000000',
      totaleImponibile: decimal(taxableTotal),
      ammontareComplessivo: euroFromCents(input.expectedGrossTotalCents, 8),
      totaleNonRiscosso: '0.00000000',
      elementiContabili,
      vendita: [
        { tipo: 'PC', importo: euroFromCents(input.payment.cashCents, 2) },
        {
          tipo: 'PE',
          importo: euroFromCents(input.payment.electronicCents, 2),
        },
        { tipo: 'TR', importo: '0.00', numero: '0' },
        { tipo: 'NR_EF', importo: '0.00' },
        { tipo: 'NR_PS', importo: '0.00' },
        { tipo: 'NR_CS', importo: '0.00' },
      ],
      scontoAbbuono: '0.00',
      importoDetraibileDeducibile: '0.00000000',
    },
    flagIdentificativiModificati: false,
  };
}
