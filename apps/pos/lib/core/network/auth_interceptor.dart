import 'package:dio/dio.dart';

import '../storage/session_store.dart';
import 'backend_error.dart';
import 'token_refresh_coordinator.dart';

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required Dio dio,
    required SessionStore sessionStore,
    required TokenRefreshCoordinator refreshCoordinator,
  }) : _dio = dio,
       _sessionStore = sessionStore,
       _refreshCoordinator = refreshCoordinator;

  final Dio _dio;
  final SessionStore _sessionStore;
  final TokenRefreshCoordinator _refreshCoordinator;

  static const _skipAuthKey = 'skipAuth';
  static const _retriedKey = 'authRetried';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.extra[_skipAuthKey] != true) {
      final token = _sessionStore.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    final shouldRefresh =
        err.response?.statusCode == 401 &&
        request.extra[_skipAuthKey] != true &&
        request.extra[_retriedKey] != true &&
        !_isAuthEndpoint(request.path);
    if (!shouldRefresh) {
      handler.next(err);
      return;
    }

    try {
      final tokens = await _refreshCoordinator.refresh();
      request.extra[_retriedKey] = true;
      request.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      final response = await _dio.fetch<Object?>(request);
      handler.resolve(response);
    } on BackendError {
      handler.next(err);
    }
  }

  bool _isAuthEndpoint(String path) {
    final normalized = path.replaceAll('\\', '/').toLowerCase();
    return normalized.endsWith('auth/login') ||
        normalized.endsWith('auth/refresh') ||
        normalized.endsWith('auth/switch-organization');
  }
}
