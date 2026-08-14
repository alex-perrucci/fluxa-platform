import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SecureKeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureKeyValueStore implements SecureKeyValueStore {
  FlutterSecureKeyValueStore()
    : _storage = FlutterSecureStorage(aOptions: AndroidOptions());

  final FlutterSecureStorage _storage;
  Future<void> _tail = Future<void>.value();

  Future<T> _serialized<T>(Future<T> Function() operation) {
    final completer = Completer<T>();
    _tail = _tail.then((_) async {
      try {
        completer.complete(await operation());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  @override
  Future<void> delete(String key) =>
      _serialized(() => _storage.delete(key: key));

  @override
  Future<String?> read(String key) =>
      _serialized(() => _storage.read(key: key));

  @override
  Future<void> write(String key, String value) =>
      _serialized(() => _storage.write(key: key, value: value));
}

class MemorySecureKeyValueStore implements SecureKeyValueStore {
  MemorySecureKeyValueStore([Map<String, String>? initial])
    : _values = {...?initial};

  final Map<String, String> _values;

  @override
  Future<void> delete(String key) async => _values.remove(key);

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}
