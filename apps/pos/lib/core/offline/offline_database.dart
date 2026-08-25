import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'offline_models.dart';
import 'offline_policy.dart';

part 'offline_database.g.dart';

@DriftDatabase(tables: [])
class OfflineDatabase extends _$OfflineDatabase {
  OfflineDatabase() : super(driftDatabase(name: 'fluxa_pos_offline'));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (migrator) async {
      await customStatement('''
        CREATE TABLE offline_outbox (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      ''');
      await customStatement('''
        CREATE INDEX offline_outbox_status_retry_idx
        ON offline_outbox(status, next_attempt_at, created_at)
      ''');
      await customStatement('''
        CREATE TABLE offline_cache (
          cache_key TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      ''');
    },
  );

  Future<void> enqueue({
    required String id,
    required OfflineOperationKind kind,
    required String payloadJson,
    DateTime? now,
  }) async {
    if (!OfflineSafetyPolicy.isQueueable(kind)) {
      throw StateError('${kind.name} richiede una connessione online.');
    }
    final timestamp = now ?? DateTime.now().toUtc();
    await transaction(() async {
      final existing = await customSelect(
        'SELECT kind, payload_json FROM offline_outbox WHERE id=?',
        variables: [Variable.withString(id)],
      ).getSingleOrNull();
      if (existing != null) {
        final existingKind = existing.read<String>('kind');
        final existingPayload = existing.read<String>('payload_json');
        if (existingKind == kind.name && existingPayload == payloadJson) {
          return;
        }
        throw StateError(
          'Identificativo operazione offline già usato con dati differenti.',
        );
      }
      await customStatement(
        '''INSERT INTO offline_outbox
           (id,kind,status,payload_json,attempts,next_attempt_at,created_at,updated_at)
           VALUES (?,?,?,?,0,?,?,?)''',
        [
          id,
          kind.name,
          OfflineOperationStatus.queued.name,
          payloadJson,
          timestamp.millisecondsSinceEpoch,
          timestamp.millisecondsSinceEpoch,
          timestamp.millisecondsSinceEpoch,
        ],
      );
    });
  }

  Future<List<OfflineOperation>> listOperations() async {
    final rows = await customSelect(
      'SELECT * FROM offline_outbox ORDER BY created_at DESC',
    ).get();
    return rows.map(_mapOperation).toList(growable: false);
  }

  Future<List<OfflineOperation>> dueOperations({DateTime? now}) async {
    final timestamp = (now ?? DateTime.now().toUtc()).millisecondsSinceEpoch;
    final rows = await customSelect(
      '''SELECT * FROM offline_outbox
         WHERE status IN (?,?) AND next_attempt_at <= ?
         ORDER BY created_at''',
      variables: [
        Variable.withString(OfflineOperationStatus.queued.name),
        Variable.withString(OfflineOperationStatus.failed.name),
        Variable.withInt(timestamp),
      ],
    ).get();
    return rows.map(_mapOperation).toList(growable: false);
  }

  Future<void> markSyncing(String id) =>
      _setStatus(id, OfflineOperationStatus.syncing, clearError: true);

  Future<void> markSynced(String id) =>
      _setStatus(id, OfflineOperationStatus.synced, clearError: true);

  Future<void> markConflict(String id, String message) =>
      _setStatus(id, OfflineOperationStatus.conflict, error: message);

  Future<void> markFailed(
    String id,
    int attempts,
    String message, {
    DateTime? now,
  }) async {
    final timestamp = now ?? DateTime.now().toUtc();
    final next = timestamp.add(OfflineSafetyPolicy.retryDelay(attempts));
    await customStatement(
      '''UPDATE offline_outbox
         SET status=?, attempts=?, next_attempt_at=?, last_error=?, updated_at=?
         WHERE id=?''',
      [
        OfflineOperationStatus.failed.name,
        attempts,
        next.millisecondsSinceEpoch,
        message,
        timestamp.millisecondsSinceEpoch,
        id,
      ],
    );
  }

  Future<void> retryNow(String id) async {
    final timestamp = DateTime.now().toUtc().millisecondsSinceEpoch;
    await customStatement(
      '''UPDATE offline_outbox
         SET status=?, next_attempt_at=?, last_error=NULL, updated_at=?
         WHERE id=? AND status IN (?,?)''',
      [
        OfflineOperationStatus.queued.name,
        timestamp,
        timestamp,
        id,
        OfflineOperationStatus.failed.name,
        OfflineOperationStatus.conflict.name,
      ],
    );
  }

  Future<void> removeSynced() => customStatement(
    'DELETE FROM offline_outbox WHERE status=?',
    [OfflineOperationStatus.synced.name],
  );

  Future<void> putCache(String key, String payloadJson) async {
    await customStatement(
      '''INSERT INTO offline_cache(cache_key,payload_json,updated_at)
         VALUES(?,?,?)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload_json=excluded.payload_json,
           updated_at=excluded.updated_at''',
      [key, payloadJson, DateTime.now().toUtc().millisecondsSinceEpoch],
    );
  }

  Future<String?> readCache(String key) async {
    final row = await customSelect(
      'SELECT payload_json FROM offline_cache WHERE cache_key=?',
      variables: [Variable.withString(key)],
    ).getSingleOrNull();
    return row?.read<String>('payload_json');
  }

  Future<void> deleteCache(String key) =>
      customStatement('DELETE FROM offline_cache WHERE cache_key=?', [key]);

  Future<void> _setStatus(
    String id,
    OfflineOperationStatus status, {
    String? error,
    bool clearError = false,
  }) async {
    await customStatement(
      '''UPDATE offline_outbox
         SET status=?, last_error=?, updated_at=? WHERE id=?''',
      [
        status.name,
        clearError ? null : error,
        DateTime.now().toUtc().millisecondsSinceEpoch,
        id,
      ],
    );
  }

  OfflineOperation _mapOperation(QueryRow row) => OfflineOperation(
    id: row.read<String>('id'),
    kind: OfflineOperationKind.values.byName(row.read<String>('kind')),
    status: OfflineOperationStatus.values.byName(row.read<String>('status')),
    payloadJson: row.read<String>('payload_json'),
    attempts: row.read<int>('attempts'),
    nextAttemptAt: DateTime.fromMillisecondsSinceEpoch(
      row.read<int>('next_attempt_at'),
      isUtc: true,
    ),
    lastError: row.readNullable<String>('last_error'),
    createdAt: DateTime.fromMillisecondsSinceEpoch(
      row.read<int>('created_at'),
      isUtc: true,
    ),
    updatedAt: DateTime.fromMillisecondsSinceEpoch(
      row.read<int>('updated_at'),
      isUtc: true,
    ),
  );
}
