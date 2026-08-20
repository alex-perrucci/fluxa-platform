enum AutomaticPaymentReceiptOutcome {
  skippedNotCompleted,
  skippedAlreadyAttempted,
  enqueued,
  failed,
}

/// Guards the automatic payment-receipt side effect.
///
/// It deliberately does not print anything itself: the caller supplies the
/// existing printing infrastructure callback. A checkout consumes at most one
/// automatic attempt, including failed attempts, so UI rebuilds, refreshes and
/// duplicate completion callbacks cannot create print loops. Manual reprints
/// remain outside this guard.
class AutomaticPaymentReceiptTrigger {
  final Set<String> _attemptedCheckoutIds = <String>{};

  bool hasAttempted(String checkoutId) =>
      _attemptedCheckoutIds.contains(checkoutId);

  Future<AutomaticPaymentReceiptOutcome> onCheckoutState({
    required String checkoutId,
    required bool completed,
    required Future<bool> Function() enqueueReceipt,
  }) async {
    if (!completed) {
      return AutomaticPaymentReceiptOutcome.skippedNotCompleted;
    }
    if (!_attemptedCheckoutIds.add(checkoutId)) {
      return AutomaticPaymentReceiptOutcome.skippedAlreadyAttempted;
    }

    final enqueued = await enqueueReceipt();
    return enqueued
        ? AutomaticPaymentReceiptOutcome.enqueued
        : AutomaticPaymentReceiptOutcome.failed;
  }
}
