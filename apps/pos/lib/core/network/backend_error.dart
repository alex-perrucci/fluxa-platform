import 'package:dio/dio.dart';

class BackendError implements Exception {
  const BackendError({
    required this.message,
    this.code,
    this.statusCode,
    this.validationMessages = const [],
    this.details = const {},
    this.cause,
  });

  factory BackendError.fromDioException(DioException error) {
    final statusCode = error.response?.statusCode;
    final data = error.response?.data;
    if (data is Map) {
      final normalized = <String, Object?>{
        for (final entry in data.entries) entry.key.toString(): entry.value,
      };
      final rawMessage = normalized['message'];
      final messages = rawMessage is List
          ? rawMessage.map((value) => value.toString()).toList(growable: false)
          : const <String>[];
      final message = messages.isNotEmpty
          ? messages.join('\n')
          : rawMessage?.toString().trim().isNotEmpty == true
          ? rawMessage.toString()
          : _fallbackMessage(error, statusCode);
      return BackendError(
        message: message,
        code: normalized['code']?.toString(),
        statusCode: statusCode,
        validationMessages: messages,
        details: Map<String, Object?>.unmodifiable(normalized),
        cause: error,
      );
    }
    return BackendError(
      message: _fallbackMessage(error, statusCode),
      statusCode: statusCode,
      cause: error,
    );
  }

  final String message;
  final String? code;
  final int? statusCode;
  final List<String> validationMessages;
  final Map<String, Object?> details;
  final Object? cause;

  bool get isUnauthorized => statusCode == 401;

  static String _fallbackMessage(DioException error, int? statusCode) {
    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout =>
        'Il server non ha risposto entro il tempo previsto.',
      DioExceptionType.connectionError =>
        'Impossibile raggiungere il server Fluxa.',
      _ when statusCode != null =>
        'Il server ha risposto con errore HTTP $statusCode.',
      _ => 'Si è verificato un errore di comunicazione.',
    };
  }

  @override
  String toString() => code == null ? message : '$code: $message';
}
