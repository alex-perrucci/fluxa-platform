import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../platform/fiscal_receipt_esc_pos_formatter.dart';

class FiscalReceiptContextApi {
  const FiscalReceiptContextApi(this._dio);

  final Dio _dio;

  Future<FiscalReceiptHeader> getHeader(String locationId) async {
    try {
      final response = await _dio.get<Object?>('locations/$locationId');
      final data = response.data;
      if (data is! Map) {
        throw const BackendError(
          message: 'Dati del punto vendita non disponibili per lo scontrino.',
        );
      }
      final json = Map<String, Object?>.from(data);
      return FiscalReceiptHeader(
        locationName: _required(json, 'name'),
        merchantLegalName: _required(json, 'merchantLegalName'),
        addressLine1: _required(json, 'addressLine1'),
        addressLine2: _optional(json['addressLine2']),
        postalCode: _required(json, 'postalCode'),
        city: _required(json, 'city'),
        province: _optional(json['province']),
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  String _required(Map<String, Object?> json, String key) {
    final value = json[key]?.toString().trim();
    if (value == null || value.isEmpty) {
      throw BackendError(
        message: 'Dato $key mancante per lo scontrino fiscale.',
      );
    }
    return value;
  }

  String? _optional(Object? value) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty ? null : text;
  }
}
