import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';

class PrinterSetupApi {
  const PrinterSetupApi(this._dio);

  final Dio _dio;

  Future<void> create({
    required String locationId,
    required String agentDeviceId,
    required String code,
    required String name,
    required String purpose,
  }) async {
    try {
      await _dio.post<Object?>(
        'printers',
        data: {
          'locationId': locationId,
          'agentDeviceId': agentDeviceId,
          'code': code.trim().toUpperCase(),
          'name': name.trim(),
          'purpose': purpose,
          'driver': 'ESC_POS_TEXT',
          'paperWidthMm': 80,
          'charactersPerLine': 48,
          'supportsCut': true,
          'supportsDrawer': false,
        },
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<void> update(
    String printerId, {
    String? agentDeviceId,
    String? name,
    String? purpose,
    String? status,
  }) async {
    try {
      await _dio.patch<Object?>(
        'printers/$printerId',
        data: {
          'agentDeviceId': ?agentDeviceId,
          'name': ?name?.trim(),
          'purpose': ?purpose,
          'status': ?status,
        },
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }
}
