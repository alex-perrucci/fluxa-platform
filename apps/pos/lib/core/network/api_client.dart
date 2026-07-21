import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/session_store.dart';
import 'auth_interceptor.dart';
import 'session_expiry_bus.dart';
import 'token_refresh_coordinator.dart';

class ApiClient {
  ApiClient({
    required AppConfig config,
    required SessionStore sessionStore,
    required SessionExpiryBus expiryBus,
  }) {
    final options = BaseOptions(
      baseUrl: config.dioBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      sendTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      headers: const {'Accept': 'application/json'},
      contentType: Headers.jsonContentType,
    );
    rawDio = Dio(options);
    dio = Dio(options);
    refreshCoordinator = TokenRefreshCoordinator(
      refreshDio: rawDio,
      sessionStore: sessionStore,
      expiryBus: expiryBus,
    );
    dio.interceptors.add(
      AuthInterceptor(
        dio: dio,
        sessionStore: sessionStore,
        refreshCoordinator: refreshCoordinator,
      ),
    );
  }

  late final Dio dio;
  late final Dio rawDio;
  late final TokenRefreshCoordinator refreshCoordinator;
}
