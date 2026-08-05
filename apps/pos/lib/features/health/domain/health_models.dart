import 'dart:convert';

enum HealthStatus {
  ok('OK'),
  degraded('DEGRADED'),
  down('DOWN'),
  notConfigured('NOT_CONFIGURED'),
  unknown('UNKNOWN');

  const HealthStatus(this.wireValue);
  final String wireValue;

  static HealthStatus fromWire(Object? value) => values.firstWhere(
    (item) => item.wireValue == value?.toString(),
    orElse: () => HealthStatus.unknown,
  );
}

class OperationalHealth {
  const OperationalHealth({
    required this.generatedAt,
    required this.overallStatus,
    required this.apiStatus,
    required this.apiLatencyMs,
    required this.printerStatus,
    required this.printerCount,
    required this.fiscalStatus,
    required this.fiscalProvider,
    required this.paymentStatus,
    required this.paymentProvider,
    required this.lastPrintJob,
    required this.suggestions,
    required this.raw,
  });

  factory OperationalHealth.fromJson(Map<String, Object?> json) {
    final api = Map<String, Object?>.from(json['api']! as Map);
    final printers = Map<String, Object?>.from(json['printers']! as Map);
    final fiscal = Map<String, Object?>.from(json['fiscal']! as Map);
    final payment = Map<String, Object?>.from(
      json['paymentTerminal']! as Map,
    );
    final rawItems = printers['items'] as List? ?? const [];
    final rawSuggestions = json['suggestions'] as List? ?? const [];
    final lastJob = printers['lastJob'];
    return OperationalHealth(
      generatedAt: DateTime.parse(json['generatedAt']! as String),
      overallStatus: HealthStatus.fromWire(json['overallStatus']),
      apiStatus: HealthStatus.fromWire(api['status']),
      apiLatencyMs: (api['latencyMs'] as num?)?.toInt() ?? 0,
      printerStatus: HealthStatus.fromWire(printers['status']),
      printerCount: rawItems.length,
      fiscalStatus: HealthStatus.fromWire(fiscal['status']),
      fiscalProvider: fiscal['provider']?.toString(),
      paymentStatus: HealthStatus.fromWire(payment['status']),
      paymentProvider: payment['provider']?.toString(),
      lastPrintJob: lastJob is Map
          ? Map<String, Object?>.from(lastJob)
          : null,
      suggestions: rawSuggestions.map((item) => item.toString()).toList(),
      raw: Map<String, Object?>.from(json),
    );
  }

  final DateTime generatedAt;
  final HealthStatus overallStatus;
  final HealthStatus apiStatus;
  final int apiLatencyMs;
  final HealthStatus printerStatus;
  final int printerCount;
  final HealthStatus fiscalStatus;
  final String? fiscalProvider;
  final HealthStatus paymentStatus;
  final String? paymentProvider;
  final Map<String, Object?>? lastPrintJob;
  final List<String> suggestions;
  final Map<String, Object?> raw;

  String exportJson({required bool networkOnline}) =>
      const JsonEncoder.withIndent('  ').convert({
        ...raw,
        'client': {
          'networkOnline': networkOnline,
          'exportedAt': DateTime.now().toUtc().toIso8601String(),
        },
      });
}
