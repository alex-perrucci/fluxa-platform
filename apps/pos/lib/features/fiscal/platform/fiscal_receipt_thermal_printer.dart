import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';

import '../../../core/network/backend_error.dart';
import '../../printing/domain/printing_models.dart';
import '../../printing/platform/esc_pos_raster_formatter.dart';
import '../../printing/platform/local_printer_backend_contract.dart';
import '../../printing/presentation/printing_controller.dart';

class FiscalReceiptThermalPrinter {
  const FiscalReceiptThermalPrinter();

  static const _channel = MethodChannel(
    'it.fluxa.fluxa_pos/fiscal_receipt_printing',
  );
  static const _rasterDpi = 203.0;
  static const _maxPages = 8;

  Future<String> print({
    required PrintingController printing,
    required Uint8List pdfBytes,
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
            'Nessuna stampante Ricevute è configurata su questo POS. Configurala in Stampa prima di stampare lo scontrino fiscale.',
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
    final pages = <EscPosRasterPage>[];

    try {
      await for (final page in Printing.raster(pdfBytes, dpi: _rasterDpi)) {
        if (pages.length >= _maxPages) {
          throw const BackendError(
            message: 'Il PDF fiscale contiene troppe pagine per la termica.',
          );
        }
        pages.add(
          EscPosRasterPage(
            width: page.width,
            height: page.height,
            rgba: page.pixels,
          ),
        );
      }
    } on BackendError {
      rethrow;
    } catch (_) {
      throw const BackendError(
        message: 'Impossibile convertire il PDF fiscale per la stampante.',
      );
    }

    final payload = buildEscPosRasterDocument(
      pages: pages,
      paperWidthMm: printer.paperWidthMm,
      supportsCut: printer.supportsCut,
    );

    try {
      await _sendRaw(queueName, payload);
    } catch (_) {
      throw BackendError(
        message:
            'Stampa fiscale non riuscita su ${printer.name}. Controlla connessione e carta.',
      );
    }

    return printer.name;
  }

  Future<void> _sendRaw(String queueName, Uint8List payload) async {
    final parts = queueName.split('|');
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

    await _channel.invokeMethod<void>('printRaw', arguments);
  }
}
