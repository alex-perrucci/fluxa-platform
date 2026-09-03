import { AdeAutomationError } from './ade-automation-error';
import { AdeDcoFastSubmitService } from './ade-dco-fast-submit.service';
import { AdeDcoHttpClient } from './ade-dco-http.client';
import { AdeFastSubmitMetricsService } from './ade-fast-submit-metrics.service';

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

const BASELINE = {
  idtrx: 'old-transaction',
  progressivo: '10',
  documentoCommerciale: {
    numeroProgressivo: '10',
    dataOra: '03/09/2026',
    ammontareComplessivo: '1.00',
  },
};

const NEW_DOCUMENT = {
  idtrx: 'new-transaction',
  progressivo: '11',
  documentoCommerciale: {
    numeroProgressivo: '11',
    dataOra: '03/09/2026',
    ammontareComplessivo: '1.00',
  },
};

const INPUT = {
  storageStatePath: '/runtime/03154790343.json',
  fiscalId: '03154790343',
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
  timeoutMs: 5_000,
};

function httpMock(options?: {
  postResult?: unknown;
  postError?: unknown;
  after?: unknown;
  fiscalData?: unknown;
}) {
  const bootstrapDco = jest.fn().mockResolvedValue({
    status: 200,
    path: '/ser/documenticommercialionline/',
    contentType: 'text/html',
  });
  const getJson = jest
    .fn()
    .mockResolvedValueOnce({ status: 200, body: { name: 'me' } })
    .mockResolvedValueOnce({
      status: 200,
      body: options?.fiscalData ?? FISCAL_DATA,
    })
    .mockResolvedValueOnce({ status: 200, body: BASELINE })
    .mockResolvedValue({
      status: 200,
      body: options?.after ?? BASELINE,
    });
  const postDocumentJson = options?.postError
    ? jest.fn().mockRejectedValue(options.postError)
    : jest.fn().mockResolvedValue(
        options?.postResult ?? {
          status: 201,
          responseDate: 'Thu, 03 Sep 2026 12:31:07 GMT',
          body: {
            esito: true,
            idtrx: 'post-transaction',
            progressivo: '11',
          },
          submitAttempted: true,
        },
      );

  return {
    client: {
      bootstrapDco,
      getJson,
      postDocumentJson,
    } as unknown as AdeDcoHttpClient,
    bootstrapDco,
    getJson,
    postDocumentJson,
  };
}

function service(client: AdeDcoHttpClient) {
  return new AdeDcoFastSubmitService(
    client,
    new AdeFastSubmitMetricsService(),
  );
}

describe('AdeDcoFastSubmitService', () => {
  it('confirms from a positive POST response and captures the AdE server date', async () => {
    const http = httpMock();
    const result = await service(http.client).submit(INPUT);

    expect(result).toMatchObject({
      confirmationEvidence: 'HTTP_RESPONSE',
      externalId: 'post-transaction',
      documentNumber: '11',
      documentDate: '2026-09-03T12:31:07.000Z',
      submitAttempted: true,
    });
    expect(http.postDocumentJson).toHaveBeenCalledTimes(1);
  });

  it('prefers a new matching ultimo document as reconciliation evidence', async () => {
    const http = httpMock({
      postResult: {
        status: 201,
        body: null,
        responseDate: 'Thu, 03 Sep 2026 12:31:07 GMT',
        submitAttempted: true,
      },
      after: NEW_DOCUMENT,
    });
    const result = await service(http.client).submit(INPUT);

    expect(result).toMatchObject({
      confirmationEvidence: 'HTTP_RECONCILED',
      externalId: 'new-transaction',
      documentNumber: '11',
      documentDate: '2026-09-03',
      submitAttempted: true,
    });
  });

  it('returns UNKNOWN after an ambiguous HTTP result and never sends a second POST', async () => {
    const http = httpMock({
      postResult: {
        status: 202,
        body: {},
        responseDate: 'Thu, 03 Sep 2026 12:31:07 GMT',
        submitAttempted: true,
      },
    });

    await expect(service(http.client).submit(INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
      retrySafe: false,
      submitAttempted: true,
    });
    expect(http.postDocumentJson).toHaveBeenCalledTimes(1);
  });

  it('classifies an explicit AdE rejection as a terminal attempted submit', async () => {
    const http = httpMock({
      postResult: {
        status: 400,
        responseDate: 'Thu, 03 Sep 2026 12:31:07 GMT',
        body: { esito: false, errori: [{ codice: 'X' }] },
        submitAttempted: true,
      },
    });

    await expect(service(http.client).submit(INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_REJECTED',
      retrySafe: false,
      submitAttempted: true,
    });
    expect(http.postDocumentJson).toHaveBeenCalledTimes(1);
  });

  it('recovers a transport UNKNOWN only through read-only ultimo reconciliation', async () => {
    const http = httpMock({
      postError: new AdeAutomationError(
        'connection lost',
        'ADE_DOCUMENT_SUBMIT_UNKNOWN',
        'SUBMIT_UNKNOWN',
        false,
        true,
      ),
      after: NEW_DOCUMENT,
    });
    const result = await service(http.client).submit(INPUT);

    expect(result.confirmationEvidence).toBe('HTTP_RECONCILED');
    expect(result.externalId).toBe('new-transaction');
    expect(http.postDocumentJson).toHaveBeenCalledTimes(1);
  });

  it('falls out before POST when AdE fiscal data do not match the requested incaricante', async () => {
    const http = httpMock({
      fiscalData: {
        cedentePrestatore: {
          ...FISCAL_DATA.cedentePrestatore,
          identificativiFiscali: {
            ...FISCAL_DATA.cedentePrestatore.identificativiFiscali,
            partitaIva: '03053300343',
          },
        },
      },
    });

    await expect(service(http.client).submit(INPUT)).rejects.toMatchObject({
      code: 'ADE_DCO_FAST_PATH_UNAVAILABLE',
      submitAttempted: false,
    });
    expect(http.postDocumentJson).not.toHaveBeenCalled();
  });
});
