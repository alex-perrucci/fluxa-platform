import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/core/network/session_expiry_bus.dart';
import 'package:fluxa_pos/core/platform/installation_identity.dart';
import 'package:fluxa_pos/core/storage/secure_store.dart';
import 'package:fluxa_pos/core/storage/session_store.dart';
import 'package:fluxa_pos/features/auth/data/auth_repository.dart';
import 'package:fluxa_pos/features/auth/domain/auth_models.dart';
import 'package:fluxa_pos/features/auth/presentation/auth_controller.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';

void main() {
  for (final caseData in const [
    (DeviceOperationalStatus.ready, AuthStatus.authenticated),
    (DeviceOperationalStatus.locationRequired, AuthStatus.locationRequired),
    (DeviceOperationalStatus.assignmentRevoked, AuthStatus.assignmentRevoked),
    (DeviceOperationalStatus.locationInactive, AuthStatus.locationInactive),
  ]) {
    test('bootstrap maps ${caseData.$1.wireValue}', () async {
      final fixture = await _Fixture.create(context: _context(caseData.$1));
      await fixture.controller.bootstrap();

      expect(fixture.controller.state.status, caseData.$2);
      expect(
        fixture.store.locationId,
        caseData.$1 == DeviceOperationalStatus.ready ? 'location-1' : isNull,
      );
      await fixture.dispose();
    });
  }

  test('TENANT_CONTEXT_REQUIRED returns to organization selection', () async {
    final fixture = await _Fixture.create(
      error: const BackendError(
        code: 'TENANT_CONTEXT_REQUIRED',
        statusCode: 403,
        message: 'Seleziona un’organizzazione.',
      ),
    );
    await fixture.controller.bootstrap();
    expect(fixture.controller.state.status, AuthStatus.organizationRequired);
    expect(fixture.store.locationId, isNull);
    await fixture.dispose();
  });

  test('DEVICE_ASSIGNMENT_NOT_FOUND blocks operations', () async {
    final fixture = await _Fixture.create(
      error: const BackendError(
        code: 'DEVICE_ASSIGNMENT_NOT_FOUND',
        statusCode: 404,
        message: 'Assignment assente.',
      ),
    );
    await fixture.controller.bootstrap();
    expect(fixture.controller.state.status, AuthStatus.deviceAssignmentMissing);
    await fixture.dispose();
  });

  test('DEVICE_NOT_FOUND clears session and requires login', () async {
    final fixture = await _Fixture.create(
      error: const BackendError(
        code: 'DEVICE_NOT_FOUND',
        statusCode: 404,
        message: 'Device assente.',
      ),
    );
    await fixture.controller.bootstrap();
    expect(fixture.controller.state.status, AuthStatus.unauthenticated);
    expect(fixture.store.hasSession, isFalse);
    await fixture.dispose();
  });

  test('SESSION_NOT_ACTIVE clears tokens and location', () async {
    final fixture = await _Fixture.create(
      error: const BackendError(
        code: 'SESSION_NOT_ACTIVE',
        statusCode: 401,
        message: 'Sessione revocata.',
      ),
    );
    await fixture.store.saveReadyLocation(
      organizationId: 'organization-1',
      locationId: 'old-location',
    );

    await fixture.controller.bootstrap();

    expect(fixture.controller.state.status, AuthStatus.unauthenticated);
    expect(fixture.store.hasSession, isFalse);
    expect(fixture.store.locationId, isNull);
    await fixture.dispose();
  });

  test('switch clears old location before requesting new tenant', () async {
    final fixture = await _Fixture.create(
      context: _context(DeviceOperationalStatus.ready),
    );
    await fixture.store.saveReadyLocation(
      organizationId: 'organization-1',
      locationId: 'old-location',
    );

    await fixture.controller.bootstrap();
    await fixture.controller.switchOrganization('organization-2');

    expect(fixture.repository.locationWasClearedBeforeSwitch, isTrue);
    expect(fixture.controller.state.status, AuthStatus.authenticated);
    expect(fixture.controller.state.session!.organizationId, 'organization-2');
    expect(fixture.store.locationOrganizationId, 'organization-2');
    await fixture.dispose();
  });
}

CurrentDeviceAssignmentContext _context(DeviceOperationalStatus status) {
  final hasLocation = status != DeviceOperationalStatus.locationRequired;
  return CurrentDeviceAssignmentContext(
    operationalStatus: status,
    device: CurrentDeviceAssignmentDevice(
      id: 'device-1',
      installationId: 'installation-123456',
      name: 'Cassa 1',
      platform: 'WINDOWS',
      model: null,
      appVersion: '1.0.0',
      status: 'ACTIVE',
      lastSeenAt: DateTime.utc(2026, 7, 21),
    ),
    assignment: DeviceAssignmentRecord(
      id: 'assignment-1',
      organizationId: 'organization-1',
      locationId: hasLocation ? 'location-1' : null,
      operatorMode: DeviceOperatorMode.auto,
      active: status != DeviceOperationalStatus.assignmentRevoked,
      assignedAt: DateTime.utc(2026, 7, 20),
      revokedAt: status == DeviceOperationalStatus.assignmentRevoked
          ? DateTime.utc(2026, 7, 21)
          : null,
      updatedAt: DateTime.utc(2026, 7, 21),
    ),
    location: hasLocation
        ? OperationalLocation(
            id: 'location-1',
            code: 'PARMA',
            name: 'Parma Centro',
            timezone: 'Europe/Rome',
            status: status == DeviceOperationalStatus.locationInactive
                ? 'INACTIVE'
                : 'ACTIVE',
          )
        : null,
  );
}

