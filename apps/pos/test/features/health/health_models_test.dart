import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';

// dart format off
void main() {
  test('parses operational health and operator-safe fiscal runtime fields', () {
    final health = OperationalHealth.fromJson({
      'generatedAt': '2026-08-20T10:00:00.000Z',
      'overallStatus': 'OK',
      'api': {'status': 'OK', 'latencyMs': 12},
      'printers': {
        'status': 'OK',
        'items': [
          {'id': 'printer-1'},
        ],
        'lastJob': {'status': 'COMPLETED'},
      },
      'fiscal': {
        'status': 'OK',
        'provider': 'ADE_WEB',
        'environment': 'PRODUCTION',
        'enabled': true,
        'autoIssueOnPaid': true,
        'lastDocumentStatus': 'ISSUED',
        'errorCode': null,
        'errorMessage': null,
      },
      'paymentTerminal': {'status': 'NOT_CONFIGURED'},
      'suggestions': ['Nessuna azione richiesta.'],
    });

    expect(health.printerCount, 1);
    expect(health.fiscalStatus, HealthStatus.ok);
    expect(health.fiscalProvider, 'ADE_WEB');
    expect(health.fiscalEnvironment, 'PRODUCTION');
    expect(health.fiscalEnabled, isTrue);
    expect(health.fiscalAutoIssueOnPaid, isTrue);
    expect(health.fiscalLastDocumentStatus, 'ISSUED');
    final exported =
        jsonDecode(health.exportJson(networkOnline: true))
            as Map<String, Object?>;
    expect((exported['client'] as Map)['networkOnline'], true);
    expect(exported.containsKey('token'), false);
  });
}
// dart format on
