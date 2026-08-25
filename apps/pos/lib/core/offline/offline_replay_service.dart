import 'dart:convert';

import 'package:dio/dio.dart';

import '../network/backend_error.dart';
import 'offline_models.dart';
import 'offline_sync_controller.dart';

class OfflineReplayService {
  const OfflineReplayService(this._dio);

  final Dio _dio;

  Future<void> call(OfflineOperation operation) async {
    final decoded = jsonDecode(operation.payloadJson);
    if (decoded is! Map) {
      throw const FormatException('Payload offline non valido.');
    }
    final payload = Map<String, Object?>.from(decoded);

    try {
      if (operation.kind == OfflineOperationKind.completeCashSale) {
        await _dio.post<Object?>('offline-sales/replay', data: payload);
        return;
      }

      final method = payload['method']?.toString().toUpperCase();
      final path = payload['path']?.toString();
      final data = payload['data'];
      if (path == null || path.isEmpty || method == null) {
        throw const FormatException('Metodo o percorso offline mancante.');
      }
      await _dio.request<Object?>(
        path,
        data: data,
        options: Options(method: method),
      );
    } on DioException catch (error) {
      final backend = BackendError.fromDioException(error);
      if (error.response?.statusCode == 409) {
        throw OfflineConflictException(backend.message);
      }
      rethrow;
    }
  }
}
