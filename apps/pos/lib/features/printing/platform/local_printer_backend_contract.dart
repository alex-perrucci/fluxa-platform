import 'dart:typed_data';

abstract interface class LocalPrinterBackend {
  bool get isSupported;

  Future<List<String>> listQueues();

  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  });

  Future<void> printRaw({
    required String queueName,
    required Uint8List bytes,
    required int copies,
  });
}

bool isBluetoothPrinterTarget(String? value) =>
    value != null && value.startsWith('bluetooth|');

bool isWifiPrinterTarget(String? value) =>
    value != null && value.startsWith('wifi|');

String buildBluetoothPrinterTarget({
  required String address,
  required String name,
}) => 'bluetooth|${address.trim()}|${name.trim()}';

String buildWifiPrinterTarget({required String host, required int port}) =>
    'wifi|${host.trim()}|$port';

String localPrinterTargetLabel(String? value) {
  if (value == null || value.trim().isEmpty) {
    return 'Non configurata';
  }
  final parts = value.split('|');
  if (parts.length >= 3 && parts.first == 'bluetooth') {
    final name = parts.sublist(2).join('|').trim();
    return name.isEmpty ? 'Bluetooth ${parts[1]}' : '$name · Bluetooth';
  }
  if (parts.length == 3 && parts.first == 'wifi') {
    return '${parts[1]}:${parts[2]} · Wi-Fi';
  }
  return 'Configurazione non valida';
}
