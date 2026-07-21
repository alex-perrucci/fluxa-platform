import 'dart:math';

class UuidV4 {
  UuidV4._();

  static final Random _random = Random.secure();
  static const String _hex = '0123456789abcdef';

  static String generate() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final buffer = StringBuffer();
    for (var index = 0; index < bytes.length; index += 1) {
      if (index == 4 || index == 6 || index == 8 || index == 10) {
        buffer.write('-');
      }
      final value = bytes[index];
      buffer
        ..write(_hex[value >> 4])
        ..write(_hex[value & 0x0f]);
    }
    return buffer.toString();
  }
}
