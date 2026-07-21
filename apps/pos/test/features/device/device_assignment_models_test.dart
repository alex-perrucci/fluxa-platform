import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';

void main() {
  Map<String, Object?> payload(String status) => {
    'operationalStatus': status,
    'device': {
      'id': '33333333-3333-4333-8333-333333333333',
      'installationId': 'pos-parma-01',
      'name': 'Cassa Parma 1',
      'platform': 'WINDOWS',
      'model': 'Surface Pro',
      'appVersion': '1.0.0',
      'status': 'ACTIVE',
      'lastSeenAt': '2026-07-21T10:00:00.000Z',
    },
    'assignment': {
      'id': '44444444-4444-4444-8444-444444444444',
      'organizationId': '11111111-1111-4111-8111-111111111111',
      'locationId': status == 'LOCATION_REQUIRED'
          ? null
          : '55555555-5555-4555-8555-555555555555',
      'active': status != 'ASSIGNMENT_REVOKED',
      'assignedAt': '2026-07-20T10:00:00.000Z',
      'revokedAt': status == 'ASSIGNMENT_REVOKED'
          ? '2026-07-21T09:00:00.000Z'
          : null,
      'updatedAt': '2026-07-21T09:00:00.000Z',
    },
    'location': status == 'LOCATION_REQUIRED'
        ? null
        : {
            'id': '55555555-5555-4555-8555-555555555555',
            'code': 'PARMA',
            'name': 'Parma Centro',
            'timezone': 'Europe/Rome',
            'status': status == 'LOCATION_INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          },
  };

  test('parses every backend operational status', () {
    const expected = {
      'READY': DeviceOperationalStatus.ready,
      'LOCATION_REQUIRED': DeviceOperationalStatus.locationRequired,
      'ASSIGNMENT_REVOKED': DeviceOperationalStatus.assignmentRevoked,
      'LOCATION_INACTIVE': DeviceOperationalStatus.locationInactive,
    };

    for (final entry in expected.entries) {
      final context = CurrentDeviceAssignmentContext.fromJson(
        payload(entry.key),
      );
      expect(context.operationalStatus, entry.value);
    }
  });

  test('READY is valid only with matching active location', () {
    final context = CurrentDeviceAssignmentContext.fromJson(payload('READY'));
    expect(context.isReady, isTrue);
  });

  test('LOCATION_REQUIRED never exposes a ready location', () {
    final context = CurrentDeviceAssignmentContext.fromJson(
      payload('LOCATION_REQUIRED'),
    );
    expect(context.assignment.locationId, isNull);
    expect(context.location, isNull);
    expect(context.isReady, isFalse);
  });
}
