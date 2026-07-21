import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/payment_models.dart';

abstract interface class PaymentsGateway {
  Future<CheckoutListPage> listCheckouts({
    required String locationId,
    CheckoutStatus? status,
    int page = 1,
    int pageSize = 25,
  });

  Future<CheckoutSession> getCheckout(String checkoutId);

  Future<PaymentRecord> getPayment(String paymentId);

  Future<CheckoutSession> openCheckout({
    required String clientCheckoutId,
    required String orderId,
    required int expectedOrderVersion,
  });

  Future<PaymentOperationResult> createPayment({
    required String checkoutId,
    required String clientPaymentId,
    required PaymentMethod method,
    required PaymentProvider provider,
    required int amountCents,
    int? tenderedCents,
  });

  Future<PaymentOperationResult> capturePayment({
    required String paymentId,
    required String mutationId,
    required String providerReference,
    String? providerEventId,
  });

  Future<PaymentOperationResult> failPayment({
    required String paymentId,
    required String mutationId,
    required String failureCode,
    String? failureMessage,
    String? providerEventId,
  });

  Future<PaymentOperationResult> cancelPayment({
    required String paymentId,
    required String mutationId,
    String? reason,
  });

  Future<CheckoutSession> cancelCheckout({
    required String checkoutId,
    required String mutationId,
    required String reason,
  });
}

class PaymentsApi implements PaymentsGateway {
  PaymentsApi(this._dio);

  final Dio _dio;

  @override
  Future<CheckoutListPage> listCheckouts({
    required String locationId,
    CheckoutStatus? status,
    int page = 1,
    int pageSize = 25,
  }) async {
    final query = <String, Object?>{
      'locationId': locationId,
      'page': page,
      'pageSize': pageSize,
    };
    if (status != null) {
      query['status'] = status.wireValue;
    }
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'checkouts',
        queryParameters: query,
      );
      return CheckoutListPage.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<CheckoutSession> getCheckout(String checkoutId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'checkouts/$checkoutId',
      );
      return CheckoutSession.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PaymentRecord> getPayment(String paymentId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'payments/$paymentId',
      );
      return PaymentRecord.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<CheckoutSession> openCheckout({
    required String clientCheckoutId,
    required String orderId,
    required int expectedOrderVersion,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'checkouts',
        data: {
          'clientCheckoutId': clientCheckoutId,
          'orderId': orderId,
          'expectedOrderVersion': expectedOrderVersion,
        },
      );
      return CheckoutSession.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PaymentOperationResult> createPayment({
    required String checkoutId,
    required String clientPaymentId,
    required PaymentMethod method,
    required PaymentProvider provider,
    required int amountCents,
    int? tenderedCents,
  }) async {
    final body = <String, Object?>{
      'clientPaymentId': clientPaymentId,
      'method': method.wireValue,
      'provider': provider.wireValue,
      'amountCents': amountCents,
    };
    if (tenderedCents != null) {
      body['tenderedCents'] = tenderedCents;
    }
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'checkouts/$checkoutId/payments',
        data: body,
      );
      return PaymentOperationResult.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PaymentOperationResult> capturePayment({
    required String paymentId,
    required String mutationId,
    required String providerReference,
    String? providerEventId,
  }) async {
    final body = <String, Object?>{
      'mutationId': mutationId,
      'providerReference': providerReference,
    };
    if (providerEventId != null && providerEventId.trim().isNotEmpty) {
      body['providerEventId'] = providerEventId.trim();
    }
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'payments/$paymentId/capture',
        data: body,
      );
      return PaymentOperationResult.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PaymentOperationResult> failPayment({
    required String paymentId,
    required String mutationId,
    required String failureCode,
    String? failureMessage,
    String? providerEventId,
  }) async {
    final body = <String, Object?>{
      'mutationId': mutationId,
      'failureCode': failureCode,
    };
    if (failureMessage != null && failureMessage.trim().isNotEmpty) {
      body['failureMessage'] = failureMessage.trim();
    }
    if (providerEventId != null && providerEventId.trim().isNotEmpty) {
      body['providerEventId'] = providerEventId.trim();
    }
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'payments/$paymentId/fail',
        data: body,
      );
      return PaymentOperationResult.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PaymentOperationResult> cancelPayment({
    required String paymentId,
    required String mutationId,
    String? reason,
  }) async {
    final body = <String, Object?>{'mutationId': mutationId};
    if (reason != null && reason.trim().isNotEmpty) {
      body['reason'] = reason.trim();
    }
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'payments/$paymentId/cancel',
        data: body,
      );
      return PaymentOperationResult.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<CheckoutSession> cancelCheckout({
    required String checkoutId,
    required String mutationId,
    required String reason,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'checkouts/$checkoutId/cancel',
        data: {'mutationId': mutationId, 'reason': reason},
      );
      return CheckoutSession.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Map<String, Object?> _requireData(Map<String, Object?>? data) {
    if (data == null) {
      throw const BackendError(message: 'Risposta pagamenti vuota.');
    }
    return data;
  }
}
