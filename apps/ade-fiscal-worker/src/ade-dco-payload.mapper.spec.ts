import { AdeAutomationError } from './ade-automation-error';
import { mapAdeDcoSalePayload } from './ade-dco-payload.mapper';

const FISCAL_DATA = {
  cedentePrestatore: {
    identificativiFiscali: {
      codicePaese: 'IT',
      partitaIva: '03154790343',
      codiceFiscale: '03154790343',
    },
    altriDatiIdentificativi: {
      denominazione: 'TEST SRLS',
      indirizzo: 'Via Test',
      numeroCivico: '1',
      cap: '43100',
      comune: 'PARMA',
      provincia: 'PR',
      nazione: 'IT',
      modificati: false,
      defAliquotaIVA: '10',
      nuovoUtente: false,
    },
    multiAttivita: [],
  },
};

function captureError(action: () => unknown): AdeAutomationError {
  try {
    action();
  } catch (error) {
    if (error instanceof AdeAutomationError) return error;
    throw error;
  }
  throw new Error('Expected AdeAutomationError');
}

describe('mapAdeDcoSalePayload', () => {
  it('maps a gross 10% VAT sale to the DCW10 decimal schema deterministically', () => {
    const payload = mapAdeDcoSalePayload({
      fiscalId: '03154790343',
      fiscalData: FISCAL_DATA,
      items: [
        {
          description: 'Test',
          quantity: 1,
          grossUnitPriceCents: 100,
          vatRate: 10,
        },
      ],
      payment: { cashCents: 0, electronicCents: 100 },
      expectedGrossTotalCents: 100,
      now: new Date('2026-09-03T10:00:00.000Z'),
    });

    expect(payload.datiTrasmissione.formato).toBe('DCW10');
    expect(payload.cedentePrestatore.identificativiFiscali.partitaIva).toBe(
      '03154790343',
    );
    expect(payload.documentoCommerciale.dataOra).toBe('03/09/2026');
    expect(payload.documentoCommerciale.ammontareComplessivo).toBe(
      '1.00000000',
    );
    expect(payload.documentoCommerciale.totaleImponibile).toBe('0.90909091');
    expect(payload.documentoCommerciale.importoTotaleIva).toBe('0.09090909');
    expect(payload.documentoCommerciale.elementiContabili[0]).toMatchObject({
      quantita: '1.00',
      descrizioneProdotto: 'Test',
      prezzoLordo: '1.00000000',
      prezzoUnitario: '0.90909091',
      aliquotaIVA: '10',
      importoIVA: '0.09090909',
      imponibile: '0.90909091',
      totale: '1.00000000',
    });
    expect(payload.documentoCommerciale.vendita).toEqual([
      { tipo: 'PC', importo: '0.00' },
      { tipo: 'PE', importo: '1.00' },
      { tipo: 'TR', importo: '0.00', numero: '0' },
      { tipo: 'NR_EF', importo: '0.00' },
      { tipo: 'NR_PS', importo: '0.00' },
      { tipo: 'NR_CS', importo: '0.00' },
    ]);
  });

  it('refuses seller data that belongs to a different incaricante', () => {
    const error = captureError(() =>
      mapAdeDcoSalePayload({
        fiscalId: '03053300343',
        fiscalData: FISCAL_DATA,
        items: [
          {
            description: 'Test',
            quantity: 1,
            grossUnitPriceCents: 100,
            vatRate: 10,
          },
        ],
        payment: { cashCents: 100, electronicCents: 0 },
        expectedGrossTotalCents: 100,
      }),
    );

    expect(error).toMatchObject({
      code: 'ADE_DCO_FAST_PATH_UNAVAILABLE',
      submitAttempted: false,
    });
  });

  it('does not guess a multi-activity fiscal choice', () => {
    const error = captureError(() =>
      mapAdeDcoSalePayload({
        fiscalId: '03154790343',
        fiscalData: {
          cedentePrestatore: {
            ...FISCAL_DATA.cedentePrestatore,
            multiAttivita: [{ codiceAttivita: '561011' }],
          },
        },
        items: [
          {
            description: 'Test',
            quantity: 1,
            grossUnitPriceCents: 100,
            vatRate: 10,
          },
        ],
        payment: { cashCents: 100, electronicCents: 0 },
        expectedGrossTotalCents: 100,
      }),
    );

    expect(error).toMatchObject({
      code: 'ADE_DCO_FAST_PATH_UNAVAILABLE',
      submitAttempted: false,
    });
  });
});
