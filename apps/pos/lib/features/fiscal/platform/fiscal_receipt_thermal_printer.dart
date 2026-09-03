import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../../core/network/backend_error.dart';
import '../../printing/domain/printing_models.dart';
import '../../printing/presentation/printing_controller.dart';
import '../domain/fiscal_receipt_layout.dart';
import 'fiscal_receipt_esc_pos_formatter.dart';

class FiscalReceiptThermalPrinter {
  const FiscalReceiptThermalPrinter();

  static const _networkChannel = MethodChannel(
    'it.fluxa.fluxa_pos/fiscal_receipt_printing',
  );
  static const _serialRawChannel = MethodChannel(
    'it.fluxa.fluxa_pos/bluetooth_serial_raw_printing',
  );

  Future<String> print({
    required PrintingController printing,
    required FiscalReceiptLayoutData receipt,
  }) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.windows) {
      throw const BackendError(
        message: 'La stampa fiscale diretta è disponibile sul POS Windows.',
      );
    }

    final candidates = printing.assignedPrinters
        .where(
          (printer) =>
              printer.purpose == PrinterPurpose.receipt &&
              (printing.queueFor(printer.id)?.isNotEmpty ?? false),
        )
        .toList(growable: false);

    if (candidates.isEmpty) {
      throw const BackendError(
        message:
            'Nessuna stampante Ricevute è configurata su questo POS. Configurala in Stampa prima di stampare il documento fiscale.',
      );
    }
    if (candidates.length > 1) {
      throw const BackendError(
        message:
            'Sono configurate più stampanti Ricevute su questo POS. Lasciane una sola per la stampa fiscale diretta.',
      );
    }

    final printer = candidates.single;
    final queueName = printing.queueFor(printer.id)!;
    final payload = buildFiscalReceiptEscPos(
      receipt: receipt,
      paperWidthMm: printer.paperWidthMm,
      charactersPerLine: printer.charactersPerLine,
      supportsCut: printer.supportsCut,
    );

    try {
      await _sendRaw(queueName, payload);
    } catch (_) {
      throw BackendError(
        message:
            'Stampa fiscale non riuscita su ${printer.name}. Controlla connessione, carta e formato 58/80 mm.',
      );
    }

    return printer.name;
  }

  Future<void> _sendRaw(String queueName, Uint8List payload) async {
    final parts = queueName.split('|');
    if (parts.length >= 3 && parts.first == 'bluetooth_serial') {
      final port = parts[1].trim().toUpperCase();
      if (!RegExp(r'^COM\d+$').hasMatch(port)) {
        throw const FormatException('Porta COM Bluetooth non valida.');
      }
      await _serialRawChannel.invokeMethod<void>('printRaw', {
        'port': port,
        'bytes': payload,
        'copies': 1,
      });
      return;
    }

    final arguments = <String, Object?>{'bytes': payload, 'copies': 1};
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

    await _networkChannel.invokeMethod<void>('printRaw', arguments);
  }
}
