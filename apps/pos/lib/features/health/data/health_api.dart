import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/health_models.dart';

abstract interface class HealthGateway {
  Future<OperationalHealth> operational({required String locationId});
}

class HealthApi implements HealthGateway {
  HealthApi(this._dio);

  final Dio _dio;

  @override
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
        fiscalEnvironment: result.fiscalEnvironment,
        fiscalEnabled: result.fiscalEnabled,
        fiscalAutoIssueOnPaid: result.fiscalAutoIssueOnPaid,
        fiscalLastDocumentStatus: result.fiscalLastDocumentStatus,
        fiscalErrorCode: result.fiscalErrorCode,
        fiscalErrorMessage: result.fiscalErrorMessage,
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
