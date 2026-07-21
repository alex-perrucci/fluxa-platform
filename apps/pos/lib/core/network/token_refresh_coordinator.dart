import 'package:dio/dio.dart';

import '../../features/auth/domain/auth_models.dart';
import '../storage/session_store.dart';
import 'backend_error.dart';
import 'session_expiry_bus.dart';

class TokenRefreshCoordinator {
  TokenRefreshCoordinator({
    required Dio refreshDio,
    required SessionStore sessionStore,
    required SessionExpiryBus expiryBus,
  }) : _refreshDio = refreshDio,
       _sessionStore = sessionStore,
       _expiryBus = expiryBus;

  final Dio _refreshDio;
  final SessionStore _sessionStore;
  final SessionExpiryBus _expiryBus;
  Future<TokenPair>? _inFlight;

  Future<TokenPair> refresh() {
    final active = _inFlight;
    if (active != null) {
      return active;
    }
    final future = _refreshInternal();
    _inFlight = future;
    return future.whenComplete(() {
      if (identical(_inFlight, future)) _inFlight = null;
    });
  }

  Future<TokenPair> _refreshInternal() async {
    final refreshToken = _sessionStore.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      await _expire();
      throw const BackendError(
        code: 'MISSING_REFRESH_TOKEN',
        message: 'La sessione locale non contiene un refresh token.',
        statusCode: 401,
      );
    }
    try {
      final response = await _refreshDio.post<Map<String, Object?>>(
        'auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = response.data;
      if (data == null || data['tokens'] is! Map) {
        throw const BackendError(
          code: 'INVALID_REFRESH_RESPONSE',
          message: 'La risposta di refresh non contiene i token attesi.',
        );
      }
      final tokens = TokenPair.fromJson(
        Map<String, Object?>.from(data['tokens']! as Map),
      );
      await _sessionStore.saveTokens(tokens);
      return tokens;
    } on DioException catch (error) {
      await _expire();
      throw BackendError.fromDioException(error);
    } on BackendError {
      await _expire();
      rethrow;
    }
  }

  Future<void> _expire() async {
    await _sessionStore.clearSession();
    _expiryBus.publish();
  }
}
