import '../../../core/storage/secure_store.dart';

class LocalPrinterMappingStore {
  LocalPrinterMappingStore(this._storage);

  static const _agentEnabledKey = 'fluxa.print.agent.enabled';
  static const _queuePrefix = 'fluxa.print.queue.';

  final SecureKeyValueStore _storage;

  Future<bool> readAgentEnabled() async =>
      await _storage.read(_agentEnabledKey) == 'true';

  Future<void> saveAgentEnabled(bool value) =>
      _storage.write(_agentEnabledKey, value.toString());

  Future<String?> readQueue(String printerId) async {
    final value = await _storage.read('$_queuePrefix$printerId');
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  Future<void> saveQueue(String printerId, String? queueName) async {
    final normalized = queueName?.trim();
    final key = '$_queuePrefix$printerId';
    if (normalized == null || normalized.isEmpty) {
      await _storage.delete(key);
      return;
    }
    await _storage.write(key, normalized);
  }
}