class _Fixture {
  _Fixture({
    required this.controller,
    required this.repository,
    required this.store,
    required this.bus,
  });

  static Future<_Fixture> create({
    CurrentDeviceAssignmentContext? context,
    BackendError? error,
  }) async {
    final store = SessionStore(_MemoryStore());
    await store.saveTokens(
      const TokenPair(
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        expiresIn: 900,
      ),
    );
    final repository = _FakeAuthRepository(
      store: store,
      context: context,
      error: error,
    );
    final bus = SessionExpiryBus();
    final controller = AuthController(
      repository: repository,
      installationIdentity: InstallationIdentityService(store),
      sessionStore: store,
      expiryBus: bus,
    );
    return _Fixture(
      controller: controller,
      repository: repository,
      store: store,
      bus: bus,
    );
  }

  final AuthController controller;
  final _FakeAuthRepository repository;
  final SessionStore store;
  final SessionExpiryBus bus;

  Future<void> dispose() async {
    controller.dispose();
    await bus.dispose();
  }
}

class _FakeAuthRepository implements AuthRepository {
  _FakeAuthRepository({
    required this.store,
    required this.context,
    required this.error,
  });

  final SessionStore store;
  CurrentDeviceAssignmentContext? context;
  final BackendError? error;
  var locationCleared = false;
  var locationWasClearedBeforeSwitch = false;

  var activeOrganizationId = 'organization-1';

  AuthSession get session => AuthSession(
    user: const UserProfile(
      id: 'user-1',
      email: 'cashier@example.com',
      displayName: 'Cashier',
      platformAdmin: false,
    ),
    device: const DeviceRecord(
      id: 'device-1',
      installationId: 'installation-123456',
      name: 'Cassa 1',
      platform: 'WINDOWS',
    ),
    availableOrganizations: const [
      OrganizationMembership(
        membershipId: 'membership-1',
        organizationId: 'organization-1',
        organizationName: 'Fluxa Test',
        organizationSlug: 'fluxa-test',
        role: 'CASHIER',
      ),
      OrganizationMembership(
        membershipId: 'membership-2',
        organizationId: 'organization-2',
        organizationName: 'Fluxa Due',
        organizationSlug: 'fluxa-due',
        role: 'CASHIER',
      ),
    ],
    sessionId: 'session-1',
    organizationId: activeOrganizationId,
    membershipId: activeOrganizationId == 'organization-1'
        ? 'membership-1'
        : 'membership-2',
    role: 'CASHIER',
  );

  @override
  Future<void> clearLocalSession() => store.clearSession();

  @override
  Future<void> clearLocationContext() async {
    locationCleared = true;
    await store.clearLocationContext();
  }

  @override
  Future<CurrentDeviceAssignmentContext> currentDeviceAssignment() async {
    if (error != null) {
      throw error!;
    }
    return context!;
  }

  @override
  Future<AuthSession> currentSession() async => session;

  @override
  Future<AuthSession> login({
    required String email,
    required String password,
    required DeviceIdentity device,
    String? organizationId,
  }) async => session;

  @override
  Future<void> logout() => store.clearSession();

  @override
  Future<void> persistReadyLocation(CurrentDeviceAssignmentContext context) =>
      store.saveReadyLocation(
        organizationId: context.assignment.organizationId,
        locationId: context.location!.id,
      );

  @override
  Future<AuthSession> switchOrganization(String organizationId) async {
    locationWasClearedBeforeSwitch =
        locationCleared && store.locationId == null;
    activeOrganizationId = organizationId;
    context = CurrentDeviceAssignmentContext(
      operationalStatus: DeviceOperationalStatus.ready,
      device: CurrentDeviceAssignmentDevice(
        id: 'device-1',
        installationId: 'installation-123456',
        name: 'Cassa 1',
        platform: 'WINDOWS',
        model: null,
        appVersion: '1.0.0',
        status: 'ACTIVE',
        lastSeenAt: DateTime.utc(2026, 7, 21),
      ),
      assignment: DeviceAssignmentRecord(
        id: 'assignment-2',
        organizationId: organizationId,
        locationId: 'location-2',
        operatorMode: DeviceOperatorMode.auto,
        active: true,
        assignedAt: DateTime.utc(2026, 7, 20),
        revokedAt: null,
        updatedAt: DateTime.utc(2026, 7, 21),
      ),
      location: const OperationalLocation(
        id: 'location-2',
        code: 'MILANO',
        name: 'Milano Centro',
        timezone: 'Europe/Rome',
        status: 'ACTIVE',
      ),
    );
    return session;
  }

  @override
  Future<AuthSession> updateCurrentDevice({required String name}) async =>
      session;
}

class _MemoryStore implements SecureKeyValueStore {
  final values = <String, String>{};

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }
}
