import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/offline/offline_models.dart';
import 'package:fluxa_pos/core/offline/offline_policy.dart';

void main() {
  test('queues an atomic offline cash sale but not raw financial mutations', () {
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.createOrder),
      isTrue,
    );
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.addOrderItem),
      isTrue,
    );
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.completeCashSale),
      isTrue,
    );
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.createPayment),
      isFalse,
    );
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.capturePayment),
      isFalse,
    );
    expect(
      OfflineSafetyPolicy.isQueueable(OfflineOperationKind.fiscalizeOrder),
      isFalse,
    );
  });

  test('retry delay grows with a bounded exponential backoff', () {
    expect(OfflineSafetyPolicy.retryDelay(0), const Duration(seconds: 2));
    expect(OfflineSafetyPolicy.retryDelay(1), const Duration(seconds: 4));
    expect(OfflineSafetyPolicy.retryDelay(6), const Duration(seconds: 128));
    expect(OfflineSafetyPolicy.retryDelay(20), const Duration(seconds: 128));
  });
}
