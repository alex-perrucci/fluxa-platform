import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';

void main() {
  test('parses Fluxa backend error shape and keeps details', () {
    final request = RequestOptions(path: '/auth/login');
    final exception = DioException(
      requestOptions: request,
      response: Response<Object?>(
        requestOptions: request,
        statusCode: 409,
        data: {
          'code': 'ORGANIZATION_SELECTION_REQUIRED',
          'message': 'Seleziona l’organizzazione.',
          'organizations': [
            {
              'id': 'membership-id',
              'organizationId': 'organization-id',
              'organizationName': 'Fluxa Demo',
              'organizationSlug': 'fluxa-demo',
              'role': 'OWNER',
            },
          ],
        },
      ),
    );

    final parsed = BackendError.fromDioException(exception);
    expect(parsed.code, 'ORGANIZATION_SELECTION_REQUIRED');
    expect(parsed.statusCode, 409);
    expect(parsed.details['organizations'], isA<List<Object?>>());
  });

  test('joins Nest validation messages', () {
    final request = RequestOptions(path: '/auth/login');
    final exception = DioException(
      requestOptions: request,
      response: Response<Object?>(
        requestOptions: request,
        statusCode: 400,
        data: {
          'statusCode': 400,
          'message': ['email must be an email', 'password is too short'],
          'error': 'Bad Request',
        },
      ),
    );
    final parsed = BackendError.fromDioException(exception);
    expect(parsed.validationMessages, hasLength(2));
    expect(parsed.message, contains('password is too short'));
  });
}
