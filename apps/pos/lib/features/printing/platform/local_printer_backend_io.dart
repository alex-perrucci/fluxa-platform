// dart format off
import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

import 'local_printer_backend_contract.dart';

LocalPrinterBackend createPlatformLocalPrinterBackend() {
  if (Platform.isAndroid) {
    return const _AndroidLocalPrinterBackend();
  }
  if (Platform.isWindows) {
    return const _WindowsLocalPrinterBackend();
  }
  return const _UnsupportedLocalPrinterBackend();
}

class _AndroidLocalPrinterBackend implements LocalPrinterBackend {
  const _AndroidLocalPrinterBackend();

  static const _channel = MethodChannel('it.fluxa.fluxa_pos/printing');
  static const _pairedTimeout = Duration(seconds: 4);
  static const _bluetoothDiscoveryTimeout = Duration(seconds: 16);
  static const _wifiDiscoveryTimeout = Duration(seconds: 12);

  @override
  bool get isSupported => Platform.isAndroid;

  @override
  Future<List<String>> listQueues() async {
    if (!Platform.isAndroid) {
      return const [];
    }

    final bluetoothPermitted = await _ensureBluetoothPermissionSafely();

    final pairedFuture = bluetoothPermitted
        ? _invokeListSafely(
            'listPairedBluetoothPrinters',
            timeout: _pairedTimeout,
          )
        : Future.value(const <Object?>[]);

    final nearbyFuture = bluetoothPermitted
        ? _invokeListSafely(
            'discoverBluetoothPrinters',
            timeout: _bluetoothDiscoveryTimeout,
          )
        : Future.value(const <Object?>[]);

    final wifiFuture = _invokeListSafely(
      'discoverWifiPrinters',
      timeout: _wifiDiscoveryTimeout,
    );

    final results = await Future.wait<List<Object?>>([
      pairedFuture,
      nearbyFuture,
      wifiFuture,
    ]);

    final bluetoothByAddress = <String, String>{};
    _mergeBluetoothResults(bluetoothByAddress, results[1]);
    // I dispositivi associati sono la fonte più affidabile per nome e
    // compatibilità SPP. Vengono applicati per ultimi per avere precedenza.
    _mergeBluetoothResults(bluetoothByAddress, results[0]);

    final targets = <String>{
      for (final entry in bluetoothByAddress.entries)
        buildBluetoothPrinterTarget(address: entry.key, name: entry.value),
    };

    _mergeWifiResults(targets, results[2]);
    return _sortedTargets(targets);
  }

  Future<bool> _ensureBluetoothPermissionSafely() async {
    try {
      return await _channel
              .invokeMethod<bool>('ensureBluetoothPermission')
              .timeout(const Duration(seconds: 15)) ??
          false;
    } on Object {
      // La ricerca Wi-Fi deve continuare anche se Bluetooth non è disponibile,
      // disattivato o se il permesso viene negato.
      return false;
    }
  }

  Future<List<Object?>> _invokeListSafely(
    String method, {
    required Duration timeout,
  }) async {
    try {
      return await _channel
              .invokeListMethod<Object?>(method)
              .timeout(timeout) ??
          const <Object?>[];
    } on Object {
      // Ogni trasporto è indipendente: un errore o timeout non deve eliminare
      // i risultati già disponibili dagli altri metodi di rilevamento.
      return const <Object?>[];
    }
  }

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) => _printViaChannel(
    channel: _channel,
    queueName: queueName,
    text: text,
    copies: copies,
    supportsCut: supportsCut,
  );
}

class _WindowsLocalPrinterBackend implements LocalPrinterBackend {
  const _WindowsLocalPrinterBackend();

  static const _channel = MethodChannel('it.fluxa.fluxa_pos/printing');
  static const _bluetoothSerialChannel = MethodChannel(
    'it.fluxa.fluxa_pos/bluetooth_serial_printing',
  );
  static const _pairedTimeout = Duration(seconds: 4);
  static const _serialDiscoveryTimeout = Duration(seconds: 4);
  static const _wifiConnectTimeout = Duration(milliseconds: 180);
  static const _wifiPort = 9100;
  static const _scanBatchSize = 32;

  @override
  bool get isSupported => Platform.isWindows;

