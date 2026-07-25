import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/payment_receipt_print_options.dart';
import '../domain/printing_models.dart';

abstract interface class PrintingGateway {
  Future<PrinterListPage> listPrinters({
    required String locationId,
    PrinterStatus? status,
    int page = 1,
    int pageSize = 100,
  });

  Future<PrintJobPage> listPrintJobs({
    required String locationId,
    String? printerId,
    PrintJobStatus? status,
    int page = 1,
    int pageSize = 100,
  });

  Future<PrintJob> getPrintJob(String jobId);

  Future<PrintRequestResult> requestTestPage({
    required String printerId,
    required String clientRequestId,
    int copies = 1,
  });

  Future<PrintRequestResult> requestOrderReceipt({
    required String orderId,
    required String clientRequestId,
    int copies = 1,
  });

  Future<PaymentReceiptPrintOptions> paymentReceiptOptions(String checkoutId);

  Future<PrintRequestResult> requestPaymentReceipt({
    required String checkoutId,
    required String clientRequestId,
    String? printerId,
    int copies = 1,
  });

  Future<PrintRequestResult> requestKitchenTicket({
    required String ticketId,
    required String clientRequestId,
    int copies = 1,
  });

  Future<PrintJob> retryPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
  });

  Future<PrintJob> cancelPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  });

  Future<PrinterDevice> heartbeat({
    required String printerId,
    String? agentVersion,
    String? statusMessage,
  });

  Future<PrintJob?> claimPrintJob({
    required String printerId,
    int leaseSeconds = 60,
  });

  Future<PrintJob> completePrintJob({
    required String jobId,
    required String leaseToken,
  });

  Future<PrintJob> failPrintJob({
    required String jobId,
    required String leaseToken,
    required String errorMessage,
    bool retryable = true,
  });
}

class PrintingApi implements PrintingGateway {
  PrintingApi(this._dio);

  final Dio _dio;

  @override
  Future<PrinterListPage> listPrinters({
    required String locationId,
    PrinterStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'printers',
        queryParameters: {
          'locationId': locationId,
          'status': ?status?.wireValue,
          'page': page,
          'pageSize': pageSize,
        },
      );
      return PrinterListPage.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJobPage> listPrintJobs({
    required String locationId,
    String? printerId,
    PrintJobStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'print-jobs',
        queryParameters: {
          'locationId': locationId,
          'printerId': ?printerId,
          'status': ?status?.wireValue,
          'page': page,
          'pageSize': pageSize,
        },
      );
      return PrintJobPage.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJob> getPrintJob(String jobId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'print-jobs/$jobId',
      );
      return PrintJob.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintRequestResult> requestTestPage({
    required String printerId,
    required String clientRequestId,
    int copies = 1,
  }) async => _request(
    path: 'printers/$printerId/test',
    clientRequestId: clientRequestId,
    copies: copies,
  );

  @override
  Future<PrintRequestResult> requestOrderReceipt({
    required String orderId,
    required String clientRequestId,
    int copies = 1,
  }) async => _request(
    path: 'orders/$orderId/print-receipt',
    clientRequestId: clientRequestId,
    copies: copies,
  );

  @override
  Future<PaymentReceiptPrintOptions> paymentReceiptOptions(
    String checkoutId,
  ) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'checkouts/$checkoutId/print-options',
      );
      return PaymentReceiptPrintOptions.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintRequestResult> requestPaymentReceipt({
    required String checkoutId,
    required String clientRequestId,
    String? printerId,
    int copies = 1,
  }) async => _request(
    path: 'checkouts/$checkoutId/print-receipt',
    clientRequestId: clientRequestId,
    printerId: printerId,
    copies: copies,
  );

  @override
  Future<PrintRequestResult> requestKitchenTicket({
    required String ticketId,
    required String clientRequestId,
    int copies = 1,
  }) async => _request(
    path: 'kitchen-tickets/$ticketId/reprint',
    clientRequestId: clientRequestId,
    copies: copies,
  );

  @override
  Future<PrintJob> retryPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'print-jobs/$jobId/retry',
        data: {'mutationId': mutationId, 'expectedVersion': expectedVersion},
      );
      return PrintJob.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJob> cancelPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'print-jobs/$jobId/cancel',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'reason': reason,
        },
      );
      return PrintJob.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrinterDevice> heartbeat({
    required String printerId,
    String? agentVersion,
    String? statusMessage,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'printers/$printerId/heartbeat',
        data: {'agentVersion': ?agentVersion, 'statusMessage': ?statusMessage},
      );
      return PrinterDevice.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJob?> claimPrintJob({
    required String printerId,
    int leaseSeconds = 60,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'print-agent/jobs/claim',
        data: {'printerId': printerId, 'leaseSeconds': leaseSeconds},
      );
      final map = _requireMap(response.data);
      final rawJob = map['job'];
      return rawJob is Map
          ? PrintJob.fromJson(Map<String, Object?>.from(rawJob))
          : null;
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJob> completePrintJob({
    required String jobId,
    required String leaseToken,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'print-agent/jobs/$jobId/complete',
        data: {'leaseToken': leaseToken},
      );
      return PrintJob.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<PrintJob> failPrintJob({
    required String jobId,
    required String leaseToken,
    required String errorMessage,
    bool retryable = true,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'print-agent/jobs/$jobId/fail',
        data: {
          'leaseToken': leaseToken,
          'error': errorMessage,
          'retryable': retryable,
        },
      );
      return PrintJob.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<PrintRequestResult> _request({
    required String path,
    required String clientRequestId,
    String? printerId,
    required int copies,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        path,
        data: {
          'clientRequestId': clientRequestId,
          'copies': copies,
          if (printerId != null) 'printerId': printerId,
        },
      );
      return PrintRequestResult.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Map<String, Object?> _requireMap(Object? value) {
    if (value is Map) {
      return Map<String, Object?>.from(value);
    }
    throw const FormatException('Risposta di stampa non valida.');
  }
}
