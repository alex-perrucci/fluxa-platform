class EscPosPrintProfile {
  const EscPosPrintProfile({
    required this.paperWidthMm,
    required this.charactersPerLine,
    this.encoding = 'CP858',
  });

  final int paperWidthMm;
  final int charactersPerLine;
  final String encoding;

  int get normalizedCharactersPerLine =>
      charactersPerLine.clamp(24, 64).toInt();

  int get printableWidthDots {
    if (paperWidthMm >= 76) return 576;
    if (paperWidthMm >= 56) return 384;
    return (normalizedCharactersPerLine * 12).clamp(288, 576).toInt();
  }
}

class EscPosTextFormatter {
  const EscPosTextFormatter._();

  static const _esc = '\u001b';
  static const _gs = '\u001d';

  static String format(String source, EscPosPrintProfile profile) {
    final width = profile.normalizedCharactersPerLine;
    final output = StringBuffer()
      ..write('$_esc@')
      ..write('$_esc')
      ..write('t')
      ..writeCharCode(_codePage(profile.encoding))
      ..write('$_esc')
      ..write('M')
      ..writeCharCode(0)
      ..write('$_gs')
      ..write('L')
      ..writeCharCode(0)
      ..writeCharCode(0)
      ..write('$_gs')
      ..write('W')
      ..writeCharCode(profile.printableWidthDots & 0xff)
      ..writeCharCode((profile.printableWidthDots >> 8) & 0xff);

    final normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    for (final rawLine in normalized.split('\n')) {
      final line = _shortenTechnicalIdentifiers(rawLine.trimRight());
      if (_isSeparator(line)) {
        _writeLine(output, _repeat('-', width));
        continue;
      }

      final centered = _isCenteredLine(line);
      final emphasized = _isEmphasizedLine(line);
      final printable = centered ? _cleanCenteredLine(line) : line;
      final wrapped = _layoutLine(printable, width);
      if (wrapped.isEmpty) {
        _writeLine(output, '');
        continue;
      }

      for (final part in wrapped) {
        output
          ..write('$_esc')
          ..write('a')
          ..writeCharCode(centered ? 1 : 0)
          ..write('$_esc')
          ..write('E')
          ..writeCharCode(emphasized ? 1 : 0);
        _writeLine(output, part);
      }
    }

    output
      ..write('$_esc')
      ..write('E')
      ..writeCharCode(0)
      ..write('$_esc')
      ..write('a')
      ..writeCharCode(0)
      ..write('$_esc')
      ..write('M')
      ..writeCharCode(0);
    return output.toString();
  }

  static List<String> layoutForPreview(String source, int charactersPerLine) {
    final width = charactersPerLine.clamp(24, 64).toInt();
    final result = <String>[];
    final normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    for (final rawLine in normalized.split('\n')) {
      final line = _shortenTechnicalIdentifiers(rawLine.trimRight());
      if (_isSeparator(line)) {
        result.add(_repeat('-', width));
      } else {
        result.addAll(_layoutLine(_cleanCenteredLine(line), width));
      }
    }
    return result;
  }

  static List<String> _layoutLine(String line, int width) {
    if (line.isEmpty) return const [''];

    final moneyColumn = RegExp(
      r'^(.*?)(?:\s{2,})(-?\d+[\.,]\d{2}\s+[A-Z]{3})$',
    ).firstMatch(line);
    if (moneyColumn != null) {
      return _twoColumn(
        moneyColumn.group(1)!.trimRight(),
        moneyColumn.group(2)!,
        width,
      );
    }

    final totalColumn = RegExp(
      r'^([^:]{1,24}:)\s*(-?\d+[\.,]\d{2}\s+[A-Z]{3})$',
    ).firstMatch(line);
    if (totalColumn != null) {
      return _twoColumn(totalColumn.group(1)!, totalColumn.group(2)!, width);
    }

    return _wrap(line, width);
  }

  static List<String> _twoColumn(String left, String right, int width) {
    if (right.length >= width - 2) return _wrap('$left $right', width);
    final leftWidth = width - right.length - 1;
    final leftLines = _wrap(left, leftWidth);
    if (leftLines.isEmpty) return [right.padLeft(width)];
    final result = <String>[];
    for (var index = 0; index < leftLines.length; index += 1) {
      final part = leftLines[index];
      if (index == leftLines.length - 1) {
        result.add('${part.padRight(leftWidth)} $right');
      } else {
        result.add(part);
      }
    }
    return result;
  }

  static List<String> _wrap(String value, int width) {
    if (value.isEmpty) return const [''];
    final result = <String>[];
    var remaining = value.trim();
    while (remaining.length > width) {
      var split = remaining.lastIndexOf(' ', width);
      if (split <= 0) split = width;
      result.add(remaining.substring(0, split).trimRight());
      remaining = remaining.substring(split).trimLeft();
    }
    result.add(remaining);
    return result;
  }

  static bool _isSeparator(String line) => RegExp(r'^-{3,}$').hasMatch(line);

  static bool _isCenteredLine(String line) =>
      line.startsWith('***') && line.endsWith('***');

  static bool _isEmphasizedLine(String line) {
    final normalized = line.toUpperCase();
    return _isCenteredLine(line) ||
        normalized.startsWith('TOTALE:') ||
        normalized.startsWith('TOTALE ');
  }

  static String _cleanCenteredLine(String line) {
    if (!line.startsWith('***') || !line.endsWith('***')) return line;
    return line.substring(3, line.length - 3).trim();
  }

  static String _shortenTechnicalIdentifiers(String line) =>
      line.replaceAllMapped(
        RegExp(
          r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b',
        ),
        (match) => '${match.group(0)!.substring(0, 8)}…',
      );

  static int _codePage(String encoding) {
    final normalized = encoding.toUpperCase();
    if (normalized == 'CP850' || normalized == 'IBM850') return 2;
    return 19;
  }

  static String _repeat(String value, int count) =>
      List<String>.filled(count, value, growable: false).join();

  static void _writeLine(StringBuffer output, String line) {
    output
      ..write(line)
      ..write('\n');
  }
}
