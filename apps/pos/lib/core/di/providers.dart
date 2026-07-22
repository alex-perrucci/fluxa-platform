import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/data/auth_api.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/catalog/data/catalog_api.dart';
import '../../features/catalog/presentation/catalog_controller.dart';
import '../../features/device/data/device_api.dart';
import '../../features/fiscal/data/fiscal_api.dart';
import '../../features/fiscal/presentation/fiscal_controller.dart';
import '../../features/hospitality/data/hospitality_api.dart';
import '../../features/hospitality/presentation/kitchen_controller.dart';
import '../../features/hospitality/presentation/table_controller.dart';
import '../../features/orders/data/orders_api.dart';
import '../../features/orders/presentation/order_controller.dart';
import '../../features/payments/data/payments_api.dart';
import '../../features/payments/presentation/checkout_controller.dart';
import '../../features/printing/data/local_printer_mapping_store.dart';
import '../../features/printing/data/printing_api.dart';
import '../../features/printing/platform/local_printer_backend.dart';
import '../../features/printing/presentation/printing_controller.dart';
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
final catalogApiProvider = Provider<CatalogApi>(
  (ref) => CatalogApi(ref.watch(apiClientProvider).dio),
);
final ordersApiProvider = Provider<OrdersApi>(
  (ref) => OrdersApi(ref.watch(apiClientProvider).dio),
);
final paymentsApiProvider = Provider<PaymentsApi>(
  (ref) => PaymentsApi(ref.watch(apiClientProvider).dio),
);
final fiscalApiProvider = Provider<FiscalApi>(
  (ref) => FiscalApi(ref.watch(apiClientProvider).dio),
);
final hospitalityApiProvider = Provider<HospitalityApi>(
  (ref) => HospitalityApi(ref.watch(apiClientProvider).dio),
);
final printingApiProvider = Provider<PrintingApi>(
  (ref) => PrintingApi(ref.watch(apiClientProvider).dio),
);
final localPrinterMappingStoreProvider = Provider<LocalPrinterMappingStore>(
  (ref) => LocalPrinterMappingStore(ref.watch(secureStoreProvider)),
);
final localPrinterBackendProvider = Provider(
  (ref) => createLocalPrinterBackend(),
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

final catalogControllerProvider = ChangeNotifierProvider<CatalogController>(
  (ref) => CatalogController(ref.watch(catalogApiProvider)),
);

final orderControllerProvider = ChangeNotifierProvider<OrderController>(
  (ref) => OrderController(ref.watch(ordersApiProvider)),
);
final checkoutControllerProvider = ChangeNotifierProvider<CheckoutController>(
  (ref) => CheckoutController(ref.watch(paymentsApiProvider)),
);
final tableControllerProvider = ChangeNotifierProvider<TableController>(
  (ref) => TableController(
    ref.watch(hospitalityApiProvider),
    ref.watch(ordersApiProvider),
  ),
);
final kitchenControllerProvider = ChangeNotifierProvider<KitchenController>(
  (ref) => KitchenController(ref.watch(hospitalityApiProvider)),
);
final fiscalControllerProvider = ChangeNotifierProvider<FiscalController>(
  (ref) => FiscalController(
    ref.watch(fiscalApiProvider),
    ref.watch(ordersApiProvider),
  ),
);
final printingControllerProvider = ChangeNotifierProvider<PrintingController>(
  (ref) => PrintingController(
    ref.watch(printingApiProvider),
    ref.watch(localPrinterMappingStoreProvider),
    ref.watch(localPrinterBackendProvider),
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
