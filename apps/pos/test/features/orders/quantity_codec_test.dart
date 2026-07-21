import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/orders/domain/quantity_codec.dart';
import 'package:fluxa_pos/features/orders/domain/uuid_v4.dart';

void main() {
  test('converts decimal quantities without floating point', () {
    expect(QuantityCodec.parse('2', 0), 2);
    expect(QuantityCodec.parse('1,250', 3), 1250);
    expect(QuantityCodec.parse('0.75', 2), 75);
    expect(QuantityCodec.format(1250, 3), '1,250');
  });

  test('rejects invalid precision and zero quantities', () {
    expect(() => QuantityCodec.parse('1,5', 0), throwsFormatException);
    expect(() => QuantityCodec.parse('1,2345', 3), throwsFormatException);
    expect(() => QuantityCodec.parse('0', 3), throwsFormatException);
  });

  test('generates RFC 4122 version 4 identifiers', () {
    final value = UuidV4.generate();
    expect(
      value,
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });
}
