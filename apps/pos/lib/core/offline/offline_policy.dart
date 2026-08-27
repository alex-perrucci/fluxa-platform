import 'offline_models.dart';

class OfflineSafetyPolicy {
  const OfflineSafetyPolicy._();

  static bool isQueueable(OfflineOperationKind kind) => switch (kind) {
    OfflineOperationKind.createOrder ||
    OfflineOperationKind.addOrderItem ||
    OfflineOperationKind.updateOrderItem ||
    OfflineOperationKind.deleteOrderItem ||
    OfflineOperationKind.holdOrder ||
    OfflineOperationKind.resumeOrder ||
    OfflineOperationKind.completeCashSale => true,
    OfflineOperationKind.openCheckout ||
    OfflineOperationKind.createPayment ||
    OfflineOperationKind.capturePayment ||
    OfflineOperationKind.fiscalizeOrder ||
    OfflineOperationKind.dispatchKitchen ||
    OfflineOperationKind.mutateTable => false,
  };

  static Duration retryDelay(int attempts) {
    final exponent = attempts.clamp(0, 6);
    return Duration(seconds: 2 << exponent);
  }
}
