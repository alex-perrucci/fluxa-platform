import 'package:flutter/material.dart';

class FluxaPalette {
  const FluxaPalette._();

  static const ink = Color(0xFF101114);
  static const inkSoft = Color(0xFF242529);
  static const gold = Color(0xFFD6A84B);
  static const goldDark = Color(0xFFB88A31);
  static const paper = Color(0xFFFFFFFF);
  static const offWhite = Color(0xFFF7F5F0);
  static const line = Color(0xFFDEDAD1);
  static const muted = Color(0xFF696A6F);
}

class FluxaTheme {
  static final light = _build(Brightness.light);
  static final dark = _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final base = ColorScheme.fromSeed(
      seedColor: FluxaPalette.gold,
      brightness: brightness,
    );
    final scheme = base.copyWith(
      primary: FluxaPalette.gold,
      onPrimary: FluxaPalette.ink,
      secondary: FluxaPalette.gold,
      onSecondary: FluxaPalette.ink,
      surface: dark ? FluxaPalette.inkSoft : FluxaPalette.offWhite,
      onSurface: dark ? Colors.white : FluxaPalette.ink,
      outline: dark ? const Color(0xFF4B4C51) : FluxaPalette.line,
      outlineVariant: dark ? const Color(0xFF35363B) : const Color(0xFFE8E4DC),
    );
    final baseTheme = ThemeData(brightness: brightness, useMaterial3: true);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark
          ? const Color(0xFF17181B)
          : FluxaPalette.offWhite,
      textTheme: baseTheme.textTheme
          .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface)
          .copyWith(
            headlineLarge: baseTheme.textTheme.headlineLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
            ),
            headlineMedium: baseTheme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
            titleLarge: baseTheme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            titleMedium: baseTheme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: dark ? FluxaPalette.ink : FluxaPalette.paper,
        foregroundColor: dark ? Colors.white : FluxaPalette.ink,
        surfaceTintColor: Colors.transparent,
        shape: Border(
          bottom: BorderSide(
            color: dark ? const Color(0xFF303136) : FluxaPalette.line,
          ),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: dark ? const Color(0xFF202126) : FluxaPalette.paper,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? const Color(0xFF202126) : FluxaPalette.paper,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        labelStyle: TextStyle(
          color: dark ? Colors.white70 : FluxaPalette.muted,
        ),
        hintStyle: TextStyle(color: dark ? Colors.white38 : FluxaPalette.muted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: FluxaPalette.gold, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 50),
          backgroundColor: FluxaPalette.ink,
          foregroundColor: Colors.white,
          disabledBackgroundColor: dark
              ? const Color(0xFF35363A)
              : const Color(0xFFD2D0CA),
          disabledForegroundColor: dark ? Colors.white38 : Colors.black38,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: scheme.onSurface,
          side: BorderSide(color: scheme.outlineVariant),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: dark
              ? const Color(0xFFE7C57D)
              : FluxaPalette.goldDark,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: const Color(0xFFD6A84B),
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        selectedIconTheme: const IconThemeData(color: FluxaPalette.ink),
        unselectedIconTheme: const IconThemeData(color: Colors.white60),
        selectedLabelTextStyle: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelTextStyle: const TextStyle(color: Colors.white60),
        groupAlignment: -0.82,
      ),
      navigationBarTheme: NavigationBarThemeData(
        elevation: 0,
        height: 72,
        backgroundColor: dark ? FluxaPalette.ink : FluxaPalette.paper,
        indicatorColor: FluxaPalette.gold,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            color: dark ? Colors.white : FluxaPalette.ink,
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
          );
        }),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      dialogTheme: DialogThemeData(
        elevation: 18,
        backgroundColor: dark ? const Color(0xFF202126) : FluxaPalette.paper,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        elevation: 20,
        backgroundColor: dark ? const Color(0xFF202126) : FluxaPalette.paper,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? FluxaPalette.paper : FluxaPalette.ink,
        contentTextStyle: TextStyle(
          color: dark ? FluxaPalette.ink : Colors.white,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: FluxaPalette.gold,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: FluxaPalette.gold,
        foregroundColor: FluxaPalette.ink,
      ),
    );
  }
}
