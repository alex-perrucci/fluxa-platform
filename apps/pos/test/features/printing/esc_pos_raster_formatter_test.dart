import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/printing/platform/esc_pos_raster_formatter.dart';

void main() {
  test('encodes a 58mm black raster row as GS v 0 data', () {
    final payload = buildEscPosRasterDocument(
      pages: [_solidPage(width: 384, height: 1, value: 0)],
      paperWidthMm: 58,
      supportsCut: false,
    );

    expect(payload.take(2), [0x1B, 0x40]);
    expect(payload.sublist(2, 10), [0x1D, 0x76, 0x30, 0x00, 48, 0, 1, 0]);
    expect(payload.sublist(10, 58), everyElement(0xFF));
  });

  test('uses 576 dots for 80mm paper and appends cut command', () {
    final payload = buildEscPosRasterDocument(
      pages: [_solidPage(width: 576, height: 1, value: 255)],
      paperWidthMm: 80,
      supportsCut: true,
    );

    expect(payload.sublist(2, 10), [0x1D, 0x76, 0x30, 0x00, 72, 0, 1, 0]);
    expect(payload.sublist(10, 82), everyElement(0x00));
    expect(payload.sublist(payload.length - 3), [0x1D, 0x56, 0x00]);
  });

  test('rejects incomplete RGBA buffers', () {
    expect(
      () => buildEscPosRasterDocument(
        pages: [
          EscPosRasterPage(width: 2, height: 2, rgba: Uint8List(4)),
        ],
        paperWidthMm: 80,
        supportsCut: false,
      ),
      throwsFormatException,
    );
  });
}

EscPosRasterPage _solidPage({
  required int width,
  required int height,
  required int value,
}) {
  final pixels = Uint8List(width * height * 4);
  for (var offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return EscPosRasterPage(width: width, height: height, rgba: pixels);
}