  @override
  Future<List<String>> listQueues() async {
    if (!Platform.isWindows) {
      return const [];
    }

    final pairedFuture = _listPairedBluetoothPrinters();
    final serialFuture = _listBluetoothSerialPrinters();
    final wifiFuture = _discoverWifiPrinters();
    final results = await Future.wait<Object?>([
      pairedFuture,
      serialFuture,
      wifiFuture,
    ]);

    final bluetoothByAddress = <String, String>{};
    _mergeBluetoothResults(
      bluetoothByAddress,
      results[0] as List<Object?>,
    );

    final serialByPort = <String, String>{};
    _mergeBluetoothSerialResults(
      serialByPort,
      results[1] as List<Object?>,
    );

    final targets = <String>{
      // Su Windows le porte COM Bluetooth sono preferibili al socket RFCOMM
      // diretto: sono il percorso esposto dal driver SPP di Windows e rendono
      // visibile all'operatore quale porta (es. COM6) verrà realmente usata.
      for (final entry in serialByPort.entries)
        buildBluetoothSerialPrinterTarget(port: entry.key, name: entry.value),
      // Manteniamo il trasporto Bluetooth diretto esistente come fallback per
      // dispositivi che non espongono una porta seriale virtuale.
      for (final entry in bluetoothByAddress.entries)
        buildBluetoothPrinterTarget(address: entry.key, name: entry.value),
      ...results[2] as List<String>,
    };
    return _sortedTargets(targets);
  }

  Future<List<Object?>> _listPairedBluetoothPrinters() async {
    try {
      return await _channel
              .invokeListMethod<Object?>('listPairedBluetoothPrinters')
              .timeout(_pairedTimeout) ??
          const <Object?>[];
    } on Object {
      // Il Wi-Fi e le porte COM devono restare disponibili anche sui PC senza
      // un canale Bluetooth RFCOMM utilizzabile direttamente.
      return const <Object?>[];
    }
  }

  Future<List<Object?>> _listBluetoothSerialPrinters() async {
    try {
      return await _bluetoothSerialChannel
              .invokeListMethod<Object?>('listBluetoothSerialPrinters')
              .timeout(_serialDiscoveryTimeout) ??
          const <Object?>[];
    } on Object {
      // Il vecchio Bluetooth diretto e il Wi-Fi restano fallback indipendenti.
      return const <Object?>[];
    }
  }

  Future<List<String>> _discoverWifiPrinters() async {
    List<NetworkInterface> interfaces;
    try {
      interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
        includeLinkLocal: false,
      );
    } on Object {
      return const [];
    }

    final addresses = <String>[
      for (final interface in interfaces)
        for (final address in interface.addresses)
          if (address.type == InternetAddressType.IPv4) address.address,
    ];
    if (addresses.isEmpty) {
      return const [];
    }

    final localAddress = addresses.firstWhere(
      _isPrivateIpv4,
      orElse: () => addresses.first,
    );
    final octets = localAddress.split('.');
    if (octets.length != 4 || octets.any((value) => int.tryParse(value) == null)) {
      return const [];
    }

    final prefix = '${octets[0]}.${octets[1]}.${octets[2]}';
    final localHosts = addresses.toSet();
    final found = <String>{};

    for (var start = 1; start <= 254; start += _scanBatchSize) {
      final candidateEnd = start + _scanBatchSize - 1;
      final end = candidateEnd > 254 ? 254 : candidateEnd;
      final batch = await Future.wait<String?>([
        for (var lastOctet = start; lastOctet <= end; lastOctet += 1)
          _probeRawPrinter('$prefix.$lastOctet', localHosts),
      ]);
      found.addAll(batch.whereType<String>());
    }

    return found.toList(growable: false)..sort();
  }

  Future<String?> _probeRawPrinter(
    String host,
    Set<String> localHosts,
  ) async {
    if (localHosts.contains(host)) {
      return null;
    }
    Socket? socket;
    try {
      socket = await Socket.connect(
        host,
        _wifiPort,
        timeout: _wifiConnectTimeout,
      );
      return buildWifiPrinterTarget(host: host, port: _wifiPort);
    } on Object {
      return null;
    } finally {
      socket?.destroy();
    }
  }

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) => _printViaChannel(
    channel: _channel,
    bluetoothSerialChannel: _bluetoothSerialChannel,
    queueName: queueName,
    text: text,
    copies: copies,
    supportsCut: supportsCut,
  );
}

class _UnsupportedLocalPrinterBackend implements LocalPrinterBackend {
  const _UnsupportedLocalPrinterBackend();

