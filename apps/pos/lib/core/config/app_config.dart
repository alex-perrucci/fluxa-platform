enum FluxaEnvironment { development, test, production }

class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.buildCommit,
    required this.releaseChannel,
  });

  factory AppConfig.fromEnvironment(FluxaEnvironment fallback) {
    return AppConfig.fromValues(
      fallback: fallback,
      environmentValue: const String.fromEnvironment('FLUXA_ENV'),
      apiBaseUrlValue: const String.fromEnvironment('API_BASE_URL'),
      buildCommitValue: const String.fromEnvironment('BUILD_COMMIT'),
      releaseChannelValue: const String.fromEnvironment('RELEASE_CHANNEL'),
    );
  }

  factory AppConfig.fromValues({
    required FluxaEnvironment fallback,
    String environmentValue = '',
    String apiBaseUrlValue = '',
    String buildCommitValue = '',
    String releaseChannelValue = '',
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
    final channel = releaseChannelValue.trim().isEmpty
        ? environment.name
        : releaseChannelValue.trim();
    return AppConfig(
      environment: environment,
      apiBaseUrl: apiUrl.replaceAll(RegExp(r'/+$'), ''),
      buildCommit: buildCommitValue.trim(),
      releaseChannel: channel,
    );
  }

  final FluxaEnvironment environment;
  final String apiBaseUrl;
  final String buildCommit;
  final String releaseChannel;

  bool get isProduction => environment == FluxaEnvironment.production;
  String get environmentName => environment.name;
  String get dioBaseUrl => '$apiBaseUrl/';
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
}
