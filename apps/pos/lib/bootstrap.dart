import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/diagnostics/app_error_reporter.dart';
import 'core/diagnostics/app_failure.dart';
import 'core/di/providers.dart';
import 'core/storage/secure_store.dart';
import 'core/storage/session_store.dart';

Future<void> bootstrap({required FluxaEnvironment fallbackEnvironment}) async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) {
    AppErrorReporter.recordFlutter(details);
    FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stackTrace) {
    AppErrorReporter.record(error, stackTrace, source: 'platform');
    return true;
  };
  ErrorWidget.builder = (details) => AppFailureWidget(
    debugMessage: kDebugMode ? details.exceptionAsString() : null,
  );

  try {
    final config = AppConfig.fromEnvironment(fallbackEnvironment);
    final secureStore = FlutterSecureKeyValueStore();
    final sessionStore = SessionStore(secureStore);
    await sessionStore.load();

    runApp(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(config),
          secureStoreProvider.overrideWithValue(secureStore),
          sessionStoreProvider.overrideWithValue(sessionStore),
        ],
        child: const FluxaApp(),
      ),
    );
  } catch (error, stackTrace) {
    AppErrorReporter.record(error, stackTrace, source: 'bootstrap');
    runApp(
      BootstrapFailureApp(
        debugMessage: kDebugMode
            ? AppErrorReporter.redactForDiagnostics(error.toString())
            : null,
      ),
    );
  }
}
