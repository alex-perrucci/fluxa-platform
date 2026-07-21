class QuantityCodec {
  QuantityCodec._();

  static int parse(String rawValue, int scale) {
    _validateScale(scale);
    final normalized = rawValue.trim().replaceAll(',', '.');
    if (!RegExp(r'^\d+(?:\.\d+)?$').hasMatch(normalized)) {
      throw const FormatException('Inserisci una quantità valida.');
    }
    final parts = normalized.split('.');
    final wholePart = parts.first;
    final fractionPart = parts.length == 2 ? parts[1] : '';
    if (fractionPart.length > scale) {
      throw FormatException('Sono ammessi al massimo $scale decimali.');
    }
    if (scale == 0 && fractionPart.isNotEmpty) {
      throw const FormatException(
        'Questo prodotto accetta solo quantità intere.',
      );
    }
    final multiplier = _powerOfTen(scale);
    final whole = int.parse(wholePart);
    final paddedFraction = fractionPart.padRight(scale, '0');
    final fraction = paddedFraction.isEmpty ? 0 : int.parse(paddedFraction);
    final amount = whole * multiplier + fraction;
    if (amount < 1 || amount > 1000000000) {
      throw const FormatException('La quantità deve essere maggiore di zero.');
    }
    return amount;
  }

  static String format(int amount, int scale) {
    _validateScale(scale);
    if (scale == 0) {
      return amount.toString();
    }
    final multiplier = _powerOfTen(scale);
    final whole = amount ~/ multiplier;
    final fraction = (amount % multiplier).toString().padLeft(scale, '0');
    return '$whole,$fraction';
  }

  static int _powerOfTen(int scale) {
    var result = 1;
    for (var index = 0; index < scale; index += 1) {
      result *= 10;
    }
    return result;
  }

  static void _validateScale(int scale) {
    if (scale < 0 || scale > 3) {
      throw FormatException('Scala quantità non supportata: $scale');
    }
  }
}
