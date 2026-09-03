import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';

import '../../../core/network/backend_error.dart';
import '../../printing/domain/printing_models.dart';
import '../../printing/platform/esc_pos_raster_formatter.dart';
import '../../printing/presentation/printing_controller.dart';
import '../domain/fiscal_models.dart';
import 'fiscal_receipt_esc_pos_formatter.dart';

class FiscalReceiptThermalPrinter {
  const FiscalReceiptThermalPrinter();

  static const _channel = MethodChannel(
    'it.fluxa.fluxa_pos/fiscal_receipt_printing',
  );
  static const _serialRawChannel = MethodChannel(
    'it.fluxa.fluxa_pos/bluetooth_serial_raw_printing',
  );
  static const _rasterDpi = 203.0;
  static const _maxPages = 8;

  Future<String> print({
    required PrintingController printing,
    required Uint8List pdfBytes,
  }) async {
    _ensureWindows();
    final printer = _receiptPrinter(printing);
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
    await _printPayload(printer, queueName, payload);
    return printer.name;
  }

  Future<String> printDocument({
    required PrintingController printing,
    required FiscalDocument document,
    required FiscalReceiptHeader header,
  }) async {
    _ensureWindows();
    if (document.status != FiscalDocumentStatus.issued &&
        document.status != FiscalDocumentStatus.voided) {
      throw const BackendError(
        message: 'Il documento fiscale non è ancora emesso.',
      );
    }
    if (document.items.isEmpty && document.type == FiscalDocumentType.sale) {
      throw const BackendError(
        message: 'Il documento fiscale non contiene le righe da stampare.',
      );
    }

    final printer = _receiptPrinter(printing);
    final queueName = printing.queueFor(printer.id)!;
    final charactersPerLine = printer.paperWidthMm <= 58 ? 32 : 48;
    final payload = buildFiscalReceiptEscPos(
      document: document,
      header: header,
      charactersPerLine: charactersPerLine,
      supportsCut: printer.supportsCut,
    );
    await _printPayload(printer, queueName, payload);
    return printer.name;
  }

  void _ensureWindows() {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.windows) {
      throw const BackendError(
        message: 'La stampa fiscale diretta è disponibile sul POS Windows.',
      );
    }
  }

  PrinterDevice _receiptPrinter(PrintingController printing) {
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
    return candidates.single;
  }

  Future<void> _printPayload(
    PrinterDevice printer,
    String queueName,
    Uint8List payload,
  ) async {
    try {
      await _sendRaw(queueName, payload);
    } catch (_) {
      throw BackendError(
        message:
            'Stampa fiscale non riuscita su ${printer.name}. Controlla connessione e carta.',
      );
    }
  }

  Future<void> _sendRaw(String queueName, Uint8List payload) async {
    final parts = queueName.split('|');

    if (parts.length >= 3 && parts.first == 'bluetooth_serial') {
      final port = parts[1].trim().toUpperCase();
      if (!RegExp(r'^COM\d+$').hasMatch(port)) {
        throw const FormatException('Porta Bluetooth seriale non valida.');
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

    await _channel.invokeMethod<void>('printRaw', arguments);
  }
}
