enum PosShellSizeClass { compact, medium, expanded }

class PosShellLayoutPolicy {
  const PosShellLayoutPolicy._();

  static const double mediumMinWidth = 600;
  static const double expandedMinWidth = 1100;

  static PosShellSizeClass sizeClassForWidth(double width) {
    if (width >= expandedMinWidth) {
      return PosShellSizeClass.expanded;
    }
    if (width >= mediumMinWidth) {
      return PosShellSizeClass.medium;
    }
    return PosShellSizeClass.compact;
  }

  static bool shouldShowBottomNavigation({
    required double width,
    required int destinationCount,
  }) =>
      sizeClassForWidth(width) == PosShellSizeClass.compact &&
      destinationCount >= 2;

  static bool shouldShowCompactRail({
    required double width,
    required int destinationCount,
  }) =>
      sizeClassForWidth(width) == PosShellSizeClass.medium &&
      destinationCount > 0;

  static int compactPrimaryDestinationCount(int destinationCount) {
    if (destinationCount <= 4) {
      return destinationCount;
    }
    return 3;
  }
}
