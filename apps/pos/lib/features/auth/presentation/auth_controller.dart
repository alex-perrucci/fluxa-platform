import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../../core/network/session_expiry_bus.dart';
import '../../../core/platform/installation_identity.dart';
import '../../../core/storage/session_store.dart';
import '../data/auth_repository.dart';
import '../domain/auth_models.dart';

enum AuthStatus {
  bootstrapping,
  unauthenticated,
  organizationRequired,
  authenticated,
}

class AuthState {
  const AuthState({
    required this.status,
    this.session,
    this.pendingOrganizations = const [],
    this.busy = false,
    this.errorMessage,
  });

  const AuthState.bootstrapping() : this(status: AuthStatus.bootstrapping);
  const AuthState.unauthenticated({String? errorMessage})
    : this(status: AuthStatus.unauthenticated, errorMessage: errorMessage);

  final AuthStatus status;
  final AuthSession? session;
  final List<OrganizationMembership> pendingOrganizations;
  final bool busy;
  final String? errorMessage;
}

class AuthController extends ChangeNotifier {
  AuthController({
    required AuthRepository repository,
    required InstallationIdentityService installationIdentity,
    required SessionStore sessionStore,
    required SessionExpiryBus expiryBus,
  }) : _repository = repository,
       _installationIdentity = installationIdentity,
       _sessionStore = sessionStore {
    _expirySubscription = expiryBus.stream.listen((_) {
      _pendingLogin = null;
      state = const AuthState.unauthenticated(
        errorMessage: 'La sessione è scaduta. Accedi nuovamente.',
      );
    });
  }

  final AuthRepository _repository;
  final InstallationIdentityService _installationIdentity;
  final SessionStore _sessionStore;
  late final StreamSubscription<void> _expirySubscription;
  _PendingLogin? _pendingLogin;
  AuthState _state = const AuthState.bootstrapping();

  AuthState get state => _state;
  set state(AuthState value) {
    _state = value;
    notifyListeners();
  }

  Future<void> bootstrap() async {
    if (!_sessionStore.hasSession) {
      state = const AuthState.unauthenticated();
      return;
    }
    try {
      final session = await _repository.currentSession();
      state = AuthState(status: AuthStatus.authenticated, session: session);
    } catch (_) {
      await _repository.clearLocalSession();
      state = const AuthState.unauthenticated();
    }
  }

  Future<void> login(String email, String password) async {
    state = const AuthState(status: AuthStatus.unauthenticated, busy: true);
    final device = await _installationIdentity.load();
    _pendingLogin = _PendingLogin(
      email: email,
      password: password,
      device: device,
    );
    await _performLogin();
  }

  Future<void> selectOrganization(String organizationId) async {
    final pending = _pendingLogin;
    if (pending == null) {
      state = const AuthState.unauthenticated(
        errorMessage: 'Le credenziali temporanee non sono più disponibili.',
      );
      return;
    }
    state = AuthState(
      status: AuthStatus.organizationRequired,
      pendingOrganizations: state.pendingOrganizations,
      busy: true,
    );
    await _performLogin(organizationId: organizationId);
  }

  Future<void> switchOrganization(String organizationId) async {
    final current = state.session;
    if (current == null || current.organizationId == organizationId) {
      return;
    }
    state = AuthState(
      status: AuthStatus.authenticated,
      session: current,
      busy: true,
    );
    try {
      final session = await _repository.switchOrganization(organizationId);
      state = AuthState(status: AuthStatus.authenticated, session: session);
    } catch (error) {
      state = AuthState(
        status: AuthStatus.authenticated,
        session: current,
        errorMessage: _message(error),
      );
    }
  }

  Future<void> updateDeviceName(String name) async {
    final current = state.session;
    if (current == null) {
      return;
    }
    state = AuthState(
      status: AuthStatus.authenticated,
      session: current,
      busy: true,
    );
    try {
      final session = await _repository.updateCurrentDevice(name: name);
      state = AuthState(status: AuthStatus.authenticated, session: session);
    } catch (error) {
      state = AuthState(
        status: AuthStatus.authenticated,
        session: current,
        errorMessage: _message(error),
      );
    }
  }

  Future<void> logout() async {
    state = AuthState(status: state.status, session: state.session, busy: true);
    try {
      await _repository.logout();
    } finally {
      _pendingLogin = null;
      state = const AuthState.unauthenticated();
    }
  }

  Future<void> _performLogin({String? organizationId}) async {
    final pending = _pendingLogin!;
    try {
      final session = await _repository.login(
        email: pending.email,
        password: pending.password,
        device: pending.device,
        organizationId: organizationId,
      );
      _pendingLogin = null;
      state = AuthState(status: AuthStatus.authenticated, session: session);
    } on BackendError catch (error) {
      if (error.code == 'ORGANIZATION_SELECTION_REQUIRED') {
        final values = error.details['organizations'];
        final organizations = values is List
            ? values
                  .map(
                    (value) => OrganizationMembership.fromJson(
                      Map<String, Object?>.from(value as Map),
                    ),
                  )
                  .toList(growable: false)
            : const <OrganizationMembership>[];
        state = AuthState(
          status: AuthStatus.organizationRequired,
          pendingOrganizations: organizations,
          errorMessage: organizations.isEmpty ? error.message : null,
        );
      } else {
        _pendingLogin = null;
        state = AuthState.unauthenticated(errorMessage: error.message);
      }
    } catch (error) {
      _pendingLogin = null;
      state = AuthState.unauthenticated(errorMessage: _message(error));
    }
  }

  String _message(Object error) =>
      error is BackendError ? error.message : 'Operazione non riuscita.';

  @override
  void dispose() {
    unawaited(_expirySubscription.cancel());
    super.dispose();
  }
}

class _PendingLogin {
  const _PendingLogin({
    required this.email,
    required this.password,
    required this.device,
  });

  final String email;
  final String password;
  final DeviceIdentity device;
}
