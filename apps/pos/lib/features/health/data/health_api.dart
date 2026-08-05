import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/health_models.dart';

class HealthApi {
  HealthApi(this._dio);

  final Dio _dio;

  Future<OperationalHealth> operational({required String locationId}) async {
    final startedAt = DateTime.now();
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'health/operational',
        queryParameters: {'locationId': locationId},
      );
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Diagnostica operativa vuota.');
      }
      final result = OperationalHealth.fromJson(data);
      return OperationalHealth(
        generatedAt: result.generatedAt,
        overallStatus: result.overallStatus,
        apiStatus: result.apiStatus,
        apiLatencyMs: DateTime.now().difference(startedAt).inMilliseconds,
        printerStatus: result.printerStatus,
        printerCount: result.printerCount,
        fiscalStatus: result.fiscalStatus,
        fiscalProvider: result.fiscalProvider,
        paymentStatus: result.paymentStatus,
        paymentProvider: result.paymentProvider,
        lastPrintJob: result.lastPrintJob,
        suggestions: result.suggestions,
        raw: result.raw,
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }
}
