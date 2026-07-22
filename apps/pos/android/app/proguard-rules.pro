# Flutter and registered plugins provide their own consumer rules.
# Keep native methods and the Android entry point used by the printing bridge.
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class it.fluxa.fluxa_pos.MainActivity { *; }
-dontwarn io.flutter.embedding.**
