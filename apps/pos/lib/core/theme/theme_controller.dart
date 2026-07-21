import 'package:flutter/material.dart';

import '../storage/session_store.dart';

class ThemeController extends ChangeNotifier {
  ThemeController(this._sessionStore)
    : _mode = switch (_sessionStore.themeMode) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  final SessionStore _sessionStore;
  ThemeMode _mode;

  ThemeMode get mode => _mode;

  Future<void> setMode(ThemeMode value) async {
    if (_mode == value) {
      return;
    }
    _mode = value;
    notifyListeners();
    await _sessionStore.saveThemeMode(value.name);
  }
}
