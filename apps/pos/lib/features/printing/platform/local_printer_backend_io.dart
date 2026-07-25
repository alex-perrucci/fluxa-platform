import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

import 'local_printer_backend_contract.dart';

LocalPrinterBackend createPlatformLocalPrinterBackend() =>
    const _AndroidLocalPrinterBackend();

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

    for (final value in results[2]) {
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

    return targets.toList(growable: false)..sort(
      (left, right) => localPrinterTargetLabel(
        left,
      ).compareTo(localPrinterTargetLabel(right)),
    );
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

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError(
        'La stampa locale è disponibile soltanto nell’app Android.',
      );
    }
    if (copies < 1 || copies > 5) {
      throw RangeError.range(copies, 1, 5, 'copies');
    }
    final parts = queueName.split('|');
    final arguments = <String, Object?>{
      'text': text,
      'copies': copies,
      'supportsCut': supportsCut,
      'encoding': 'CP858',
    };
    if (parts.length >= 3 && parts.first == 'bluetooth') {
      arguments['transport'] = 'BLUETOOTH_CLASSIC';
      arguments['address'] = parts[1];
    } else if (parts.length == 3 && parts.first == 'wifi') {
      final port = int.tryParse(parts[2]);
      if (parts[1].trim().isEmpty || port == null || port < 1 || port > 65535) {
        throw const FormatException('Configurazione Wi-Fi non valida.');
      }
      arguments['transport'] = 'WIFI_TCP';
      arguments['host'] = parts[1].trim();
      arguments['port'] = port;
    } else {
      throw const FormatException('Connessione stampante non valida.');
    }
    await _channel.invokeMethod<void>('printText', arguments);
  }
}
