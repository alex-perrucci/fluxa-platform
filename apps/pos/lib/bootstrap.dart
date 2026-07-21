import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/di/providers.dart';
import 'core/storage/secure_store.dart';
import 'core/storage/session_store.dart';

Future<void> bootstrap({required FluxaEnvironment fallbackEnvironment}) async {
  WidgetsFlutterBinding.ensureInitialized();
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
}
