abstract interface class LocalPrinterBackend {
  bool get isSupported;

  Future<List<String>> listQueues();

  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  });
}

bool isBluetoothPrinterTarget(String? value) =>
    value != null &&
    (value.startsWith('bluetooth|') || value.startsWith('bluetooth_serial|'));

bool isBluetoothSerialPrinterTarget(String? value) =>
    value != null && value.startsWith('bluetooth_serial|');

bool isWifiPrinterTarget(String? value) =>
    value != null && value.startsWith('wifi|');

String buildBluetoothPrinterTarget({
  required String address,
  required String name,
}) => 'bluetooth|${address.trim()}|${name.trim()}';

String buildBluetoothSerialPrinterTarget({
  required String port,
  required String name,
}) => 'bluetooth_serial|${port.trim().toUpperCase()}|${name.trim()}';

String buildWifiPrinterTarget({required String host, required int port}) =>
    'wifi|${host.trim()}|$port';

String localPrinterTargetLabel(String? value) {
  if (value == null || value.trim().isEmpty) {
    return 'Non configurata';
  }
  final parts = value.split('|');
  if (parts.length >= 3 && parts.first == 'bluetooth_serial') {
    final port = parts[1].trim().toUpperCase();
    final name = _compactBluetoothSerialName(parts.sublist(2).join('|'), port);
    return name == null ? 'Bluetooth · $port' : '$name · $port';
  }
  if (parts.length >= 3 && parts.first == 'bluetooth') {
    final name = parts.sublist(2).join('|').trim();
    return name.isEmpty ? 'Bluetooth ${parts[1]}' : '$name · Bluetooth';
  }
  if (parts.length == 3 && parts.first == 'wifi') {
    return '${parts[1]}:${parts[2]} · Wi-Fi';
  }
  return 'Configurazione non valida';
}

String? _compactBluetoothSerialName(String rawName, String port) {
  var name = rawName.trim();
  if (name.isEmpty) return null;
  name = name.replaceAll(
    RegExp('\\s*\\(${RegExp.escape(port)}\\)\\s*\$', caseSensitive: false),
    '',
  );
  final lower = name.toLowerCase();
  const genericNames = [
    'collegamento standard seriale su bluetooth',
    'standard serial over bluetooth link',
    'bluetooth serial port',
    'serial over bluetooth',
  ];
  if (genericNames.any(lower.contains)) return null;
  if (name.length > 28) {
    return '${name.substring(0, 25).trimRight()}…';
  }
  return name;
}
