import 'package:dio/dio.dart';

import '../config/app_config.dart';

enum TerminalBridgeDecision { approved, declined, pending, unknown }

class TerminalBridgeResult {
  const TerminalBridgeResult({
    required this.decision,
    this.providerReference,
    this.providerEventId,
    this.message,
  });

  factory TerminalBridgeResult.fromJson(Map<String, Object?> json) {
    final status = json['status']?.toString().trim().toUpperCase();
    final reference = _optionalString(json['reference']);
    final eventId = _optionalString(json['eventId']);
    final message = _optionalString(json['message']);

    return switch (status) {
      'APPROVED' when reference != null => TerminalBridgeResult(
          decision: TerminalBridgeDecision.approved,
          providerReference: reference,
          providerEventId: eventId,
          message: message,
        ),
      'DECLINED' => TerminalBridgeResult(
          decision: TerminalBridgeDecision.declined,
          providerReference: reference,
          providerEventId: eventId,
          message: message,
        ),
      'PENDING' => TerminalBridgeResult(
          decision: TerminalBridgeDecision.pending,
          providerReference: reference,
          providerEventId: eventId,
          message: message,
        ),
      _ => TerminalBridgeResult(
          decision: TerminalBridgeDecision.unknown,
          providerReference: reference,
          providerEventId: eventId,
          message: message,
        ),
    };
  }

  final TerminalBridgeDecision decision;
  final String? providerReference;
  final String? providerEventId;
  final String? message;

  static const unknown = TerminalBridgeResult(
    decision: TerminalBridgeDecision.unknown,
  );
}

abstract interface class TerminalBridgeGateway {
  bool get isEnabled;

  Future<bool> preflight();

  Future<TerminalBridgeResult> startPayment({
    required String paymentId,
    required int amountCents,
    required String currency,
  });

  Future<TerminalBridgeResult> verifyPayment(String paymentId);
}

class ExternalTerminalBridge implements TerminalBridgeGateway {
  ExternalTerminalBridge({required AppConfig config, Dio? dio})
      : _baseUrl = config.terminalBridgeUrl,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: config.terminalBridgeDioBaseUrl,
                connectTimeout: config.terminalBridgeTimeout,
                receiveTimeout: config.terminalBridgeTimeout,
                sendTimeout: config.terminalBridgeTimeout,
                headers: const {'content-type': 'application/json'},
              ),
            );

  final String? _baseUrl;
  final Dio _dio;

  @override
  bool get isEnabled => _baseUrl != null;

  @override
  Future<bool> preflight() async {
    if (!isEnabled) return false;
    try {
      final response = await _dio.get<Object?>('health');
      return response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300;
    } on DioException {
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<TerminalBridgeResult> startPayment({
    required String paymentId,
    required int amountCents,
    required String currency,
  }) async {
    if (!isEnabled) return TerminalBridgeResult.unknown;
    try {
      final response = await _dio.post<Object?>(
        'payments',
        data: {
          'paymentId': paymentId,
          'amountCents': amountCents,
          'currency': currency.toUpperCase(),
        },
      );
      return _parseResponse(response.data);
    } on DioException {
      // Once the request may have reached the terminal, transport ambiguity is
      // never translated to a decline and never causes a second charge.
      return TerminalBridgeResult.unknown;
    } catch (_) {
      return TerminalBridgeResult.unknown;
    }
  }

  @override
  Future<TerminalBridgeResult> verifyPayment(String paymentId) async {
    if (!isEnabled) return TerminalBridgeResult.unknown;
    try {
      final response = await _dio.get<Object?>('payments/$paymentId');
      return _parseResponse(response.data);
    } on DioException {
      return TerminalBridgeResult.unknown;
    } catch (_) {
      return TerminalBridgeResult.unknown;
    }
  }

  TerminalBridgeResult _parseResponse(Object? data) {
    if (data is Map) {
      return TerminalBridgeResult.fromJson(Map<String, Object?>.from(data));
    }
    return TerminalBridgeResult.unknown;
  }
}

extension NullableTerminalBridgeGateway on TerminalBridgeGateway? {
  Future<TerminalBridgeResult> startPayment({
    required String paymentId,
    required int amountCents,
    required String currency,
  }) {
    final bridge = this;
    if (bridge == null) {
      return Future.value(TerminalBridgeResult.unknown);
    }
    return bridge.startPayment(
      paymentId: paymentId,
      amountCents: amountCents,
      currency: currency,
    );
  }
}

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
