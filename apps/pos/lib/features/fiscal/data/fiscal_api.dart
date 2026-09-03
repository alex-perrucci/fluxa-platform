import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/fiscal_models.dart';
import '../domain/fiscal_receipt_layout.dart';

class FiscalReceiptPdfData {
  const FiscalReceiptPdfData({required this.bytes, required this.filename});

  final Uint8List bytes;
  final String filename;
}

abstract interface class FiscalGateway {
  Future<FiscalDocumentPage> listDocuments({
    required String locationId,
    FiscalDocumentType? type,
    FiscalDocumentStatus? status,
    int page = 1,
    int pageSize = 100,
  });

  Future<FiscalDocument> getDocument(String documentId);

  Future<FiscalReceiptPdfData> downloadReceiptPdf(String documentId);

  Future<FiscalReceiptLayoutData> downloadReceiptLayout(String documentId);

  Future<FiscalDocument> issue({
    required String orderId,
    required String clientRequestId,
    String? lotteryCode,
  });

  Future<FiscalDocument> retry({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
  });

  Future<FiscalDocument> voidDocument({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  });
}

class FiscalApi implements FiscalGateway {
  FiscalApi(this._dio);
  final Dio _dio;

  @override
  Future<FiscalDocumentPage> listDocuments({
    required String locationId,
    FiscalDocumentType? type,
    FiscalDocumentStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async {
    try {
      final response = await _dio.get<Object?>(
        'fiscal-documents',
        queryParameters: {
          'locationId': locationId,
          'type': ?type?.wireValue,
          'status': ?status?.wireValue,
          'page': page,
          'pageSize': pageSize,
        },
      );
      return FiscalDocumentPage.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalDocument> getDocument(String documentId) async {
    try {
      final response = await _dio.get<Object?>('fiscal-documents/$documentId');
      return FiscalDocument.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalReceiptPdfData> downloadReceiptPdf(String documentId) async {
    try {
      final response = await _dio.get<List<int>>(
        'fiscal-documents/$documentId/receipt.pdf',
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = response.data;
      if (bytes == null || bytes.isEmpty) {
        throw const BackendError(message: 'PDF fiscale vuoto.');
      }
      final disposition = response.headers.value('content-disposition');
      final filename =
          _filenameFromDisposition(disposition) ??
          'scontrino-fiscale-$documentId.pdf';
      return FiscalReceiptPdfData(
        bytes: Uint8List.fromList(bytes),
        filename: filename,
      );
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalReceiptLayoutData> downloadReceiptLayout(
    String documentId,
  ) async {
    try {
      final response = await _dio.get<Object?>(
        'fiscal-documents/$documentId/receipt-layout',
      );
      return FiscalReceiptLayoutData.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalDocument> issue({
    required String orderId,
    required String clientRequestId,
    String? lotteryCode,
  }) async {
    try {
      final response = await _dio.post<Object?>(
        'orders/$orderId/fiscalize',
        data: {'clientRequestId': clientRequestId, 'lotteryCode': ?lotteryCode},
      );
      return FiscalDocument.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalDocument> retry({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    try {
      final response = await _dio.post<Object?>(
        'fiscal-documents/$documentId/retry',
        data: {'mutationId': mutationId, 'expectedVersion': expectedVersion},
      );
      return FiscalDocument.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<FiscalDocument> voidDocument({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) async {
    try {
      final response = await _dio.post<Object?>(
        'fiscal-documents/$documentId/void',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'reason': reason,
        },
      );
      return FiscalDocument.fromJson(_map(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  String? _filenameFromDisposition(String? value) {
    if (value == null || value.isEmpty) return null;
    final match = RegExp(
      r'filename="?([^";]+)"?',
      caseSensitive: false,
    ).firstMatch(value);
    return match?.group(1)?.trim();
  }

  Map<String, Object?> _map(Object? value) {
    if (value is! Map) {
      throw const BackendError(
        message: 'Il backend fiscale ha restituito una risposta vuota.',
      );
    }
    return Map<String, Object?>.from(value);
  }
}
