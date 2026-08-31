import type { Locator, Page } from 'playwright';
import type { AdeDocumentItemInput } from './ade-document-browser.service';
import { AdeDocumentSubmitBrowserService } from './ade-document-submit-browser.service';

interface FillItemHarness {
  fillItem(
    page: Page,
    row: number,
    item: AdeDocumentItemInput,
    timeoutMs: number,
  ): Promise<void>;
}

function locator(overrides: Partial<Locator> = {}): Locator {
  const target = {
    first: jest.fn(),
    waitFor: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    inputValue: jest.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as Locator;
  (target.first as unknown as jest.Mock).mockReturnValue(target);
  return target;
}

function pageWithFields(fields: {
  quantity: Locator;
  description: Locator;
  price?: Locator;
  vat?: Locator;
}): Page {
  const price = fields.price ?? locator();
  const vat = fields.vat ?? locator();

  return {
    getByRole: jest.fn((role: string, options?: { name?: string }) => {
      if (role !== 'textbox') return locator();
      const name = String(options?.name ?? '');
      if (name.startsWith('Q.tà riga')) return fields.quantity;
      if (name.startsWith('Descrizione prodotto/servizio')) {
        return fields.description;
      }
      if (name.startsWith('Prezzo lordo')) return price;
      return locator();
    }),
    getByLabel: jest.fn(() => vat),
  } as unknown as Page;
}

const ITEM: AdeDocumentItemInput = {
  description: 'Vendita libera',
  quantity: 1,
  grossUnitPriceCents: 1200,
  vatRate: 22,
};

describe('AdeDocumentSubmitBrowserService text-field diagnostics', () => {
  let fillItem: FillItemHarness['fillItem'];

  beforeEach(() => {
    const service = new AdeDocumentSubmitBrowserService();
    fillItem = (service as unknown as FillItemHarness).fillItem.bind(service);
  });

  it('reports quantity.fill instead of collapsing the Playwright timeout', async () => {
    const quantity = locator({
      fill: jest
        .fn()
        .mockRejectedValue(
          new Error('locator.fill: Timeout 20000ms exceeded.\nCall log omitted'),
        ),
    });
    const description = locator();

    await expect(
      fillItem(pageWithFields({ quantity, description }), 1, ITEM, 20_000),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_FLOW_MISMATCH',
      category: 'SELECTOR_MISMATCH',
      submitAttempted: false,
      message: expect.stringContaining('step quantity.fill'),
    });
  });

  it('reports description.waitFor after quantity has been verified', async () => {
    const quantity = locator({
      inputValue: jest.fn().mockResolvedValue('1'),
    });
    const description = locator({
      waitFor: jest
        .fn()
        .mockRejectedValue(new Error('locator.waitFor: Timeout 20000ms exceeded.')),
    });

    await expect(
      fillItem(pageWithFields({ quantity, description }), 1, ITEM, 20_000),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_FLOW_MISMATCH',
      message: expect.stringContaining('step description.waitFor'),
    });
  });

  it('keeps verification mismatches distinct from Playwright step failures', async () => {
    const quantity = locator({
      inputValue: jest.fn().mockResolvedValue('2'),
    });
    const description = locator();

    await expect(
      fillItem(pageWithFields({ quantity, description }), 1, ITEM, 20_000),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_FLOW_MISMATCH',
      message: 'Verifica quantità riga 1 non riuscita.',
    });
  });
});
