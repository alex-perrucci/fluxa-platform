import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/refund_models.dart';

class RefundsApi {
  RefundsApi(this._dio);

  final Dio _dio;

  Future<RefundQuote> quote(String paymentId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'payments/$paymentId/refund-quote',
      );
      return RefundQuote.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<RefundOperationResult> create({
    required String paymentId,
    required String clientRefundId,
    required int amountCents,
    required String reason,
    String? providerReference,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'payments/$paymentId/refunds',
        data: {
          'clientRefundId': clientRefundId,
          'amountCents': amountCents,
          'reason': reason,
          if (providerReference != null && providerReference.trim().isNotEmpty)
            'providerReference': providerReference.trim(),
        },
      );
      return RefundOperationResult.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<String> createFiscalVoid({
    required String refundId,
    required String mutationId,
    required String reason,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'payment-refunds/$refundId/fiscal-void',
        data: {'mutationId': mutationId, 'reason': reason},
      );
      final payload = _requireData(response.data);
      return payload['status']?.toString() ?? 'QUEUED';
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Map<String, Object?> _requireData(Map<String, Object?>? data) {
    if (data == null) {
      throw const BackendError(message: 'Risposta rimborso vuota.');
    }
    return data;
  }
}
