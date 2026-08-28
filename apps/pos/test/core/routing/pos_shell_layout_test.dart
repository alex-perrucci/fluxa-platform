import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/routing/pos_shell_layout.dart';

void main() {
  group('PosShellLayoutPolicy', () {
    test('classifies phone, tablet and desktop widths', () {
      expect(
        PosShellLayoutPolicy.sizeClassForWidth(599),
        PosShellSizeClass.compact,
      );
      expect(
        PosShellLayoutPolicy.sizeClassForWidth(600),
        PosShellSizeClass.medium,
      );
      expect(
        PosShellLayoutPolicy.sizeClassForWidth(1099),
        PosShellSizeClass.medium,
      );
      expect(
        PosShellLayoutPolicy.sizeClassForWidth(1100),
        PosShellSizeClass.expanded,
      );
    });

    test('never asks NavigationBar to render a single destination', () {
      expect(
        PosShellLayoutPolicy.shouldShowBottomNavigation(
          width: 390,
          destinationCount: 1,
        ),
        isFalse,
      );
      expect(
        PosShellLayoutPolicy.shouldShowBottomNavigation(
          width: 390,
          destinationCount: 2,
        ),
        isTrue,
      );
    });

    test('uses compact rail on tablet-sized layouts', () {
      expect(
        PosShellLayoutPolicy.shouldShowCompactRail(
          width: 800,
          destinationCount: 1,
        ),
        isTrue,
      );
      expect(
        PosShellLayoutPolicy.shouldShowCompactRail(
          width: 390,
          destinationCount: 4,
        ),
        isFalse,
      );
    });

    test('caps compact primary navigation to leave room for Altro', () {
      expect(PosShellLayoutPolicy.compactPrimaryDestinationCount(4), 4);
      expect(PosShellLayoutPolicy.compactPrimaryDestinationCount(5), 3);
      expect(PosShellLayoutPolicy.compactPrimaryDestinationCount(8), 3);
    });
  });
}
