import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/data/auth_api.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/device/data/device_api.dart';
import '../config/app_config.dart';
import '../network/api_client.dart';
import '../network/session_expiry_bus.dart';
import '../platform/installation_identity.dart';
import '../routing/app_router.dart';
import '../storage/secure_store.dart';
import '../storage/session_store.dart';
import '../theme/theme_controller.dart';

final appConfigProvider = Provider<AppConfig>(
  (_) => throw UnimplementedError(),
);
final secureStoreProvider = Provider<SecureKeyValueStore>(
  (_) => throw UnimplementedError(),
);
final sessionStoreProvider = Provider<SessionStore>(
  (_) => throw UnimplementedError(),
);

final sessionExpiryBusProvider = Provider<SessionExpiryBus>((ref) {
  final bus = SessionExpiryBus();
  ref.onDispose(bus.dispose);
  return bus;
});

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    config: ref.watch(appConfigProvider),
    sessionStore: ref.watch(sessionStoreProvider),
    expiryBus: ref.watch(sessionExpiryBusProvider),
  ),
);

final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(ref.watch(apiClientProvider).dio),
);
final deviceApiProvider = Provider<DeviceApi>(
  (ref) => DeviceApi(ref.watch(apiClientProvider).dio),
);
final installationIdentityProvider = Provider<InstallationIdentityService>(
  (ref) => InstallationIdentityService(ref.watch(sessionStoreProvider)),
);
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    authApi: ref.watch(authApiProvider),
    deviceApi: ref.watch(deviceApiProvider),
    sessionStore: ref.watch(sessionStoreProvider),
    refreshCoordinator: ref.watch(apiClientProvider).refreshCoordinator,
  ),
);

final authControllerProvider = ChangeNotifierProvider<AuthController>(
  (ref) => AuthController(
    repository: ref.watch(authRepositoryProvider),
    installationIdentity: ref.watch(installationIdentityProvider),
    sessionStore: ref.watch(sessionStoreProvider),
    expiryBus: ref.watch(sessionExpiryBusProvider),
  ),
);

final themeControllerProvider = ChangeNotifierProvider<ThemeController>(
  (ref) => ThemeController(ref.watch(sessionStoreProvider)),
);

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = buildAppRouter(ref.read(authControllerProvider));
  ref.onDispose(router.dispose);
  return router;
});
