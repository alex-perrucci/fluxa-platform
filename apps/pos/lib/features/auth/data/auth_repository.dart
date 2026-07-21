import '../../../core/network/token_refresh_coordinator.dart';
import '../../../core/storage/session_store.dart';
import '../../device/data/device_api.dart';
import '../domain/auth_models.dart';
import 'auth_api.dart';

class AuthRepository {
  AuthRepository({
    required AuthApi authApi,
    required DeviceApi deviceApi,
    required SessionStore sessionStore,
    required TokenRefreshCoordinator refreshCoordinator,
  }) : _authApi = authApi,
       _deviceApi = deviceApi,
       _sessionStore = sessionStore,
       _refreshCoordinator = refreshCoordinator;

  final AuthApi _authApi;
  final DeviceApi _deviceApi;
  final SessionStore _sessionStore;
  final TokenRefreshCoordinator _refreshCoordinator;

  Future<AuthSession> login({
    required String email,
    required String password,
    required DeviceIdentity device,
    String? organizationId,
  }) async {
    final tokens = await _authApi.login(
      email: email,
      password: password,
      device: device,
      organizationId: organizationId,
    );
    await _sessionStore.saveTokens(tokens);
    return currentSession();
  }

  Future<AuthSession> currentSession() async {
    final me = await _authApi.me();
    final device = await _deviceApi.current();
    return AuthSession(
      user: me.user,
      device: device,
      availableOrganizations: me.availableOrganizations,
      sessionId: me.sessionId,
      organizationId: me.organizationId,
      membershipId: me.membershipId,
      role: me.role,
    );
  }

  Future<AuthSession> switchOrganization(String organizationId) async {
    await _refreshCoordinator.refresh();
    final refreshToken = _sessionStore.refreshToken;
    if (refreshToken == null) {
      throw StateError('Refresh token assente.');
    }
    final tokens = await _authApi.switchOrganization(
      organizationId,
      refreshToken,
    );
    await _sessionStore.saveTokens(tokens);
    return currentSession();
  }

  Future<AuthSession> updateCurrentDevice({required String name}) async {
    await _deviceApi.updateCurrent(name: name.trim());
    return currentSession();
  }

  Future<void> logout() async {
    try {
      if (_sessionStore.accessToken != null) {
        await _authApi.logout();
      }
    } finally {
      await _sessionStore.clearSession();
    }
  }

  Future<void> clearLocalSession() => _sessionStore.clearSession();
}
