import 'package:flutter/material.dart';

class CashierLayoutPolicy {
  const CashierLayoutPolicy._();

  static const double defaultSideBySideMinWidth = 980;
  static const double activeOrderPaneHeight = 390;
  static const double emptyOrderPaneHeight = 210;
  static const double minimumCatalogViewportHeight = 320;
  static const double minimumScrollableCatalogHeight = 420;

  static bool useSideBySide(
    BoxConstraints constraints, {
    double minWidth = defaultSideBySideMinWidth,
  }) => constraints.maxWidth >= minWidth;

  static double stackedOrderHeight({required bool hasActiveContent}) =>
      hasActiveContent ? activeOrderPaneHeight : emptyOrderPaneHeight;

  static bool needsOuterScroll(
    BoxConstraints constraints, {
    required double orderPaneHeight,
    double gap = 12,
  }) =>
      constraints.maxHeight <
      orderPaneHeight + minimumCatalogViewportHeight + gap;

  static double scrollableCatalogHeight(BoxConstraints constraints) {
    final proportional = constraints.maxHeight * 0.72;
    return proportional < minimumScrollableCatalogHeight
        ? minimumScrollableCatalogHeight
        : proportional;
  }

  static bool stackPrimaryActions(double width) => width < 430;

  static bool stackOrderLineControls(double width) => width < 370;
}

class CashierResponsiveWorkspace extends StatelessWidget {
  const CashierResponsiveWorkspace({
    super.key,
    required this.catalogPane,
    required this.orderPane,
    required this.hasActiveContent,
    this.sideBySideMinWidth = CashierLayoutPolicy.defaultSideBySideMinWidth,
    this.sidePaneWidth = 410,
    this.gap = 12,
  });

  final Widget catalogPane;
  final Widget orderPane;
  final bool hasActiveContent;
  final double sideBySideMinWidth;
  final double sidePaneWidth;
  final double gap;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      if (CashierLayoutPolicy.useSideBySide(
        constraints,
        minWidth: sideBySideMinWidth,
      )) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: catalogPane),
            SizedBox(width: gap),
            SizedBox(width: sidePaneWidth, child: orderPane),
          ],
        );
      }

      final orderPaneHeight = CashierLayoutPolicy.stackedOrderHeight(
        hasActiveContent: hasActiveContent,
      );
      if (!CashierLayoutPolicy.needsOuterScroll(
        constraints,
        orderPaneHeight: orderPaneHeight,
        gap: gap,
      )) {
        return Column(
          children: [
            SizedBox(height: orderPaneHeight, child: orderPane),
            SizedBox(height: gap),
            Expanded(child: catalogPane),
          ],
        );
      }

      // On short phone / split-screen viewports both panes keep their minimum
      // usable height and the workspace itself becomes scrollable. This is
      // preferable to shrinking the order lines behind the payment footer.
      return SingleChildScrollView(
        key: const Key('cashier-responsive-scroll'),
        child: Column(
          children: [
            SizedBox(height: orderPaneHeight, child: orderPane),
            SizedBox(height: gap),
            SizedBox(
              height: CashierLayoutPolicy.scrollableCatalogHeight(constraints),
              child: catalogPane,
            ),
          ],
        ),
      );
    },
  );
}
