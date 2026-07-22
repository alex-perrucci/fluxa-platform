import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/diagnostics/app_error_reporter.dart';

void main() {
  test('redacts bearer tokens, JWTs and secret query values', () {
    const input =
        'Bearer abc.def.ghi token=visible eyJheader.payload.signature &password=hunter2';
    final output = AppErrorReporter.redactForDiagnostics(input);
    expect(output, isNot(contains('hunter2')));
    expect(output, isNot(contains('eyJheader.payload.signature')));
    expect(output, contains('[REDACTED]'));
  });
}
