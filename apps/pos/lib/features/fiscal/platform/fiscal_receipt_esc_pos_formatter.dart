import 'dart:math' as math;
import 'dart:typed_data';

import '../domain/fiscal_receipt_layout.dart';

Uint8List buildFiscalReceiptEscPos({
  required FiscalReceiptLayoutData receipt,
  required int paperWidthMm,
  required int charactersPerLine,
  required bool supportsCut,
}) {
  final width = _effectiveWidth(paperWidthMm, charactersPerLine);
  final out = BytesBuilder(copy: false)
    ..add(const [0x1B, 0x40]) // ESC @ - initialize
    ..add(const [0x1B, 0x74, 0x02]); // ESC t 2 - PC850 on ESC/POS

  void command(List<int> bytes) => out.add(bytes);
  void text(String value) => out.add(_encodePc850(value));
  void line([String value = '']) => text('${_fit(value, width)}\n');
  void centered(String value) {
    for (final part in _wrap(value, width)) {
      final left = math.max(0, (width - part.length) ~/ 2);
      line('${' ' * left}$part');
    }
  }

  command(const [0x1B, 0x61, 0x01]); // center
  command(const [0x1B, 0x45, 0x01]); // bold
  centered(receipt.issuer.displayName);
  command(const [0x1B, 0x45, 0x00]);
  if (receipt.issuer.legalName.trim().toLowerCase() !=
      receipt.issuer.displayName.trim().toLowerCase()) {
    centered(receipt.issuer.legalName);
  }
  centered(receipt.issuer.addressLine1);
  final address2 = receipt.issuer.addressLine2?.trim();
  if (address2 != null && address2.isNotEmpty) centered(address2);
  centered(
    '${receipt.issuer.postalCode} ${receipt.issuer.city}'
    '${receipt.issuer.province?.trim().isNotEmpty == true ? ' (${receipt.issuer.province})' : ''}',
  );
  centered('P.IVA ${receipt.issuer.vatNumber}');
  line();

  command(const [0x1B, 0x45, 0x01]);
  centered('DOCUMENTO COMMERCIALE');
  command(const [0x1B, 0x45, 0x00]);
  centered('di vendita o prestazione');
  line();

  command(const [0x1B, 0x61, 0x00]); // left
  final amountWidth = paperWidthMm <= 58 ? 9 : 10;
  final vatWidth = paperWidthMm <= 58 ? 5 : 7;
  final descriptionWidth = math.max(10, width - amountWidth - vatWidth - 2);
  line(
    '${_padRight('DESCRIZIONE', descriptionWidth)} '
    '${_padLeft('IVA', vatWidth)} '
    '${_padLeft('PREZZO', amountWidth)}',
  );
  line('-' * width);

  for (final item in receipt.items) {
    final description = '${item.displayQuantity} ${item.description}'.trim();
    final descriptionLines = _wrap(description, descriptionWidth);
    final vat = item.vatLabel;
    final amount = formatReceiptMoney(item.finalGrossCents);
    for (var index = 0; index < descriptionLines.length; index += 1) {
      line(
        '${_padRight(descriptionLines[index], descriptionWidth)} '
        '${_padLeft(index == 0 ? vat : '', vatWidth)} '
        '${_padLeft(index == 0 ? amount : '', amountWidth)}',
      );
    }
    if (item.discountCents > 0) {
      for (final part in _wrap(
        '  Sconto ${formatReceiptMoney(item.discountCents)}',
        width,
      )) {
        line(part);
      }
    }
  }

  line('-' * width);
  command(const [0x1B, 0x45, 0x01]);
  line(_labelValue('TOTALE COMPLESSIVO', formatReceiptMoney(receipt.totalCents), width));
  command(const [0x1B, 0x45, 0x00]);
  line(_labelValue('di cui IVA', formatReceiptMoney(receipt.totalVatCents), width));

  if (receipt.vatSummaries.isNotEmpty) {
    line();
    line('RIEPILOGO IVA');
    for (final vat in receipt.vatSummaries) {
      final label = 'IVA ${vat.rateLabel}';
      line(_labelValue(label, formatReceiptMoney(vat.taxCents), width));
      if (paperWidthMm > 58) {
        line(
          _labelValue(
            '  Imponibile',
            formatReceiptMoney(vat.netCents),
            width,
          ),
        );
      }
    }
  }

  line();
  line(_labelValue(
    'Pagamento contante',
    formatReceiptMoney(receipt.cashPaymentCents),
    width,
  ));
  line(_labelValue(
    'Pagamento elettronico',
    formatReceiptMoney(receipt.electronicPaymentCents),
    width,
  ));
  if (receipt.unpaidCents > 0) {
    line(_labelValue(
      'Non riscosso',
      formatReceiptMoney(receipt.unpaidCents),
      width,
    ));
  }
  command(const [0x1B, 0x45, 0x01]);
  line(_labelValue(
    'Importo pagato',
    formatReceiptMoney(receipt.paidCents),
    width,
  ));
  command(const [0x1B, 0x45, 0x00]);
  line();

  command(const [0x1B, 0x61, 0x01]);
  final timestamp = _receiptTimestamp(receipt);
  if (timestamp.isNotEmpty) centered(timestamp);
  final documentNumber = receipt.documentNumber?.trim();
  if (documentNumber != null && documentNumber.isNotEmpty) {
    command(const [0x1B, 0x45, 0x01]);
    centered('DOCUMENTO N. $documentNumber');
    command(const [0x1B, 0x45, 0x00]);
  }

  if (receipt.provider == 'ADE_WEB') {
    line();
    centered('Emesso tramite Agenzia delle Entrate');
    final externalId = receipt.externalId?.trim();
    if (externalId != null && externalId.isNotEmpty) {
      centered('ID AdE $externalId');
    }
  }

  command(const [0x1B, 0x61, 0x00]);
  text('\n\n\n');
  if (supportsCut) command(const [0x1D, 0x56, 0x00]);
  return out.takeBytes();
}

