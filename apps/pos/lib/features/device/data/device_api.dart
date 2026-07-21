import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../../auth/domain/auth_models.dart';
import '../domain/device_assignment_models.dart';

class DeviceApi {
  DeviceApi(this._dio);

  final Dio _dio;

  Future<DeviceRecord> current() async {
    try {
      final response = await _dio.get<Map<String, Object?>>('devices/me');
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Dispositivo vuoto.');
      }
      return DeviceRecord.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<CurrentDeviceAssignmentContext> currentAssignment() async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'devices/me/assignment',
      );
      final data = response.data;
      if (data == null) {
        throw const BackendError(
          message: 'Contesto operativo del dispositivo vuoto.',
        );
      }
      return CurrentDeviceAssignmentContext.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<DeviceRecord> updateCurrent({
    String? name,
    String? model,
    String? appVersion,
  }) async {
    try {
      final response = await _dio.patch<Map<String, Object?>>(
        'devices/me',
        data: {'name': ?name, 'model': ?model, 'appVersion': ?appVersion},
      );
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Dispositivo vuoto.');
      }
      return DeviceRecord.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }
}
