import 'dart:typed_data';

import '../domain/fiscal_models.dart';

class FiscalReceiptHeader {
  const FiscalReceiptHeader({
    required this.locationName,
    required this.merchantLegalName,
    required this.addressLine1,
    required this.addressLine2,
    required this.postalCode,
    required this.city,
    required this.province,
  });

  final String locationName;
  final String merchantLegalName;
  final String addressLine1;
  final String? addressLine2;
  final String postalCode;
  final String city;
  final String? province;
}

Uint8List buildFiscalReceiptEscPos({
  required FiscalDocument document,
  required FiscalReceiptHeader header,
  required int charactersPerLine,
  required bool supportsCut,
}) {
  final width = charactersPerLine.clamp(24, 64);
  final sections = _buildSections(document, header, width);
  final output = BytesBuilder(copy: false)..add(const [0x1B, 0x40]);

  for (final section in sections) {
    output.add([0x1B, 0x61, section.centered ? 0x01 : 0x00]);
    output.add([0x1B, 0x45, section.bold ? 0x01 : 0x00]);
    output.add(
      section.doubleSize
          ? const [0x1D, 0x21, 0x11]
          : const [0x1D, 0x21, 0x00],
    );
    for (final line in section.lines) {
      output.add(_encodeCp858(line));
      output.addByte(0x0A);
    }
  }

  output
    ..add(const [0x1B, 0x45, 0x00])
    ..add(const [0x1D, 0x21, 0x00])
    ..add(const [0x1B, 0x61, 0x00])
    ..add(const [0x0A, 0x0A, 0x0A]);
  if (supportsCut) {
    output.add(const [0x1D, 0x56, 0x00]);
  }
  return output.takeBytes();
}

List<String> buildFiscalReceiptTextLines({
  required FiscalDocument document,
  required FiscalReceiptHeader header,
  required int charactersPerLine,
}) {
  final width = charactersPerLine.clamp(24, 64);
  return _buildSections(document, header, width)
      .expand((section) => section.lines)
      .toList(growable: false);
}

