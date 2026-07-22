import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

class AppErrorReporter {
  const AppErrorReporter._();

  static void record(
    Object error,
    StackTrace stackTrace, {
    required String source,
  }) {
    developer.log(
      redactForDiagnostics(error.toString()),
      name: 'fluxa.$source',
      error: kDebugMode ? error : null,
      stackTrace: stackTrace,
      level: 1000,
    );
  }

  static void recordFlutter(FlutterErrorDetails details) {
    record(
      details.exception,
      details.stack ?? StackTrace.current,
      source: details.library ?? 'flutter',
    );
  }

  static String redactForDiagnostics(String value) {
    final withoutBearer = value.replaceAll(
      RegExp(r'Bearer\s+[A-Za-z0-9._~+/-]+=*', caseSensitive: false),
      'Bearer [REDACTED]',
    );
    final withoutJwt = withoutBearer.replaceAll(
      RegExp(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),
      '[JWT_REDACTED]',
    );
    return withoutJwt.replaceAllMapped(
      RegExp(r'([?&](?:token|secret|password)=)[^&\s]+', caseSensitive: false),
      (match) => '${match.group(1)}[REDACTED]',
    );
  }
}
