import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/payments/external_terminal_bridge.dart';

void main() {
  test('approved response requires a stable terminal reference', () {
    final approved = TerminalBridgeResult.fromJson({
      'status': 'APPROVED',
      'reference': 'txn-123',
      'eventId': 'event-123',
    });
    final ambiguous = TerminalBridgeResult.fromJson({'status': 'APPROVED'});

    expect(approved.decision, TerminalBridgeDecision.approved);
    expect(approved.providerReference, 'txn-123');
    expect(ambiguous.decision, TerminalBridgeDecision.unknown);
  });

  test('only an explicit decline becomes declined', () {
    expect(
      TerminalBridgeResult.fromJson({'status': 'DECLINED'}).decision,
      TerminalBridgeDecision.declined,
    );
    expect(
      TerminalBridgeResult.fromJson({'status': 'PENDING'}).decision,
      TerminalBridgeDecision.pending,
    );
    expect(
      TerminalBridgeResult.fromJson({'status': 'TIMEOUT'}).decision,
      TerminalBridgeDecision.unknown,
    );
  });
}
