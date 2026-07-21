import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/storage/secure_store.dart';
import 'package:fluxa_pos/core/storage/session_store.dart';
import 'package:fluxa_pos/features/auth/domain/auth_models.dart';

void main() {
  test('persists and clears location with its organization', () async {
    final store = SessionStore(_MemoryStore());
    await store.saveReadyLocation(
      organizationId: 'organization-1',
      locationId: 'location-1',
    );

    expect(store.hasReadyLocationFor('organization-1'), isTrue);
    expect(store.hasReadyLocationFor('organization-2'), isFalse);

    await store.clearLocationContext();
    expect(store.locationId, isNull);
    expect(store.locationOrganizationId, isNull);
  });

  test('clearing the session also clears stale location', () async {
    final store = SessionStore(_MemoryStore());
    await store.saveTokens(
      const TokenPair(
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenType: 'Bearer',
        expiresIn: 900,
      ),
    );
    await store.saveReadyLocation(
      organizationId: 'organization-1',
      locationId: 'location-1',
    );

    await store.clearSession();

    expect(store.hasSession, isFalse);
    expect(store.locationId, isNull);
  });
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
