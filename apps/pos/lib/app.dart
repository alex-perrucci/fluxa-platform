import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/di/providers.dart';
import 'core/theme/fluxa_theme.dart';

class FluxaApp extends ConsumerStatefulWidget {
  const FluxaApp({super.key});

  @override
  ConsumerState<FluxaApp> createState() => _FluxaAppState();
}

class _FluxaAppState extends ConsumerState<FluxaApp> {
  var _bootstrapped = false;

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
}
