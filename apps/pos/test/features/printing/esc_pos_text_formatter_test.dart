// dart format off
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/printing/platform/esc_pos_text_formatter.dart';

void main() {
  group('EscPosTextFormatter', () {
    test('wraps every preview line to the configured width', () {
      final lines = EscPosTextFormatter.layoutForPreview(
        '1 x Prodotto con un nome molto lungo che non deve essere tagliato  12.50 EUR',
        32,
      );

      expect(lines, isNotEmpty);
      expect(lines.every((line) => line.length <= 32), isTrue);
      expect(lines.last.endsWith('12.50 EUR'), isTrue);
    });

    test('keeps lines exactly at the configured limit', () {
      const value = '12345678901234567890123456789012';
      final lines = EscPosTextFormatter.layoutForPreview(value, 32);

      expect(lines, [value]);
    });

    test('hard-wraps a word longer than the configured width', () {
      final lines = EscPosTextFormatter.layoutForPreview(
        List.filled(40, 'A').join(),
        32,
      );

      expect(lines, hasLength(2));
      expect(lines.first, hasLength(32));
      expect(lines.last, hasLength(8));
    });

    test('expands separators to the configured width', () {
      final lines = EscPosTextFormatter.layoutForPreview('--------', 48);

      expect(lines.single, List.filled(48, '-').join());
    });

    test('shortens UUIDs that would destroy receipt layout', () {
      final lines = EscPosTextFormatter.layoutForPreview(
        'Checkout: 123e4567-e89b-12d3-a456-426614174000',
        48,
      );

      expect(lines.single, 'Checkout: 123e4567…');
    });

    test('preserves Italian CP858 text and emits profile commands', () {
      const profile = EscPosPrintProfile(
        paperWidthMm: 80,
        charactersPerLine: 48,
      );
      final output = EscPosTextFormatter.format(
        'Caffè € 2,50\nTOTALE: 2.50 EUR',
        profile,
      );

      expect(output, contains('Caffè € 2,50'));
      expect(output, contains('\u001bt\u0013'));
      expect(output, contains('\u001dW'));
      expect(output, contains('\u001bE\u0001'));
    });

    test('uses the configured 80 mm profile width', () {
      const profile = EscPosPrintProfile(
        paperWidthMm: 80,
        charactersPerLine: 42,
      );

      expect(profile.normalizedCharactersPerLine, 42);
      expect(profile.printableWidthDots, 576);
    });
  });
}
// dart format on