  @override
  bool get isSupported => false;

  @override
  Future<List<String>> listQueues() async => const [];

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) {
    throw UnsupportedError(
      'La stampa locale è disponibile soltanto su Android e Windows.',
    );
  }
}

Future<void> _printViaChannel({
  required MethodChannel channel,
  MethodChannel? bluetoothSerialChannel,
  required String queueName,
  required String text,
  required int copies,
  required bool supportsCut,
}) async {
  if (copies < 1 || copies > 5) {
    throw RangeError.range(copies, 1, 5, 'copies');
  }

  final parts = queueName.split('|');
  final commonArguments = <String, Object?>{
    'text': text,
    'copies': copies,
    'supportsCut': supportsCut,
    'encoding': 'CP858',
  };

  if (parts.length >= 3 && parts.first == 'bluetooth_serial') {
    final port = parts[1].trim().toUpperCase();
    if (!RegExp(r'^COM[1-9][0-9]*$').hasMatch(port)) {
      throw const FormatException('Porta seriale Bluetooth non valida.');
    }
    if (bluetoothSerialChannel == null) {
      throw UnsupportedError(
        'La stampa Bluetooth seriale è disponibile soltanto su Windows.',
      );
    }
    await bluetoothSerialChannel.invokeMethod<void>('printText', {
      ...commonArguments,
      'port': port,
    });
    return;
  }

  final arguments = <String, Object?>{...commonArguments};
  if (parts.length >= 3 && parts.first == 'bluetooth') {
    final address = parts[1].trim();
    if (address.isEmpty) {
      throw const FormatException('Indirizzo Bluetooth non valido.');
    }
    arguments['transport'] = 'BLUETOOTH_CLASSIC';
    arguments['address'] = address;
  } else if (parts.length == 3 && parts.first == 'wifi') {
    final host = parts[1].trim();
    final port = int.tryParse(parts[2]);
    if (host.isEmpty || port == null || port < 1 || port > 65535) {
      throw const FormatException('Configurazione Wi-Fi non valida.');
    }
    arguments['transport'] = 'WIFI_TCP';
    arguments['host'] = host;
    arguments['port'] = port;
  } else {
    throw const FormatException('Connessione stampante non valida.');
  }
  await channel.invokeMethod<void>('printText', arguments);
}

void _mergeBluetoothResults(
  Map<String, String> devicesByAddress,
  List<Object?> values,
) {
  for (final value in values) {
    if (value is! Map) {
      continue;
    }
    final address = value['address']?.toString().trim() ?? '';
    final name = value['name']?.toString().trim() ?? '';
    if (address.isEmpty) {
      continue;
    }
    devicesByAddress[address.toUpperCase()] = name.isEmpty ? address : name;
  }
}

void _mergeBluetoothSerialResults(
  Map<String, String> devicesByPort,
  List<Object?> values,
) {
  for (final value in values) {
    if (value is! Map) {
      continue;
    }
    final port = value['port']?.toString().trim().toUpperCase() ?? '';
    final name = value['name']?.toString().trim() ?? '';
    if (!RegExp(r'^COM[1-9][0-9]*$').hasMatch(port)) {
      continue;
    }
    devicesByPort[port] = name.isEmpty ? 'Stampante Bluetooth' : name;
  }
}

void _mergeWifiResults(Set<String> targets, List<Object?> values) {
  for (final value in values) {
    if (value is! Map) {
      continue;
    }
    final host = value['host']?.toString().trim() ?? '';
    final port = int.tryParse(value['port']?.toString() ?? '');
    if (host.isEmpty || port == null || port < 1 || port > 65535) {
      continue;
    }
    targets.add(buildWifiPrinterTarget(host: host, port: port));
  }
}

List<String> _sortedTargets(Set<String> targets) =>
    targets.toList(growable: false)..sort(
      (left, right) => localPrinterTargetLabel(
        left,
      ).compareTo(localPrinterTargetLabel(right)),
    );

bool _isPrivateIpv4(String address) {
  final octets = address.split('.').map(int.tryParse).toList(growable: false);
  if (octets.length != 4 || octets.any((value) => value == null)) {
    return false;
  }
  final first = octets[0]!;
  final second = octets[1]!;
  return first == 10 ||
      (first == 172 && second >= 16 && second <= 31) ||
      (first == 192 && second == 168);
}
// dart format on
