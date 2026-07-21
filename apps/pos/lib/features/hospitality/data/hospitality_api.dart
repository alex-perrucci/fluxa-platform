import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/hospitality_models.dart';

abstract interface class HospitalityGateway {
  Future<FloorSnapshot> fetchFloor(String locationId);

  Future<TableSessionDetail> getTableSession(String sessionId);

  Future<TableSessionDetail> openTableSession({
    required String clientSessionId,
    required String tableId,
    required int guestCount,
    String? note,
  });

  Future<TableSessionDetail> updateTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required int guestCount,
    required String note,
  });

  Future<TableSessionDetail> attachOrder({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String orderId,
  });

  Future<TableSessionDetail> moveTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String tableId,
  });

  Future<TableSessionDetail> closeTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  });

  Future<TableSessionDetail> cancelTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  });

  Future<List<KitchenStation>> listKitchenStations(String locationId);

  Future<List<KitchenTicketSummary>> listKitchenTickets({
    required String locationId,
    String? stationId,
    KitchenTicketStatus? status,
  });

  Future<KitchenTicketDetail> getKitchenTicket(String ticketId);

  Future<KitchenDispatchBatch> dispatchOrderToKitchen({
    required String orderId,
    required String clientBatchId,
  });

  Future<KitchenTicketDetail> transitionKitchenTicket({
    required String ticketId,
    required String mutationId,
    required int expectedVersion,
    required KitchenTicketStatus nextStatus,
  });
}

class HospitalityApi implements HospitalityGateway {
  HospitalityApi(this._dio);

  final Dio _dio;

  @override
  Future<FloorSnapshot> fetchFloor(String locationId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'floor',
        queryParameters: {'locationId': locationId},
      );
      return FloorSnapshot.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> getTableSession(String sessionId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'table-sessions/$sessionId',
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> openTableSession({
    required String clientSessionId,
    required String tableId,
    required int guestCount,
    String? note,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'table-sessions',
        data: {
          'clientSessionId': clientSessionId,
          'tableId': tableId,
          'guestCount': guestCount,
          'note': ?note,
        },
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> updateTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required int guestCount,
    required String note,
  }) async {
    try {
      final response = await _dio.patch<Map<String, Object?>>(
        'table-sessions/$sessionId',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'guestCount': guestCount,
          'note': note,
        },
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> attachOrder({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String orderId,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'table-sessions/$sessionId/orders',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'orderId': orderId,
        },
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> moveTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String tableId,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'table-sessions/$sessionId/move',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'tableId': tableId,
        },
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<TableSessionDetail> closeTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async => _finishTableSession(
    path: 'table-sessions/$sessionId/close',
    mutationId: mutationId,
    expectedVersion: expectedVersion,
    reason: reason,
  );

  @override
  Future<TableSessionDetail> cancelTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async => _finishTableSession(
    path: 'table-sessions/$sessionId/cancel',
    mutationId: mutationId,
    expectedVersion: expectedVersion,
    reason: reason,
  );

  @override
  Future<List<KitchenStation>> listKitchenStations(String locationId) async {
    try {
      final response = await _dio.get<List<Object?>>(
        'kitchen-stations',
        queryParameters: {'locationId': locationId},
      );
      return _requireList(response.data)
          .map(
            (value) => KitchenStation.fromJson(
              Map<String, Object?>.from(value as Map),
            ),
          )
          .toList(growable: false);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<List<KitchenTicketSummary>> listKitchenTickets({
    required String locationId,
    String? stationId,
    KitchenTicketStatus? status,
  }) async {
    try {
      final response = await _dio.get<List<Object?>>(
        'kitchen-tickets',
        queryParameters: {
          'locationId': locationId,
          'stationId': ?stationId,
          'status': ?status?.wireValue,
        },
      );
      return _requireList(response.data)
          .map(
            (value) => KitchenTicketSummary.fromJson(
              Map<String, Object?>.from(value as Map),
            ),
          )
          .toList(growable: false);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<KitchenTicketDetail> getKitchenTicket(String ticketId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'kitchen-tickets/$ticketId',
      );
      return KitchenTicketDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<KitchenDispatchBatch> dispatchOrderToKitchen({
    required String orderId,
    required String clientBatchId,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'orders/$orderId/kitchen-tickets',
        data: {'clientBatchId': clientBatchId},
      );
      return KitchenDispatchBatch.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<KitchenTicketDetail> transitionKitchenTicket({
    required String ticketId,
    required String mutationId,
    required int expectedVersion,
    required KitchenTicketStatus nextStatus,
  }) async {
    final action = switch (nextStatus) {
      KitchenTicketStatus.inProgress => 'start',
      KitchenTicketStatus.ready => 'ready',
      KitchenTicketStatus.served => 'serve',
      KitchenTicketStatus.cancelled => 'cancel',
      KitchenTicketStatus.queued => throw const BackendError(
        message: 'Non è possibile riportare una comanda in coda.',
      ),
    };
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'kitchen-tickets/$ticketId/$action',
        data: {'mutationId': mutationId, 'expectedVersion': expectedVersion},
      );
      return KitchenTicketDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<TableSessionDetail> _finishTableSession({
    required String path,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        path,
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'reason': ?reason,
        },
      );
      return TableSessionDetail.fromJson(_requireMap(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Map<String, Object?> _requireMap(Map<String, Object?>? data) {
    if (data == null) {
      throw const BackendError(
        message: 'Il backend ha restituito una risposta hospitality vuota.',
      );
    }
    return data;
  }

  List<Object?> _requireList(List<Object?>? data) {
    if (data == null) {
      throw const BackendError(
        message: 'Il backend ha restituito una lista hospitality vuota.',
      );
    }
    return data;
  }
}
