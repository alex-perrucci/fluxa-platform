import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../../core/network/session_expiry_bus.dart';
import '../../../core/platform/installation_identity.dart';
import '../../../core/storage/session_store.dart';
import '../../device/domain/device_assignment_models.dart';
import '../data/auth_repository.dart';
import '../domain/auth_models.dart';

enum AuthStatus {
  bootstrapping,
  unauthenticated,
  organizationRequired,
  locationRequired,
  assignmentRevoked,
  locationInactive,
  deviceAssignmentMissing,
  operationalError,
  authenticated,
}

extension AuthStatusOperationalGate on AuthStatus {
  bool get isOperationallyBlocked => switch (this) {
    AuthStatus.locationRequired ||
    AuthStatus.assignmentRevoked ||
    AuthStatus.locationInactive ||
    AuthStatus.deviceAssignmentMissing ||
    AuthStatus.operationalError => true,
    _ => false,
  };
}

class AuthState {
  const AuthState({
    required this.status,
    this.session,
    this.deviceAssignment,
    this.pendingOrganizations = const [],
    this.busy = false,
    this.errorMessage,
  });

  const AuthState.bootstrapping() : this(status: AuthStatus.bootstrapping);
  const AuthState.unauthenticated({String? errorMessage})
    : this(status: AuthStatus.unauthenticated, errorMessage: errorMessage);

  final AuthStatus status;
  final AuthSession? session;
  final CurrentDeviceAssignmentContext? deviceAssignment;
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
    _expirySubscription = expiryBus.stream.listen((_) async {
      _pendingLogin = null;
      await _sessionStore.clearSession();
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
      await _repository.clearLocationContext();
      state = const AuthState.unauthenticated();
      return;
    }
    try {
      final session = await _repository.currentSession();
      await _completeOperationalBootstrap(session);
    } on BackendError catch (error) {
      await _handleBackendError(error);
    } catch (_) {
      await _repository.clearLocalSession();
      state = const AuthState.unauthenticated();
    }
  }

  Future<void> login(String email, String password) async {
    await _repository.clearLocationContext();
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
    if (pending != null) {
      state = AuthState(
        status: AuthStatus.organizationRequired,
        pendingOrganizations: state.pendingOrganizations,
        busy: true,
      );
      await _performLogin(organizationId: organizationId);
      return;
    }

    if (state.session != null) {
      await switchOrganization(organizationId);
      return;
    }

    state = const AuthState.unauthenticated(
      errorMessage: 'La sessione non è più disponibile.',
    );
  }

  Future<void> switchOrganization(String organizationId) async {
    final current = state.session;
    if (current == null || current.organizationId == organizationId) {
      return;
    }

    await _repository.clearLocationContext();
    state = AuthState(
      status: AuthStatus.bootstrapping,
      session: current,
      busy: true,
    );
    try {
      final session = await _repository.switchOrganization(organizationId);
      await _completeOperationalBootstrap(session);
    } on BackendError catch (error) {
      await _handleBackendError(error, session: current);
    } catch (error) {
      state = AuthState(
        status: AuthStatus.operationalError,
        session: current,
        errorMessage: _message(error),
      );
    }
  }

  Future<void> refreshOperationalContext() async {
    final current = state.session;
    if (current == null) {
      return;
    }
    state = AuthState(
      status: AuthStatus.bootstrapping,
      session: current,
      busy: true,
    );
    try {
      final session = await _repository.currentSession();
      await _completeOperationalBootstrap(session);
    } on BackendError catch (error) {
      await _handleBackendError(error, session: current);
    } catch (error) {
      await _repository.clearLocationContext();
      state = AuthState(
        status: AuthStatus.operationalError,
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
    final currentStatus = state.status;
    final currentAssignment = state.deviceAssignment;
    state = AuthState(
      status: currentStatus,
      session: current,
      deviceAssignment: currentAssignment,
      busy: true,
    );
    try {
      final session = await _repository.updateCurrentDevice(name: name);
      state = AuthState(
        status: currentStatus,
        session: session,
        deviceAssignment: currentAssignment,
      );
    } catch (error) {
      state = AuthState(
        status: currentStatus,
        session: current,
        deviceAssignment: currentAssignment,
        errorMessage: _message(error),
      );
    }
  }

  Future<void> logout() async {
    state = AuthState(
      status: state.status,
      session: state.session,
      deviceAssignment: state.deviceAssignment,
      busy: true,
    );
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
      await _completeOperationalBootstrap(session);
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
        await _handleBackendError(error);
      }
    } catch (error) {
      _pendingLogin = null;
      state = AuthState.unauthenticated(errorMessage: _message(error));
    }
  }

