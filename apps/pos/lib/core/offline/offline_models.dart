enum OfflineOperationStatus { queued, syncing, synced, conflict, failed }

enum OfflineOperationKind {
  createOrder,
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
  holdOrder,
  resumeOrder,
  completeCashSale,
  openCheckout,
  createPayment,
  capturePayment,
  fiscalizeOrder,
  dispatchKitchen,
  mutateTable,
}

class OfflineOperation {
  const OfflineOperation({
    required this.id,
    required this.kind,
    required this.status,
    required this.payloadJson,
    required this.createdAt,
    required this.updatedAt,
    required this.attempts,
    required this.nextAttemptAt,
    this.lastError,
  });

  final String id;
  final OfflineOperationKind kind;
  final OfflineOperationStatus status;
  final String payloadJson;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int attempts;
  final DateTime nextAttemptAt;
  final String? lastError;
}
