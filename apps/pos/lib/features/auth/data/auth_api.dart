import 'package:dio/dio.dart';

import '../../../core/network/backend_error.dart';
import '../domain/auth_models.dart';

class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<TokenPair> login({
    required String email,
    required String password,
    required DeviceIdentity device,
    String? organizationId,
  }) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'auth/login',
        data: {
          'email': email.trim(),
          'password': password,
          'organizationId': ?organizationId,
          'device': device.toJson(),
        },
        options: Options(extra: const {'skipAuth': true}),
      );
      return _tokensFrom(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<AuthMePayload> me() async {
    try {
      final response = await _dio.get<Map<String, Object?>>('auth/me');
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Risposta sessione vuota.');
      }
      return AuthMePayload.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<OrganizationEntitlements> entitlements() async {
    try {
      final response = await _dio.get<Map<String, Object?>>('me/entitlements');
      final data = response.data;
      if (data == null) {
        throw const BackendError(message: 'Risposta piano Fluxa vuota.');
      }
      return OrganizationEntitlements.fromJson(data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<TokenPair> switchOrganization(
    String organizationId,
    String refreshToken,
  ) async {
    try {
      final response = await _dio.post<Map<String, Object?>>(
        'auth/switch-organization',
        data: {'organizationId': organizationId, 'refreshToken': refreshToken},
      );
      return _tokensFrom(response.data);
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post<Map<String, Object?>>('auth/logout');
    } on DioException catch (error) {
      throw BackendError.fromDioException(error);
    }
  }

  TokenPair _tokensFrom(Map<String, Object?>? data) {
    if (data == null || data['tokens'] is! Map) {
      throw const BackendError(
        message: 'La risposta non contiene i token attesi.',
      );
    }
    return TokenPair.fromJson(
      Map<String, Object?>.from(data['tokens']! as Map),
    );
  }
}

class AuthMePayload {
  const AuthMePayload({
    required this.user,
    required this.availableOrganizations,
    required this.sessionId,
    required this.organizationId,
    required this.membershipId,
    required this.role,
  });

  factory AuthMePayload.fromJson(Map<String, Object?> json) {
    final user = Map<String, Object?>.from(json['user']! as Map);
    final session = Map<String, Object?>.from(json['session']! as Map);
    final organizations = (json['availableOrganizations'] as List? ?? const [])
        .map(
          (value) => OrganizationMembership.fromJson(
            Map<String, Object?>.from(value as Map),
          ),
        )
        .toList(growable: false);
    return AuthMePayload(
      user: UserProfile.fromJson(user),
      availableOrganizations: organizations,
      sessionId: session['id']?.toString(),
      organizationId: session['organizationId']?.toString(),
      membershipId: session['membershipId']?.toString(),
      role: session['role']?.toString(),
    );
  }

  final UserProfile user;
  final List<OrganizationMembership> availableOrganizations;
  final String? sessionId;
  final String? organizationId;
  final String? membershipId;
  final String? role;
}