  Future<void> _completeOperationalBootstrap(AuthSession session) async {
    if (session.organizationId == null) {
      await _repository.clearLocationContext();
      state = AuthState(
        status: AuthStatus.organizationRequired,
        session: session,
        pendingOrganizations: session.availableOrganizations,
      );
      return;
    }

    try {
      final context = await _repository.currentDeviceAssignment();
      await _applyDeviceAssignment(session, context);
    } on BackendError catch (error) {
      await _handleBackendError(error, session: session);
    }
  }

  Future<void> _applyDeviceAssignment(
    AuthSession session,
    CurrentDeviceAssignmentContext context,
  ) async {
    if (context.device.id != session.device.id) {
      await _repository.clearLocationContext();
      state = AuthState(
        status: AuthStatus.operationalError,
        session: session,
        deviceAssignment: context,
        errorMessage:
            'Il contesto operativo appartiene a un dispositivo diverso.',
      );
      return;
    }

    if (context.assignment.organizationId != session.organizationId) {
      await _repository.clearLocationContext();
      state = AuthState(
        status: AuthStatus.operationalError,
        session: session,
        deviceAssignment: context,
        errorMessage: 'Il contesto location non appartiene al tenant attivo.',
      );
      return;
    }

    switch (context.operationalStatus) {
      case DeviceOperationalStatus.ready:
        if (!context.isReady) {
          await _repository.clearLocationContext();
          state = AuthState(
            status: AuthStatus.locationInactive,
            session: session,
            deviceAssignment: context,
            errorMessage: 'La location ricevuta non è operativamente valida.',
          );
          return;
        }
        await _repository.persistReadyLocation(context);
        state = AuthState(
          status: AuthStatus.authenticated,
          session: session,
          deviceAssignment: context,
        );
      case DeviceOperationalStatus.locationRequired:
        await _setBlockedState(AuthStatus.locationRequired, session, context);
      case DeviceOperationalStatus.assignmentRevoked:
        await _setBlockedState(AuthStatus.assignmentRevoked, session, context);
      case DeviceOperationalStatus.locationInactive:
        await _setBlockedState(AuthStatus.locationInactive, session, context);
    }
  }

  Future<void> _setBlockedState(
    AuthStatus status,
    AuthSession session,
    CurrentDeviceAssignmentContext context,
  ) async {
    await _repository.clearLocationContext();
    state = AuthState(
      status: status,
      session: session,
      deviceAssignment: context,
    );
  }

  Future<void> _handleBackendError(
    BackendError error, {
    AuthSession? session,
  }) async {
    await _repository.clearLocationContext();
    switch (error.code) {
      case 'TENANT_CONTEXT_REQUIRED':
        state = AuthState(
          status: AuthStatus.organizationRequired,
          session: session,
          pendingOrganizations:
              session?.availableOrganizations ??
              const <OrganizationMembership>[],
          errorMessage: error.message,
        );
      case 'DEVICE_ASSIGNMENT_NOT_FOUND':
        state = AuthState(
          status: AuthStatus.deviceAssignmentMissing,
          session: session,
          errorMessage: error.message,
        );
      case 'DEVICE_NOT_FOUND':
      case 'SESSION_NOT_ACTIVE':
        await _repository.clearLocalSession();
        state = AuthState.unauthenticated(errorMessage: error.message);
      default:
        if (session == null) {
          await _repository.clearLocalSession();
          state = AuthState.unauthenticated(errorMessage: error.message);
        } else {
          state = AuthState(
            status: AuthStatus.operationalError,
            session: session,
            errorMessage: error.message,
          );
        }
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
