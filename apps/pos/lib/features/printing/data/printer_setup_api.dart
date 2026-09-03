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
    required int paperWidthMm,
  }) async {
    final normalizedWidth = _normalizePaperWidth(paperWidthMm);
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
          'paperWidthMm': normalizedWidth,
          'charactersPerLine': _charactersPerLine(normalizedWidth),
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
    int? paperWidthMm,
    bool? supportsCut,
  }) async {
    final normalizedWidth = paperWidthMm == null
        ? null
        : _normalizePaperWidth(paperWidthMm);
    try {
      await _dio.patch<Object?>(
        'printers/$printerId',
        data: {
          'agentDeviceId': ?agentDeviceId,
          'name': ?name?.trim(),
          'purpose': ?purpose,
          'status': ?status,
          'paperWidthMm': ?normalizedWidth,
          'charactersPerLine': normalizedWidth == null
              ? null
              : _charactersPerLine(normalizedWidth),
          'supportsCut': ?supportsCut,
        },
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  int _normalizePaperWidth(int value) => value <= 58 ? 58 : 80;

  int _charactersPerLine(int paperWidthMm) => paperWidthMm <= 58 ? 32 : 48;
}
