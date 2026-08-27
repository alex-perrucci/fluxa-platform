import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/config/app_config.dart';

void main() {
  test('development fallback uses local API URL', () {
    final config = AppConfig.fromValues(fallback: FluxaEnvironment.development);
    expect(config.apiBaseUrl, 'http://localhost:3000/api/v1');
    expect(config.releaseChannel, 'development');
    expect(config.terminalBridgeEnabled, isFalse);
  });

  test('production requires a non-local HTTPS API', () {
    expect(
      () => AppConfig.fromValues(
        fallback: FluxaEnvironment.production,
        apiBaseUrlValue: 'http://localhost:3000/api/v1',
      ),
      throwsStateError,
    );
  });

  test('production retains release metadata and trims trailing slashes', () {
    final config = AppConfig.fromValues(
      fallback: FluxaEnvironment.production,
      apiBaseUrlValue: 'https://api.example.com/api/v1///',
      buildCommitValue: '1234567890abcdef',
      releaseChannelValue: 'production',
    );
    expect(config.apiBaseUrl, 'https://api.example.com/api/v1');
    expect(config.shortBuildCommit, '1234567890ab');
    expect(config.isProduction, isTrue);
  });

  test('terminal bridge is opt-in and may run on the venue LAN', () {
    final config = AppConfig.fromValues(
      fallback: FluxaEnvironment.production,
      apiBaseUrlValue: 'https://api.example.com/api/v1',
      terminalBridgeUrlValue: 'http://127.0.0.1:9123/',
      terminalBridgeTimeoutMsValue: '3000',
    );

    expect(config.terminalBridgeEnabled, isTrue);
    expect(config.terminalBridgeUrl, 'http://127.0.0.1:9123');
    expect(config.terminalBridgeDioBaseUrl, 'http://127.0.0.1:9123/');
    expect(config.terminalBridgeTimeout, const Duration(milliseconds: 3000));
  });

  test('terminal bridge rejects malformed URLs and unsafe timeout values', () {
    expect(
      () => AppConfig.fromValues(
        fallback: FluxaEnvironment.development,
        terminalBridgeUrlValue: 'not-a-url',
      ),
      throwsStateError,
    );
    expect(
      () => AppConfig.fromValues(
        fallback: FluxaEnvironment.development,
        terminalBridgeTimeoutMsValue: '100',
      ),
      throwsStateError,
    );
  });
}
