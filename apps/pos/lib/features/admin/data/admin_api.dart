import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';

class AdminApi {
  AdminApi(this._dio);

  final Dio _dio;

  Future<List<Map<String, Object?>>> list(
    String path, {
    Map<String, Object?>? queryParameters,
  }) async {
    try {
      final response = await _dio.get<Object?>(
        path,
        queryParameters: queryParameters,
      );
      return _asList(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<Map<String, Object?>> get(String path) async {
    try {
      final response = await _dio.get<Object?>(path);
      return _asMap(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<Map<String, Object?>> post(
    String path, {
    Map<String, Object?> data = const {},
  }) async {
    try {
      final response = await _dio.post<Object?>(path, data: data);
      return _asMap(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<Map<String, Object?>> put(
    String path, {
    Map<String, Object?> data = const {},
  }) async {
    try {
      final response = await _dio.put<Object?>(path, data: data);
      return _asMap(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<Map<String, Object?>> patch(
    String path, {
    Map<String, Object?> data = const {},
  }) async {
    try {
      final response = await _dio.patch<Object?>(path, data: data);
      return _asMap(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  List<Map<String, Object?>> _asList(Object? data) {
    final raw = switch (data) {
      final List<Object?> values => values,
      final Map<Object?, Object?> map when map['items'] is List =>
        map['items']! as List,
      _ => const <Object?>[],
    };
    return raw
        .whereType<Map>()
        .map((value) => Map<String, Object?>.from(value))
        .toList(growable: false);
  }

  Map<String, Object?> _asMap(Object? data) {
    if (data == null) {
      return const {};
    }
    if (data is Map) {
      return Map<String, Object?>.from(data);
    }
    throw const BackendError(
      message:
          'Il backend ha restituito una risposta amministrativa non valida.',
    );
  }
}