List<_ReceiptSection> _buildSections(
  FiscalDocument document,
  FiscalReceiptHeader header,
  int width,
) {
  final sections = <_ReceiptSection>[];
  final merchantPrimary = header.locationName.trim().isNotEmpty
      ? header.locationName.trim()
      : header.merchantLegalName.trim();
  final merchantLegal = header.merchantLegalName.trim();

  final headerLines = <String>[
    ..._wrap(merchantPrimary.toUpperCase(), width),
    if (merchantLegal.isNotEmpty &&
        merchantLegal.toLowerCase() != merchantPrimary.toLowerCase())
      ..._wrap(merchantLegal.toUpperCase(), width),
    ..._wrap(header.addressLine1.trim(), width),
    if (header.addressLine2?.trim().isNotEmpty == true)
      ..._wrap(header.addressLine2!.trim(), width),
    ..._wrap(
      [
        header.postalCode.trim(),
        header.city.trim(),
        if (header.province?.trim().isNotEmpty == true)
          '(${header.province!.trim().toUpperCase()})',
      ].where((value) => value.isNotEmpty).join(' '),
      width,
    ),
    ..._wrap('P.IVA ${document.fiscalId}', width),
  ];
  sections.add(_ReceiptSection(headerLines, centered: true));
  sections.add(const _ReceiptSection(['']));
  sections.add(
    _ReceiptSection(
      _wrap('DOCUMENTO COMMERCIALE', width),
      centered: true,
      bold: true,
    ),
  );
  sections.add(
    _ReceiptSection(
      _wrap(
        document.type == FiscalDocumentType.voidDocument
            ? 'di annullamento'
            : 'di vendita o prestazione',
        width,
      ),
      centered: true,
    ),
  );
  sections.add(const _ReceiptSection(['']));

  final priceWidth = width >= 40 ? 10 : 8;
  final vatWidth = width >= 40 ? 7 : 5;
  final descriptionWidth = width - priceWidth - vatWidth - 2;
  sections.add(
    _ReceiptSection([
      _columns(
        'DESCRIZIONE',
        'IVA',
        'Prezzo(€)',
        descriptionWidth,
        vatWidth,
        priceWidth,
      ),
      '-' * width,
    ], bold: true),
  );

  for (final item in document.items) {
    final description = '${item.displayQuantity} ${item.description}'.trim();
    final wrapped = _wrap(description, descriptionWidth);
    final vat = _itemVatLabel(item);
    final price = _money(item.finalGrossCents);
    for (var index = 0; index < wrapped.length; index += 1) {
      sections.add(
        _ReceiptSection([
          _columns(
            wrapped[index],
            index == 0 ? vat : '',
            index == 0 ? price : '',
            descriptionWidth,
            vatWidth,
            priceWidth,
          ),
        ]),
      );
    }
  }

  sections.add(_ReceiptSection(['-' * width]));
  sections.add(
    _ReceiptSection(
      [_keyValue('TOTALE COMPLESSIVO', _money(document.totalCents), width)],
      bold: true,
    ),
  );

  if (document.vatSummaries.isNotEmpty) {
    final vatCents = document.vatSummaries.fold<int>(
      0,
      (sum, summary) => sum + summary.taxCents,
    );
    sections.add(
      _ReceiptSection([_keyValue('di cui IVA', _money(vatCents), width)]),
    );
  }

  sections.add(const _ReceiptSection(['']));
  sections.add(
    _ReceiptSection([
      _keyValue(
        'Pagamento contante',
        _money(document.cashPaymentCents),
        width,
      ),
      _keyValue(
        'Pagamento elettronico',
        _money(document.electronicPaymentCents),
        width,
      ),
      _keyValue(
        'Importo pagato',
        _money(document.cashPaymentCents + document.electronicPaymentCents),
        width,
      ),
    ]),
  );

  if (document.vatSummaries.isNotEmpty) {
    sections.add(const _ReceiptSection(['']));
    sections.add(
      _ReceiptSection(_wrap('RIEPILOGO IVA', width), bold: true),
    );
    for (final vat in document.vatSummaries) {
      final label = vat.vatNatureCode?.trim().isNotEmpty == true
          ? vat.vatNatureCode!.trim()
          : _rate(vat.vatRateBasisPoints);
      final detail =
          '$label  Imponibile ${_money(vat.netCents)}  IVA ${_money(vat.taxCents)}';
      sections.add(_ReceiptSection(_wrap(detail, width)));
    }
  }

  sections.add(const _ReceiptSection(['']));
  final timestamp = _documentTimestamp(document);
  if (timestamp != null) {
    sections.add(_ReceiptSection(_wrap(timestamp, width), centered: true));
  }
  final number = document.documentNumber?.trim();
  if (number?.isNotEmpty == true) {
    sections.add(
      _ReceiptSection(
        _wrap('DOCUMENTO N. $number', width),
        centered: true,
        bold: true,
      ),
    );
  }
  final externalId = document.externalId?.trim();
  if (externalId?.isNotEmpty == true) {
    sections.add(
      _ReceiptSection(
        _wrap('ID AdE $externalId', width),
        centered: true,
      ),
    );
  }
  sections.add(
    _ReceiptSection(
      _wrap('Emesso tramite Agenzia delle Entrate', width),
      centered: true,
    ),
  );
  return sections;
}

String _columns(
  String description,
  String vat,
  String price,
  int descriptionWidth,
  int vatWidth,
  int priceWidth,
) =>
    '${_fit(description, descriptionWidth).padRight(descriptionWidth)} '
    '${_fit(vat, vatWidth).padLeft(vatWidth)} '
    '${_fit(price, priceWidth).padLeft(priceWidth)}';

String _keyValue(String key, String value, int width) {
  final normalizedValue = _fit(value, width);
  final maxKey = width - normalizedValue.length - 1;
  if (maxKey < 8) {
    return _fit('$key $value', width);
  }
  return '${_fit(key, maxKey).padRight(maxKey)} $normalizedValue';
}

