import { ConflictException, Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { FiscalDocumentsService } from './fiscal-documents.service';

interface ReceiptIssuerRow extends QueryResultRow {
  displayName: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  countryCode: string;
  timezone: string;
}

interface RawFiscalItem {
  id?: string;
  line_no?: number;
  lineNo?: number;
  description?: string;
  quantity_amount?: number;
  quantityAmount?: number;
  quantity_scale?: number;
  quantityScale?: number;
  unit_price_cents?: number;
  unitPriceCents?: number;
  discount_cents?: number;
  discountCents?: number;
  final_gross_cents?: number;
  finalGrossCents?: number;
  vat_rate_basis_points?: number;
  vatRateBasisPoints?: number;
  vat_nature_code?: string | null;
  vatNatureCode?: string | null;
}

interface RawFiscalVat {
  id?: string;
  vat_key?: string;
  vatKey?: string;
  vat_rate_basis_points?: number;
  vatRateBasisPoints?: number;
  vat_nature_code?: string | null;
  vatNatureCode?: string | null;
  gross_cents?: number;
  grossCents?: number;
  net_cents?: number;
  netCents?: number;
  tax_cents?: number;
  taxCents?: number;
}

@Injectable()
export class FiscalReceiptLayoutService {
  constructor(
    private readonly database: DatabaseService,
    private readonly documents: FiscalDocumentsService,
  ) {}

  async get(auth: AuthContext, documentId: string) {
    const document = await this.documents.get(auth, documentId);
    if (document.type !== 'SALE') {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_LAYOUT_TYPE_UNSUPPORTED',
        message: 'Il layout termico è disponibile per i documenti di vendita.',
      });
    }
    if (!['ISSUED', 'VOIDED'].includes(document.status)) {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_LAYOUT_NOT_READY',
        message: 'Il documento fiscale non è ancora pronto per la stampa.',
      });
    }

    const issuerResult = await this.database.pool.query<ReceiptIssuerRow>(
      `SELECT
         COALESCE(NULLIF(fp.display_name, ''), NULLIF(l.name, ''), m.legal_name) AS "displayName",
         m.legal_name AS "legalName",
         l.address_line_1 AS "addressLine1",
         l.address_line_2 AS "addressLine2",
         l.postal_code AS "postalCode",
         l.city,
         l.province,
         l.country_code AS "countryCode",
         l.timezone
       FROM locations l
       JOIN merchants m
         ON m.id = l.merchant_id
        AND m.organization_id = l.organization_id
       LEFT JOIN fiscal_profiles fp
         ON fp.location_id = l.id
        AND fp.organization_id = l.organization_id
       WHERE l.id = $1 AND l.organization_id = $2
       LIMIT 1`,
      [document.locationId, document.organizationId],
    );
    const issuer = issuerResult.rows[0];
    if (!issuer) {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_ISSUER_MISSING',
        message: 'Dati dell’esercente non disponibili per la stampa fiscale.',
      });
    }

    const items = (document.items as RawFiscalItem[]).map((item, index) => ({
      id: item.id ?? `${documentId}:${index + 1}`,
      lineNo: item.lineNo ?? item.line_no ?? index + 1,
      description: item.description?.trim() || 'Articolo',
      quantityAmount: item.quantityAmount ?? item.quantity_amount ?? 1,
      quantityScale: item.quantityScale ?? item.quantity_scale ?? 0,
      unitPriceCents: item.unitPriceCents ?? item.unit_price_cents ?? 0,
      discountCents: item.discountCents ?? item.discount_cents ?? 0,
      finalGrossCents: item.finalGrossCents ?? item.final_gross_cents ?? 0,
      vatRateBasisPoints:
        item.vatRateBasisPoints ?? item.vat_rate_basis_points ?? 0,
      vatNatureCode: item.vatNatureCode ?? item.vat_nature_code ?? null,
    }));

    const vatSummaries = (document.vatSummaries as RawFiscalVat[]).map(
      (vat, index) => ({
        id: vat.id ?? `${documentId}:vat:${index + 1}`,
        vatKey: vat.vatKey ?? vat.vat_key ?? '',
        vatRateBasisPoints:
          vat.vatRateBasisPoints ?? vat.vat_rate_basis_points ?? 0,
        vatNatureCode: vat.vatNatureCode ?? vat.vat_nature_code ?? null,
        grossCents: vat.grossCents ?? vat.gross_cents ?? 0,
        netCents: vat.netCents ?? vat.net_cents ?? 0,
        taxCents: vat.taxCents ?? vat.tax_cents ?? 0,
      }),
    );

    const paidCents =
      document.cashPaymentCents + document.electronicPaymentCents;

    return {
      documentId: document.id,
      provider: document.provider,
      status: document.status,
      fiscalId: document.fiscalId,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      externalId: document.externalId,
      issuedAt: document.issuedAt,
      currency: document.currency,
      totalCents: document.totalCents,
      cashPaymentCents: document.cashPaymentCents,
      electronicPaymentCents: document.electronicPaymentCents,
      paidCents,
      unpaidCents: Math.max(0, document.totalCents - paidCents),
      totalVatCents: vatSummaries.reduce((sum, vat) => sum + vat.taxCents, 0),
      issuer: {
        displayName: issuer.displayName,
        legalName: issuer.legalName,
        vatNumber: document.fiscalId,
        addressLine1: issuer.addressLine1,
        addressLine2: issuer.addressLine2,
        postalCode: issuer.postalCode,
        city: issuer.city,
        province: issuer.province,
        countryCode: issuer.countryCode,
        timezone: issuer.timezone,
      },
      items,
      vatSummaries,
    };
  }
}
