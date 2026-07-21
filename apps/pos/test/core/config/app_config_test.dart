import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/config/app_config.dart';

void main() {
  test('development fallback uses local API URL', () {
    final config = AppConfig.fromEnvironment(FluxaEnvironment.development);
    expect(config.apiBaseUrl, 'http://localhost:3000/api/v1');
  });
}
