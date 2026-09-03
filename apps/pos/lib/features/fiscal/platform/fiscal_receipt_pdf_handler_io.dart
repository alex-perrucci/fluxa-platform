import 'dart:io';
import 'dart:typed_data';

import '../domain/fiscal_receipt_layout.dart';

bool get fiscalReceiptPdfActionsSupported => Platform.isWindows;

typedef FiscalReceiptPrinter =
    Future<String> Function(FiscalReceiptLayoutData receipt);
typedef FiscalReceiptLayoutLoader =
    Future<FiscalReceiptLayoutData> Function(String documentId);

FiscalReceiptPrinter? _configuredReceiptPrinter;
FiscalReceiptLayoutLoader? _configuredReceiptLayoutLoader;

void configureFiscalReceiptPrinter(FiscalReceiptPrinter? printer) {
  _configuredReceiptPrinter = printer;
}

void configureFiscalReceiptLayoutLoader(FiscalReceiptLayoutLoader? loader) {
  _configuredReceiptLayoutLoader = loader;
}

Future<String> openFiscalReceiptPdf(Uint8List bytes, String filename) async {
  _ensureWindows();
  final file = await _writeTemp(bytes, filename);
  final result = await Process.run('cmd.exe', ['/c', 'start', '', file.path]);
  if (result.exitCode != 0) {
    throw FileSystemException('Impossibile aprire il PDF fiscale.', file.path);
  }
  return file.path;
}

Future<String> saveFiscalReceiptPdf(Uint8List bytes, String filename) async {
  _ensureWindows();
  final home = Platform.environment['USERPROFILE']?.trim();
  if (home == null || home.isEmpty) {
    throw const FileSystemException('Cartella utente Windows non disponibile.');
  }
  final downloads = Directory('$home${Platform.pathSeparator}Downloads');
  if (!await downloads.exists()) {
    await downloads.create(recursive: true);
  }
  final file = File(
    '${downloads.path}${Platform.pathSeparator}${_safeFilename(filename)}',
  );
  await file.writeAsBytes(bytes, flush: true);
  return file.path;
}

/// Backward-compatible action used by the current "Stampa PDF" button.
///
/// The PDF bytes are intentionally not rasterized anymore: the document id
/// embedded by FiscalApi is resolved to the structured fiscal snapshot and the
/// thermal printer receives a native 58/80 mm ESC/POS receipt instead.
Future<String> printFiscalReceiptPdf(Uint8List bytes, String filename) async {
  _ensureWindows();
  final documentId = _documentIdFromTaggedFilename(filename);
  final loader = _configuredReceiptLayoutLoader;
  if (documentId == null || loader == null) {
    throw const FileSystemException(
      'Documento fiscale non identificabile per la stampa termica.',
    );
  }
  final receipt = await loader(documentId);
  return printFiscalReceiptLayout(receipt);
}

Future<String> printFiscalReceiptLayout(FiscalReceiptLayoutData receipt) async {
  _ensureWindows();
  final printer = _configuredReceiptPrinter;
  if (printer == null) {
    throw const FileSystemException(
      'Stampante scontrini Fluxa non ancora inizializzata.',
    );
  }
  return printer(receipt);
}

Future<File> _writeTemp(Uint8List bytes, String filename) async {
  final directory = Directory(
    '${Directory.systemTemp.path}${Platform.pathSeparator}fluxa${Platform.pathSeparator}fiscal-receipts',
  );
  if (!await directory.exists()) {
    await directory.create(recursive: true);
  }
  final file = File(
    '${directory.path}${Platform.pathSeparator}${_safeFilename(filename)}',
  );
  await file.writeAsBytes(bytes, flush: true);
  return file;
}

String? _documentIdFromTaggedFilename(String value) {
  final match = RegExp(
    r'^__fluxa_document_([0-9a-fA-F-]{36})__',
  ).firstMatch(value.trim());
  return match?.group(1);
}

String _publicFilename(String value) => value.replaceFirst(
  RegExp(r'^__fluxa_document_[0-9a-fA-F-]{36}__'),
  '',
);

String _safeFilename(String value) {
  final sanitized = _publicFilename(value)
      .replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '-')
      .replaceAll(RegExp(r'\s+'), '-')
      .replaceAll(RegExp(r'-+'), '-')
      .replaceAll(RegExp(r'^[-.]+|[-.]+$'), '');
  final base = sanitized.isEmpty ? 'scontrino-fiscale.pdf' : sanitized;
  return base.toLowerCase().endsWith('.pdf') ? base : '$base.pdf';
}

void _ensureWindows() {
  if (!Platform.isWindows) {
    throw UnsupportedError('Documento fiscale supportato dal POS desktop Windows.');
  }
}
