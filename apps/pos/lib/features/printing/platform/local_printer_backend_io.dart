import 'dart:io';

import 'package:flutter/services.dart';

import 'local_printer_backend_contract.dart';

LocalPrinterBackend createPlatformLocalPrinterBackend() =>
    const _AndroidLocalPrinterBackend();

class _AndroidLocalPrinterBackend implements LocalPrinterBackend {
  const _AndroidLocalPrinterBackend();

  static const _channel = MethodChannel('it.fluxa.fluxa_pos/printing');

  @override
  bool get isSupported => Platform.isAndroid;

  @override
  Future<List<String>> listQueues() async {
    if (!Platform.isAndroid) {
      return const [];
    }
    final permitted =
        await _channel.invokeMethod<bool>('ensureBluetoothPermission') ?? false;
    if (!permitted) {
      return const [];
    }
    final raw =
        await _channel.invokeListMethod<Object?>(
          'listPairedBluetoothPrinters',
        ) ??
        const [];
    final targets = <String>{};
    for (final value in raw) {
      if (value is! Map) {
        continue;
      }
      final address = value['address']?.toString().trim() ?? '';
      final name = value['name']?.toString().trim() ?? '';
      if (address.isEmpty) {
        continue;
      }
      targets.add(
        buildBluetoothPrinterTarget(
          address: address,
          name: name.isEmpty ? address : name,
        ),
      );
    }
    return targets.toList(growable: false)..sort(
      (left, right) => localPrinterTargetLabel(
        left,
      ).compareTo(localPrinterTargetLabel(right)),
    );
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
