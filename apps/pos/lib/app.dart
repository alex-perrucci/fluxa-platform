import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/di/providers.dart';
import 'core/theme/fluxa_theme.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/fiscal/platform/fiscal_receipt_pdf_handler.dart';
import 'features/fiscal/platform/fiscal_receipt_thermal_printer.dart';

class FluxaApp extends ConsumerStatefulWidget {
  const FluxaApp({super.key});

  @override
  ConsumerState<FluxaApp> createState() => _FluxaAppState();
}

class _FluxaAppState extends ConsumerState<FluxaApp> {
  static const _fiscalReceiptPrinter = FiscalReceiptThermalPrinter();

  var _bootstrapped = false;
  String? _scheduledPrintingContext;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) {
      return;
    }
    _bootstrapped = true;
    Future<void>.microtask(ref.read(authControllerProvider).bootstrap);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider).state;
    ref.watch(posWorkflowCoordinatorProvider);
    _schedulePrintingContext(authState);
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeControllerProvider).mode;
    return MaterialApp.router(
      title: 'Fluxa POS',
      debugShowCheckedModeBanner: false,
      theme: FluxaTheme.light,
      darkTheme: FluxaTheme.dark,
      themeMode: themeMode,
      routerConfig: router,
    );
  }

  void _schedulePrintingContext(AuthState authState) {
    final location = authState.deviceAssignment?.location;
    final session = authState.session;
    final key = location == null || session == null
        ? 'none'
        : '${location.id}:${session.device.id}';
    if (_scheduledPrintingContext == key) {
      return;
    }
    _scheduledPrintingContext = key;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final controller = ref.read(printingControllerProvider);
      if (location == null || session == null) {
        configureFiscalReceiptPrinter(null);
        controller.clearContext();
      } else {
        await controller.bindContext(
          locationId: location.id,
          deviceId: session.device.id,
        );
        configureFiscalReceiptPrinter(
          (receipt) => _fiscalReceiptPrinter.print(
            printing: controller,
            receipt: receipt,
          ),
        );
      }
    });
  }
}
