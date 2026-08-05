import 'dart:async';

import 'package:flutter/foundation.dart';

import 'offline_database.dart';
import 'offline_models.dart';

typedef OfflineReplay = Future<void> Function(OfflineOperation operation);

class OfflineSyncController extends ChangeNotifier {
  OfflineSyncController(this._database, this._replay);

  final OfflineDatabase _database;
  final OfflineReplay _replay;
  List<OfflineOperation> _operations = const [];
  bool _syncing = false;
  Timer? _timer;

  List<OfflineOperation> get operations => _operations;
  bool get syncing => _syncing;
  int get pendingCount => _operations
      .where(
        (operation) => operation.status != OfflineOperationStatus.synced,
      )
      .length;

  Future<void> start() async {
    await refresh();
    _timer ??= Timer.periodic(const Duration(seconds: 15), (_) => syncDue());
    await syncDue();
  }

  Future<void> refresh() async {
    _operations = await _database.listOperations();
    notifyListeners();
  }

  Future<void> syncDue() async {
    if (_syncing) return;
    _syncing = true;
    notifyListeners();
    try {
      final due = await _database.dueOperations();
      for (final operation in due) {
        await _database.markSyncing(operation.id);
        try {
          await _replay(operation);
          await _database.markSynced(operation.id);
        } on OfflineConflictException catch (error) {
          await _database.markConflict(operation.id, error.message);
        } catch (error) {
          await _database.markFailed(
            operation.id,
            operation.attempts + 1,
            error.toString(),
          );
        }
      }
    } finally {
      _syncing = false;
      await refresh();
    }
  }

  Future<void> retry(String id) async {
    await _database.retryNow(id);
    await syncDue();
  }

  Future<void> clearSynced() async {
    await _database.removeSynced();
    await refresh();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _database.close();
    super.dispose();
  }
}

class OfflineConflictException implements Exception {
  const OfflineConflictException(this.message);

  final String message;

  @override
  String toString() => message;
}
