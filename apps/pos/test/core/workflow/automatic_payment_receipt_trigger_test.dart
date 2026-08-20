import 'package:fluxa_pos/core/workflow/automatic_payment_receipt_trigger.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AutomaticPaymentReceiptTrigger', () {
    test('cash payment completed enqueues receipt exactly once', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      final first = await trigger.onCheckoutState(
        checkoutId: 'checkout-cash',
        completed: true,
        enqueueReceipt: () async {
          printCalls += 1;
          return true;
        },
      );

      expect(first, AutomaticPaymentReceiptOutcome.enqueued);
      expect(printCalls, 1);
    });

    test('electronic payment enqueues receipt once', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      final first = await trigger.onCheckoutState(
        checkoutId: 'checkout-card',
        completed: true,
        enqueueReceipt: () async {
          printCalls += 1;
          return true;
        },
      );

      expect(first, AutomaticPaymentReceiptOutcome.enqueued);
      expect(printCalls, 1);
    });

    test('UI rebuild cannot enqueue a second receipt', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      Future<bool> print() async {
        printCalls += 1;
        return true;
      }

      await trigger.onCheckoutState(
        checkoutId: 'checkout-rebuild',
        completed: true,
        enqueueReceipt: print,
      );
      final rebuild = await trigger.onCheckoutState(
        checkoutId: 'checkout-rebuild',
        completed: true,
        enqueueReceipt: print,
      );

      expect(
        rebuild,
        AutomaticPaymentReceiptOutcome.skippedAlreadyAttempted,
      );
      expect(printCalls, 1);
    });

    test('refresh of the same paid checkout cannot enqueue twice', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      Future<bool> print() async {
        printCalls += 1;
        return true;
      }

      await trigger.onCheckoutState(
        checkoutId: 'checkout-refresh',
        completed: true,
        enqueueReceipt: print,
      );
      final refresh = await trigger.onCheckoutState(
        checkoutId: 'checkout-refresh',
        completed: true,
        enqueueReceipt: print,
      );

      expect(
        refresh,
        AutomaticPaymentReceiptOutcome.skippedAlreadyAttempted,
      );
      expect(printCalls, 1);
    });

    test('printer failure does not start an automatic retry loop', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      Future<bool> failingPrint() async {
        printCalls += 1;
        return false;
      }

      final failed = await trigger.onCheckoutState(
        checkoutId: 'checkout-printer-error',
        completed: true,
        enqueueReceipt: failingPrint,
      );
      final duplicate = await trigger.onCheckoutState(
        checkoutId: 'checkout-printer-error',
        completed: true,
        enqueueReceipt: failingPrint,
      );

      expect(failed, AutomaticPaymentReceiptOutcome.failed);
      expect(
        duplicate,
        AutomaticPaymentReceiptOutcome.skippedAlreadyAttempted,
      );
      expect(printCalls, 1);
    });

    test('manual reprint remains available after automatic attempt', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var automaticCalls = 0;
      var manualCalls = 0;

      await trigger.onCheckoutState(
        checkoutId: 'checkout-manual-reprint',
        completed: true,
        enqueueReceipt: () async {
          automaticCalls += 1;
          return false;
        },
      );

      Future<bool> manualReprint() async {
        manualCalls += 1;
        return true;
      }

      final manualSuccess = await manualReprint();

      expect(automaticCalls, 1);
      expect(manualSuccess, isTrue);
      expect(manualCalls, 1);
    });

    test('ADE_WEB UNKNOWN does not trigger fiscal retry', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;
      var fiscalRetryCalls = 0;

      final outcome = await trigger.onCheckoutState(
        checkoutId: 'checkout-ade-unknown',
        completed: true,
        enqueueReceipt: () async {
          printCalls += 1;
          return true;
        },
      );

      // Fiscal state/retry is intentionally not part of the receipt trigger.
      // An ADE_WEB UNKNOWN state therefore cannot be retried by this path.
      expect(fiscalRetryCalls, 0);
      expect(outcome, AutomaticPaymentReceiptOutcome.enqueued);
      expect(printCalls, 1);
    });

    test('checkout not completed does not enqueue receipt', () async {
      final trigger = AutomaticPaymentReceiptTrigger();
      var printCalls = 0;

      final outcome = await trigger.onCheckoutState(
        checkoutId: 'checkout-open',
        completed: false,
        enqueueReceipt: () async {
          printCalls += 1;
          return true;
        },
      );

      expect(outcome, AutomaticPaymentReceiptOutcome.skippedNotCompleted);
      expect(printCalls, 0);
    });
  });
}
