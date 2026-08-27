import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/offline/offline_database.dart';
import 'package:fluxa_pos/core/offline/offline_models.dart';

void main() {
  test('offline database supports an injected executor', () async {
    final database = OfflineDatabase(executor: NativeDatabase.memory());
    addTearDown(database.close);

    final now = DateTime.utc(2026, 8, 27, 20, 0);
    await database.enqueue(
      id: 'offline-test-1',
      kind: OfflineOperationKind.createOrder,
      payloadJson: '{"order":"demo"}',
      now: now,
    );

    final operations = await database.listOperations();

    expect(operations, hasLength(1));
    expect(operations.single.id, 'offline-test-1');
    expect(operations.single.kind, OfflineOperationKind.createOrder);
    expect(operations.single.status, OfflineOperationStatus.queued);
    expect(operations.single.payloadJson, '{"order":"demo"}');
  });
}
