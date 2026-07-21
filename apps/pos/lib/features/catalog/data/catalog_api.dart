import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/catalog_models.dart';

abstract interface class CatalogGateway {
  Future<CatalogSnapshot> fetchCatalog({
    required String locationId,
    String? query,
  });
}

class CatalogApi implements CatalogGateway {
  CatalogApi(this._dio);

  final Dio _dio;

  @override
  Future<CatalogSnapshot> fetchCatalog({
    required String locationId,
    String? query,
  }) async {
    try {
      final normalizedQuery = query?.trim();
      final response = await _dio.get<Map<String, Object?>>(
        'catalog',
        queryParameters: {
          'locationId': locationId,
          if (normalizedQuery != null && normalizedQuery.isNotEmpty)
            'q': normalizedQuery,
        },
      );
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Catalogo vuoto.');
      }
      return CatalogSnapshot.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }
}
