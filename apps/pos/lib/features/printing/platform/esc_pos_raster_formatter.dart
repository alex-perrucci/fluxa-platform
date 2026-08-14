import 'dart:math' as math;
import 'dart:typed_data';

class EscPosRasterPage {
  const EscPosRasterPage({
    required this.width,
    required this.height,
    required this.rgba,
  });

  final int width;
  final int height;
  final Uint8List rgba;
}

Uint8List buildEscPosRasterDocument({
  required List<EscPosRasterPage> pages,
  required int paperWidthMm,
  required bool supportsCut,
}) {
  if (pages.isEmpty) {
    throw const FormatException('Il PDF fiscale non contiene pagine stampabili.');
  }

  final targetWidthDots = _targetWidthDots(paperWidthMm);
  final output = BytesBuilder(copy: false)..add(const [0x1B, 0x40]);

  for (var pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    final page = pages[pageIndex];
    _validatePage(page);
    _appendPage(output, page, targetWidthDots);
    if (pageIndex < pages.length - 1) {
      output.add(const [0x0A, 0x0A, 0x0A, 0x0A]);
    }
  }

  output.add(const [0x0A, 0x0A, 0x0A]);
  if (supportsCut) {
    output.add(const [0x1D, 0x56, 0x00]);
  }
  return output.takeBytes();
}

int _targetWidthDots(int paperWidthMm) {
  if (paperWidthMm <= 0) {
    throw RangeError.value(paperWidthMm, 'paperWidthMm');
  }
  return paperWidthMm <= 58 ? 384 : 576;
}

void _validatePage(EscPosRasterPage page) {
  if (page.width <= 0 || page.height <= 0) {
    throw const FormatException('Dimensioni raster PDF non valide.');
  }
  final expected = page.width * page.height * 4;
  if (page.rgba.lengthInBytes < expected) {
    throw const FormatException('Buffer raster PDF incompleto.');
  }
}

void _appendPage(
  BytesBuilder output,
  EscPosRasterPage page,
  int targetWidthDots,
) {
  final scaledHeight = math.max(
    1,
    (page.height * targetWidthDots / page.width).round(),
  );
  final bytesPerRow = (targetWidthDots + 7) ~/ 8;
  const chunkRows = 192;

  for (var startY = 0; startY < scaledHeight; startY += chunkRows) {
    final rows = math.min(chunkRows, scaledHeight - startY);
    output.add([
      0x1D,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xFF,
      (bytesPerRow >> 8) & 0xFF,
      rows & 0xFF,
      (rows >> 8) & 0xFF,
    ]);

    final raster = Uint8List(bytesPerRow * rows);
    for (var localY = 0; localY < rows; localY += 1) {
      final targetY = startY + localY;
      final sourceY = math.min(
        page.height - 1,
        targetY * page.height ~/ scaledHeight,
      );
      for (var targetX = 0; targetX < targetWidthDots; targetX += 1) {
        final sourceX = math.min(
          page.width - 1,
          targetX * page.width ~/ targetWidthDots,
        );
        final sourceOffset = (sourceY * page.width + sourceX) * 4;
        if (_isBlack(page.rgba, sourceOffset)) {
          final byteIndex = localY * bytesPerRow + (targetX >> 3);
          raster[byteIndex] |= 0x80 >> (targetX & 7);
        }
      }
    }
    output.add(raster);
  }
}

bool _isBlack(Uint8List rgba, int offset) {
  final red = rgba[offset];
  final green = rgba[offset + 1];
  final blue = rgba[offset + 2];
  final alpha = rgba[offset + 3];

  final blendedRed = (red * alpha + 255 * (255 - alpha)) ~/ 255;
  final blendedGreen = (green * alpha + 255 * (255 - alpha)) ~/ 255;
  final blendedBlue = (blue * alpha + 255 * (255 - alpha)) ~/ 255;
  final luminance =
      (299 * blendedRed + 587 * blendedGreen + 114 * blendedBlue) ~/ 1000;
  return luminance < 180;
}
