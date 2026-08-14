import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/order_models.dart';

abstract interface class OrdersGateway {
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  });

  Future<OrderDetail> getOrder(String orderId);

  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  });

  Future<OrderDetail> addItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required String productId,
    String? variantId,
    required int quantityAmount,
    String? note,
  });

  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  });

  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  });

  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  });

  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  });

  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  });
}

class OrdersApi implements OrdersGateway {
  OrdersApi(this._dio);

  final Dio _dio;

  @override
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  }) async {
    try {
      final response = await _dio.get<Map<String, Object?>>(
        'orders',
        queryParameters: {
          'locationId': locationId,
          'status': ?status?.wireValue,
          'page': page,
          'pageSize': pageSize,
        },
      );
      return OrderListPage.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> getOrder(String orderId) async {
    try {
      final response = await _dio.get<Map<String, Object?>>('orders/$orderId');
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'orders',
        data: {
          'clientOrderId': clientOrderId,
          'locationId': locationId,
          'serviceMode': serviceMode.wireValue,
          'customerNote': ?customerNote,
        },
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> addItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required String productId,
    String? variantId,
    required int quantityAmount,
    String? note,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'orders/$orderId/items',
        data: {
          'mutationId': mutationId,
          'clientItemId': clientItemId,
          'expectedVersion': expectedVersion,
          'productId': productId,
          'variantId': ?variantId,
          'quantityAmount': quantityAmount,
          'note': ?note,
        },
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'orders/$orderId/manual-items',
        data: {
          'mutationId': mutationId,
          'clientItemId': clientItemId,
          'expectedVersion': expectedVersion,
          'amountCents': amountCents,
          'description': ?description,
          'note': ?note,
        },
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) async {
    try {
      final response = await _dio.patch<Map<String, Object?>>(
        'orders/$orderId/items/$itemId',
        data: {
          'mutationId': mutationId,
          'expectedVersion': expectedVersion,
          'quantityAmount': ?quantityAmount,
          'note': ?note,
        },
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    try {
      final response = await _dio.delete<Map<String, Object?>>(
        'orders/$orderId/items/$itemId',
        data: {'mutationId': mutationId, 'expectedVersion': expectedVersion},
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => _transition(
    path: 'orders/$orderId/hold',
    mutationId: mutationId,
    expectedVersion: expectedVersion,
  );

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => _transition(
    path: 'orders/$orderId/resume',
    mutationId: mutationId,
    expectedVersion: expectedVersion,
  );

  Future<OrderDetail> _transition({
    required String path,
    required String mutationId,
    required int expectedVersion,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        path,
        data: {'mutationId': mutationId, 'expectedVersion': expectedVersion},
      );
      return OrderDetail.fromJson(_requireData(response.data));
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Map<String, Object?> _requireData(Map<String, Object?>? data) {
    if (data == null) {
      throw const BackendError(
        message: 'Il backend ha restituito un ordine vuoto.',
      );
    }
    return data;
  }
}
