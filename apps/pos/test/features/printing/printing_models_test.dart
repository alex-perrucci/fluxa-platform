import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/printing/domain/printing_models.dart';

void main() {
  test('parses printer and print job contracts', () {
    final printer = PrinterDevice.fromJson(_printerJson());
    final job = PrintJob.fromJson(_jobJson(includeAttempts: true));

    expect(printer.purpose, PrinterPurpose.receipt);
    expect(printer.isAssignedTo('device-1'), isTrue);
    expect(job.documentType, PrintDocumentType.orderReceipt);
    expect(job.status, PrintJobStatus.failed);
    expect(job.attemptHistory.single.outcome, PrintAttemptOutcome.failed);
    expect(job.status.canRetry, isTrue);
  });

  test('parses paginated lists and print request result', () {
    final printers = PrinterListPage.fromJson({
      'page': 1,
      'pageSize': 25,
      'total': 1,
      'items': [_printerJson()],
    });
    final jobs = PrintJobPage.fromJson({
      'page': 1,
      'pageSize': 25,
      'total': 1,
      'items': [_jobJson()],
    });
    final request = PrintRequestResult.fromJson({
      'jobs': [
        {
          'id': 'job-1',
          'status': 'QUEUED',
          'printerId': 'printer-1',
          'documentType': 'ORDER_RECEIPT',
        },
      ],
    });

    expect(printers.items.single.name, 'Cassa Parma');
    expect(jobs.items.single.copies, 1);
    expect(request.jobs.single.status, PrintJobStatus.queued);
  });
}

Map<String, Object?> _printerJson() => {
  'id': 'printer-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'code': 'CASSA',
  'name': 'Cassa Parma',
  'purpose': 'RECEIPT',
  'agentDeviceId': 'device-1',
  'driver': 'ESC_POS_TEXT',
  'paperWidthMm': 80,
  'charactersPerLine': 48,
  'supportsCut': true,
  'supportsDrawer': false,
  'status': 'ACTIVE',
  'lastSeenAt': '2026-07-21T10:00:00.000Z',
  'agentVersion': 'fluxa-pos-android/1.0',
  'statusMessage': 'ONLINE',
  'createdAt': '2026-07-20T10:00:00.000Z',
  'updatedAt': '2026-07-21T10:00:00.000Z',
};

Map<String, Object?> _jobJson({bool includeAttempts = false}) => {
  'id': 'job-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'printerId': 'printer-1',
  'documentType': 'ORDER_RECEIPT',
  'sourceEntityType': 'order',
  'sourceEntityId': 'order-1',
  'dedupeKey': 'ORDER_RECEIPT:order-1:request-1',
  'payload': <String, Object?>{},
  'renderedText': 'FLUXA\nORDINE 0001',
  'templateVersion': 1,
  'copies': 1,
  'status': 'FAILED',
  'priority': 0,
  if (!includeAttempts) 'attempts': 1,
  'maxAttempts': 5,
  'nextAttemptAt': '2026-07-21T10:00:00.000Z',
  'claimedByDeviceId': null,
  'leaseToken': null,
  'leaseExpiresAt': null,
  'lastError': 'Carta esaurita',
  'version': 2,
  'completedAt': null,
  'cancelledAt': null,
  'cancelReason': null,
  'createdAt': '2026-07-21T09:00:00.000Z',
  'updatedAt': '2026-07-21T10:00:00.000Z',
  if (includeAttempts)
    'attempts': [
      {
        'id': 'attempt-1',
        'attemptNo': 1,
        'leaseToken': '11111111-1111-4111-8111-111111111111',
        'outcome': 'FAILED',
        'error': 'Carta esaurita',
        'startedAt': '2026-07-21T09:00:00.000Z',
        'finishedAt': '2026-07-21T09:00:10.000Z',
      },
    ],
};
