import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';

void main() {
  test('parses A-Cube fiscal document detail and snake case snapshots', () {
    final document = FiscalDocument.fromJson({
      'id': 'document-1',
      'organizationId': 'org-1',
      'locationId': 'location-1',
      'orderId': 'order-1',
      'parentDocumentId': null,
      'type': 'SALE',
      'status': 'ISSUED',
      'provider': 'ACUBE_SMART_RECEIPTS',
      'environment': 'SANDBOX',
      'fiscalId': '12345678901',
      'currency': 'EUR',
      'totalCents': 1220,
      'cashPaymentCents': 500,
      'electronicPaymentCents': 720,
      'externalId': 'acube-1',
      'externalStatus': 'issued',
      'documentNumber': 'SR-0001',
      'documentDate': '2026-07-22',
      'errorCode': null,
      'errorMessage': null,
      'maxAttempts': 5,
      'nextAttemptAt': '2026-07-22T10:00:00Z',
      'version': 2,
      'payload': {'fiscal_id': '12345678901'},
      'providerResponse': {'id': 'acube-1'},
      'createdAt': '2026-07-22T10:00:00Z',
      'updatedAt': '2026-07-22T10:00:01Z',
      'issuedAt': '2026-07-22T10:00:01Z',
      'voidedAt': null,
      'items': [
        {
          'id': 'item-1',
          'line_no': 1,
          'description': 'Caffè',
          'quantity_amount': 1,
          'quantity_scale': 0,
          'unit_price_cents': 1220,
          'gross_cents': 1220,
          'discount_cents': 0,
          'final_gross_cents': 1220,
          'vat_rate_basis_points': 2200,
          'vat_nature_code': null,
          'vat_rate_code': '22',
        },
      ],
      'vatSummaries': [
        {
          'id': 'vat-1',
          'vat_key': '22',
          'vat_rate_basis_points': 2200,
          'vat_nature_code': null,
          'gross_cents': 1220,
          'net_cents': 1000,
          'tax_cents': 220,
        },
      ],
      'attempts': [
        {
          'attemptNo': 1,
          'outcome': 'ISSUED',
          'errorCode': null,
          'errorMessage': null,
          'startedAt': '2026-07-22T10:00:00Z',
          'finishedAt': '2026-07-22T10:00:01Z',
        },
      ],
    });

    expect(document.provider, FiscalProvider.acubeSmartReceipts);
    expect(document.environment, FiscalEnvironment.sandbox);
    expect(document.status, FiscalDocumentStatus.issued);
    expect(document.items.single.description, 'Caffè');
    expect(document.vatSummaries.single.taxCents, 220);
    expect(document.attemptHistory.single.outcome, 'ISSUED');
    expect(document.canVoid, isTrue);
  });

  test('parses OpenAPI fiscal profiles returned by the backend', () {
    final profile = FiscalProfile.fromJson({
      'id': 'profile-openapi',
      'organizationId': 'org-1',
      'locationId': 'location-1',
      'provider': 'OPENAPI_SMART_RECEIPTS',
      'environment': 'SANDBOX',
      'fiscalId': '12345678901',
      'enabled': true,
      'autoIssueOnPaid': true,
      'receiptEmail': 'receipts@example.com',
      'displayName': 'Demo OpenAPI',
      'version': 1,
      'createdAt': '2026-08-14T10:00:00Z',
      'updatedAt': '2026-08-14T10:00:00Z',
    });

    expect(profile.provider, FiscalProvider.openapiSmartReceipts);
    expect(profile.provider.label, 'OpenAPI Smart Receipts');
    expect(profile.autoIssueOnPaid, isTrue);
  });

  test('parses ADE_WEB profile and terminal attention states', () {
    final profile = FiscalProfile.fromJson({
      'id': 'profile-ade',
      'organizationId': 'org-1',
      'locationId': 'location-1',
      'provider': 'ADE_WEB',
      'environment': 'PRODUCTION',
      'fiscalId': '12345678901',
      'enabled': true,
      'autoIssueOnPaid': true,
      'receiptEmail': null,
      'displayName': 'Punto vendita AdE',
      'version': 1,
      'createdAt': '2026-08-20T10:00:00Z',
      'updatedAt': '2026-08-20T10:00:00Z',
    });

    expect(profile.provider, FiscalProvider.adeWeb);
    expect(profile.provider.label, 'Agenzia delle Entrate');
    expect(profile.environment, FiscalEnvironment.production);
    expect(FiscalDocumentStatus.fromWire('UNKNOWN').requiresAttention, isTrue);
    expect(
      FiscalDocumentStatus.fromWire('AUTH_REQUIRED').requiresAttention,
      isTrue,
    );
    expect(FiscalDocumentStatus.fromWire('UNKNOWN').isPending, isFalse);
    expect(FiscalDocumentStatus.fromWire('AUTH_REQUIRED').isPending, isFalse);
  });

  test('does not expose ADE_WEB void before E4', () {
    final document = FiscalDocument.fromJson({
      'id': 'document-ade',
      'organizationId': 'org-1',
      'locationId': 'location-1',
      'orderId': 'order-1',
      'parentDocumentId': null,
      'type': 'SALE',
      'status': 'ISSUED',
      'provider': 'ADE_WEB',
      'environment': 'PRODUCTION',
      'fiscalId': '12345678901',
      'currency': 'EUR',
      'totalCents': 130,
      'cashPaymentCents': 130,
      'electronicPaymentCents': 0,
      'externalId': 'ADE-WEB:document-ade',
      'externalStatus': 'issued',
      'documentNumber': null,
      'documentDate': '2026-08-20T10:00:00Z',
      'errorCode': null,
      'errorMessage': null,
      'maxAttempts': 5,
      'nextAttemptAt': '2026-08-20T10:00:00Z',
      'version': 2,
      'payload': const {},
      'providerResponse': const {},
      'createdAt': '2026-08-20T10:00:00Z',
      'updatedAt': '2026-08-20T10:00:01Z',
      'issuedAt': '2026-08-20T10:00:01Z',
      'voidedAt': null,
      'items': const [],
      'vatSummaries': const [],
      'attempts': const [],
    });

    expect(document.canVoid, isFalse);
    expect(document.canRetry, isFalse);
  });

  test('formats money and masks fiscal id', () {
    final profile = FiscalProfile.fromJson({
      'id': 'profile-1',
      'organizationId': 'org-1',
      'locationId': 'location-1',
      'provider': 'ACUBE_SMART_RECEIPTS',
      'environment': 'SANDBOX',
      'fiscalId': '12345678901',
      'enabled': true,
      'autoIssueOnPaid': false,
      'receiptEmail': null,
      'displayName': 'Demo',
      'version': 1,
      'createdAt': '2026-07-22T10:00:00Z',
      'updatedAt': '2026-07-22T10:00:00Z',
    });
    expect(profile.maskedFiscalId, '123•••••901');
    expect(formatFiscalMoney(1234, 'EUR'), '12,34 EUR');
  });
}