int _effectiveWidth(int paperWidthMm, int configured) {
  if (paperWidthMm <= 58) {
    if (configured < 24 || configured > 42) return 32;
    return configured;
  }
  if (configured < 40 || configured > 64) return 48;
  return configured;
}

String _receiptTimestamp(FiscalReceiptLayoutData receipt) {
  final issued = receipt.issuedAt?.toLocal();
  final time = issued == null
      ? ''
      : '${issued.hour.toString().padLeft(2, '0')}:${issued.minute.toString().padLeft(2, '0')}';
  final officialDate = receipt.documentDate?.trim();
  if (officialDate != null && officialDate.isNotEmpty) {
    return time.isEmpty ? officialDate : '$officialDate  $time';
  }
  if (issued == null) return '';
  final date =
      '${issued.day.toString().padLeft(2, '0')}-${issued.month.toString().padLeft(2, '0')}-${issued.year}';
  return '$date  $time';
}

String _labelValue(String label, String value, int width) {
  final available = width - value.length - 1;
  if (available < 8) return '$label $value';
  final safeLabel = label.length > available
      ? '${label.substring(0, math.max(1, available - 1))}.'
      : label;
  return '${_padRight(safeLabel, available)} $value';
}

List<String> _wrap(String value, int width) {
  final normalized = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (normalized.isEmpty) return const [''];
  if (normalized.length <= width) return [normalized];
  final result = <String>[];
  var remaining = normalized;
  while (remaining.length > width) {
    var cut = remaining.lastIndexOf(' ', width);
    if (cut < math.max(1, width ~/ 2)) cut = width;
    result.add(remaining.substring(0, cut).trimRight());
    remaining = remaining.substring(cut).trimLeft();
  }
  if (remaining.isNotEmpty) result.add(remaining);
  return result;
}

String _fit(String value, int width) =>
    value.length <= width ? value : value.substring(0, width);

String _padRight(String value, int width) {
  final fitted = _fit(value, width);
  return fitted.padRight(width);
}

String _padLeft(String value, int width) {
  final fitted = value.length <= width ? value : value.substring(value.length - width);
  return fitted.padLeft(width);
}

Uint8List _encodePc850(String value) {
  final result = <int>[];
  for (final rune in value.runes) {
    if (rune >= 0x20 && rune <= 0x7E || rune == 0x0A || rune == 0x0D) {
      result.add(rune);
      continue;
    }
    final mapped = _pc850[rune];
    result.add(mapped ?? 0x3F);
  }
  return Uint8List.fromList(result);
}

const Map<int, int> _pc850 = {
  0x00FC: 0x81, // ü
  0x00E9: 0x82, // é
  0x00E2: 0x83,
  0x00E4: 0x84,
  0x00E0: 0x85, // à
  0x00E7: 0x87,
  0x00EA: 0x88,
  0x00EB: 0x89,
  0x00E8: 0x8A, // è
  0x00EF: 0x8B,
  0x00EE: 0x8C,
  0x00EC: 0x8D, // ì
  0x00C4: 0x8E,
  0x00C9: 0x90, // É
  0x00F4: 0x93,
  0x00F6: 0x94,
  0x00F2: 0x95, // ò
  0x00FB: 0x96,
  0x00F9: 0x97, // ù
  0x00D6: 0x99,
  0x00DC: 0x9A,
  0x00A3: 0x9C,
  0x00E1: 0xA0,
  0x00ED: 0xA1,
  0x00F3: 0xA2,
  0x00FA: 0xA3,
  0x00F1: 0xA4,
  0x00D1: 0xA5,
  0x00AB: 0xAE,
  0x00BB: 0xAF,
  0x2018: 0x27,
  0x2019: 0x27,
  0x201C: 0x22,
  0x201D: 0x22,
  0x2013: 0x2D,
  0x2014: 0x2D,
  0x00B0: 0xF8,
};
