import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';

void main() {
  test('parses operational health and exports only returned safe fields', () {
    final health = OperationalHealth.fromJson({
      'generatedAt': '2026-08-05T10:00:00.000Z',
      'overallStatus': 'DEGRADED',
      'api': {'status': 'OK', 'latencyMs': 12},
      'printers': {
        'status': 'OK',
        'items': [
          {'id': 'printer-1'},
        ],
        'lastJob': {'status': 'COMPLETED'},
      },
      'fiscal': {
        'status': 'DEGRADED',
        'provider': 'ACUBE_SMART_RECEIPTS',
      },
      'paymentTerminal': {'status': 'NOT_CONFIGURED'},
      'suggestions': ['Controlla il documento fiscale.'],
    });

    expect(health.printerCount, 1);
    expect(health.fiscalStatus, HealthStatus.degraded);
    final exported =
        jsonDecode(health.exportJson(networkOnline: true))
            as Map<String, Object?>;
    expect((exported['client'] as Map)['networkOnline'], true);
    expect(exported.containsKey('token'), false);
  });
}