List<String> _wrap(String value, int width) {
  final normalized = value.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (normalized.isEmpty) return const [''];
  final lines = <String>[];
  var remaining = normalized;
  while (remaining.length > width) {
    var split = remaining.lastIndexOf(' ', width);
    if (split <= 0) split = width;
    lines.add(remaining.substring(0, split).trimRight());
    remaining = remaining.substring(split).trimLeft();
  }
  if (remaining.isNotEmpty) lines.add(remaining);
  return lines;
}

String _fit(String value, int width) {
  if (value.length <= width) return value;
  if (width <= 1) return value.substring(0, width);
  return '${value.substring(0, width - 1)}…';
}

String _itemVatLabel(FiscalDocumentItem item) {
  final nature = item.vatNatureCode?.trim();
  if (nature?.isNotEmpty == true) return nature!;
  return _rate(item.vatRateBasisPoints);
}

String _rate(int basisPoints) {
  if (basisPoints % 100 == 0) return '${basisPoints ~/ 100}%';
  return '${(basisPoints / 100).toStringAsFixed(2).replaceAll('.', ',')}%';
}

String _money(int cents) {
  final negative = cents < 0;
  final absolute = cents.abs();
  final value = '${absolute ~/ 100},${(absolute % 100).toString().padLeft(2, '0')}';
  return negative ? '-$value' : value;
}

String? _documentTimestamp(FiscalDocument document) {
  final raw = document.documentDate?.trim();
  if (raw?.isNotEmpty == true) {
    final parsed = DateTime.tryParse(raw!);
    if (parsed != null) return _formatDateTime(parsed.toLocal());
    return raw;
  }
  final issued = document.issuedAt;
  return issued == null ? null : _formatDateTime(issued.toLocal());
}

String _formatDateTime(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.year.toString().padLeft(4, '0')} '
    '${value.hour.toString().padLeft(2, '0')}:'
    '${value.minute.toString().padLeft(2, '0')}';

Uint8List _encodeCp858(String value) {
  final output = BytesBuilder(copy: false);
  for (final rune in value.runes) {
    if (rune >= 0x20 && rune <= 0x7E) {
      output.addByte(rune);
      continue;
    }
    final byte = _cp858[rune];
    output.addByte(byte ?? 0x3F);
  }
  return output.takeBytes();
}

const Map<int, int> _cp858 = {
  0x00C7: 128,
  0x00FC: 129,
  0x00E9: 130,
  0x00E2: 131,
  0x00E4: 132,
  0x00E0: 133,
  0x00E7: 135,
  0x00EA: 136,
  0x00EB: 137,
  0x00E8: 138,
  0x00EF: 139,
  0x00EE: 140,
  0x00EC: 141,
  0x00C4: 142,
  0x00C9: 144,
  0x00F4: 147,
  0x00F6: 148,
  0x00F2: 149,
  0x00FB: 150,
  0x00F9: 151,
  0x00D6: 153,
  0x00DC: 154,
  0x00A3: 156,
  0x00E1: 160,
  0x00ED: 161,
  0x00F3: 162,
  0x00FA: 163,
  0x00F1: 164,
  0x00D1: 165,
  0x00BF: 168,
  0x00AE: 169,
  0x00AC: 170,
  0x00BD: 171,
  0x00BC: 172,
  0x00A1: 173,
  0x00AB: 174,
  0x00BB: 175,
  0x00C1: 181,
  0x00C2: 182,
  0x00C0: 183,
  0x00A9: 184,
  0x00A2: 189,
  0x00A5: 190,
  0x00E3: 198,
  0x00C3: 199,
  0x20AC: 213,
  0x00CD: 214,
  0x00CE: 215,
  0x00CC: 222,
  0x00D3: 224,
  0x00DF: 225,
  0x00D4: 226,
  0x00D2: 227,
  0x00F5: 228,
  0x00D5: 229,
  0x00DA: 233,
  0x00DB: 234,
  0x00D9: 235,
  0x00B0: 248,
};

class _ReceiptSection {
  const _ReceiptSection(
    this.lines, {
    this.centered = false,
    this.bold = false,
    this.doubleSize = false,
  });

  final List<String> lines;
  final bool centered;
  final bool bold;
  final bool doubleSize;
}
