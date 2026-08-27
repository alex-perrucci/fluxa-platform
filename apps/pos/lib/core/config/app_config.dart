enum FluxaEnvironment { development, test, production }

class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.buildCommit,
    required this.releaseChannel,
    this.terminalBridgeUrl,
    this.terminalBridgeTimeout = const Duration(milliseconds: 2500),
  });

  factory AppConfig.fromEnvironment(FluxaEnvironment fallback) {
    return AppConfig.fromValues(
      fallback: fallback,
      environmentValue: const String.fromEnvironment('FLUXA_ENV'),
      apiBaseUrlValue: const String.fromEnvironment('API_BASE_URL'),
      buildCommitValue: const String.fromEnvironment('BUILD_COMMIT'),
      releaseChannelValue: const String.fromEnvironment('RELEASE_CHANNEL'),
      terminalBridgeUrlValue: const String.fromEnvironment(
        'TERMINAL_BRIDGE_URL',
      ),
      terminalBridgeTimeoutMsValue: const String.fromEnvironment(
        'TERMINAL_BRIDGE_TIMEOUT_MS',
      ),
    );
  }

  factory AppConfig.fromValues({
    required FluxaEnvironment fallback,
    String environmentValue = '',
    String apiBaseUrlValue = '',
    String buildCommitValue = '',
    String releaseChannelValue = '',
    String terminalBridgeUrlValue = '',
    String terminalBridgeTimeoutMsValue = '',
  }) {
    final environment = _parseEnvironment(environmentValue, fallback);
    final defaultUrl = environment == FluxaEnvironment.development
        ? 'http://localhost:3000/api/v1'
        : '';
    final apiUrl = apiBaseUrlValue.trim().isEmpty
        ? defaultUrl
        : apiBaseUrlValue.trim();
    if (apiUrl.isEmpty) {
      throw StateError('API_BASE_URL is required outside development.');
    }
    final uri = Uri.tryParse(apiUrl);
    if (uri == null ||
        !uri.isAbsolute ||
        uri.host.isEmpty ||
        !{'http', 'https'}.contains(uri.scheme)) {
      throw StateError('API_BASE_URL must be an absolute HTTP(S) URL.');
    }
    if (environment == FluxaEnvironment.production) {
      final localHosts = {'localhost', '127.0.0.1', '::1'};
      if (uri.scheme != 'https' ||
          localHosts.contains(uri.host.toLowerCase())) {
        throw StateError(
          'Production API_BASE_URL must be a non-local HTTPS URL.',
        );
      }
    }

    final terminalBridgeUrl = _parseOptionalHttpUrl(
      terminalBridgeUrlValue,
      'TERMINAL_BRIDGE_URL',
    );
    final terminalBridgeTimeout = _parseTerminalTimeout(
      terminalBridgeTimeoutMsValue,
    );

    final channel = releaseChannelValue.trim().isEmpty
        ? environment.name
        : releaseChannelValue.trim();
    return AppConfig(
      environment: environment,
      apiBaseUrl: apiUrl.replaceAll(RegExp(r'/+$'), ''),
      buildCommit: buildCommitValue.trim(),
      releaseChannel: channel,
      terminalBridgeUrl: terminalBridgeUrl,
      terminalBridgeTimeout: terminalBridgeTimeout,
    );
  }

  final FluxaEnvironment environment;
  final String apiBaseUrl;
  final String buildCommit;
  final String releaseChannel;
  final String? terminalBridgeUrl;
  final Duration terminalBridgeTimeout;

  bool get isProduction => environment == FluxaEnvironment.production;
  bool get terminalBridgeEnabled => terminalBridgeUrl != null;
  String get environmentName => environment.name;
  String get dioBaseUrl => '$apiBaseUrl/';
  String get terminalBridgeDioBaseUrl => terminalBridgeUrl == null
      ? ''
      : '${terminalBridgeUrl!.replaceAll(RegExp(r'/+$'), '')}/';
  String get shortBuildCommit =>
      buildCommit.length > 12 ? buildCommit.substring(0, 12) : buildCommit;

  static FluxaEnvironment _parseEnvironment(
    String value,
    FluxaEnvironment fallback,
  ) {
    return switch (value.trim().toLowerCase()) {
      'development' || 'dev' => FluxaEnvironment.development,
      'test' || 'testing' || 'sandbox' => FluxaEnvironment.test,
      'production' || 'prod' => FluxaEnvironment.production,
      _ => fallback,
    };
  }

  static String? _parseOptionalHttpUrl(String value, String name) {
    final normalized = value.trim();
    if (normalized.isEmpty) {
      return null;
    }
    final uri = Uri.tryParse(normalized);
    if (uri == null ||
        !uri.isAbsolute ||
        uri.host.isEmpty ||
        !{'http', 'https'}.contains(uri.scheme)) {
      throw StateError('$name must be an absolute HTTP(S) URL when set.');
    }
    // The terminal bridge commonly runs on localhost or the venue LAN, so
    // production intentionally allows local HTTP. It is opt-in and never used
    // as the backend API transport.
    return normalized.replaceAll(RegExp(r'/+$'), '');
  }

  static Duration _parseTerminalTimeout(String value) {
    if (value.trim().isEmpty) {
      return const Duration(milliseconds: 2500);
    }
    final milliseconds = int.tryParse(value.trim());
    if (milliseconds == null || milliseconds < 500 || milliseconds > 15000) {
      throw StateError(
        'TERMINAL_BRIDGE_TIMEOUT_MS must be between 500 and 15000.',
      );
    }
    return Duration(milliseconds: milliseconds);
  }
}
