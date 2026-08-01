import 'package:flutter/material.dart';

class FluxaBrandMark extends StatelessWidget {
  const FluxaBrandMark({
    super.key,
    this.size = 42,
    this.inkColor,
    this.accentColor = const Color(0xFFD6A84B),
  });

  final double size;
  final Color? inkColor;
  final Color accentColor;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size.square(size),
    painter: _FluxaBrandPainter(
      inkColor: inkColor ?? Theme.of(context).colorScheme.onSurface,
      accentColor: accentColor,
    ),
  );
}

class FluxaBrandLockup extends StatelessWidget {
  const FluxaBrandLockup({
    super.key,
    this.reversed = false,
    this.compact = false,
  });

  final bool reversed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final ink = reversed ? Colors.white : const Color(0xFF101114);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        FluxaBrandMark(size: compact ? 34 : 42, inkColor: ink),
        SizedBox(width: compact ? 10 : 13),
        Text(
          'FLUXA',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: ink,
            fontSize: compact ? 17 : 21,
            fontWeight: FontWeight.w800,
            letterSpacing: compact ? 4.5 : 6,
          ),
        ),
      ],
    );
  }
}

class _FluxaBrandPainter extends CustomPainter {
  const _FluxaBrandPainter({required this.inkColor, required this.accentColor});

  final Color inkColor;
  final Color accentColor;

  @override
  void paint(Canvas canvas, Size size) {
    final sx = size.width / 128;
    final sy = size.height / 128;
    canvas.save();
    canvas.scale(sx, sy);

    final ink = Paint()..color = inkColor;
    final accent = Paint()..color = accentColor;

    final top = Path()
      ..moveTo(20, 16)
      ..lineTo(104, 16)
      ..lineTo(79, 45)
      ..lineTo(20, 45)
      ..close();
    final middle = Path()
      ..moveTo(20, 51)
      ..lineTo(77, 51)
      ..lineTo(60, 72)
      ..lineTo(20, 72)
      ..close();
    final cut = Path()
      ..moveTo(20, 77)
      ..lineTo(52, 77)
      ..lineTo(20, 108)
      ..close();

    canvas.drawPath(top, ink);
    canvas.drawPath(middle, ink);
    canvas.drawPath(cut, accent);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _FluxaBrandPainter oldDelegate) =>
      oldDelegate.inkColor != inkColor ||
      oldDelegate.accentColor != accentColor;
}
