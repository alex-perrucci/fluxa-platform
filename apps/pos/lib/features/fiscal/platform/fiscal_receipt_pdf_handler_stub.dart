import 'dart:typed_data';

import '../domain/fiscal_models.dart';

bool get fiscalReceiptPdfActionsSupported => false;

typedef FiscalReceiptPrinter =
    Future<String> Function(Uint8List bytes, String filename);
typedef FiscalDocumentPrinter = Future<String> Function(FiscalDocument document);

void configureFiscalReceiptPrinter(FiscalReceiptPrinter? printer) {}

void configureFiscalDocumentPrinter(FiscalDocumentPrinter? printer) {}

Future<String> openFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> saveFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> printFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError(
        'Stampa PDF fiscale non supportata su questa piattaforma.',
      ),
    );

Future<String> printFiscalReceiptDocument(FiscalDocument document) =>
    Future.error(
      UnsupportedError(
        'Stampa documento fiscale non supportata su questa piattaforma.',
      ),
    );
