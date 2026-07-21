enum FluxaEnvironment { development, test, production }

class AppConfig {
  const AppConfig({required this.environment, required this.apiBaseUrl});

  factory AppConfig.fromEnvironment(FluxaEnvironment fallback) {
    const rawEnvironment = String.fromEnvironment('FLUXA_ENV');
    const rawApiUrl = String.fromEnvironment('API_BASE_URL');
    final environment = _parseEnvironment(rawEnvironment, fallback);
    final defaultUrl = environment == FluxaEnvironment.development
        ? 'http://localhost:3000/api/v1'
        : '';
    final apiUrl = rawApiUrl.trim().isEmpty ? defaultUrl : rawApiUrl.trim();
    if (apiUrl.isEmpty) {
      throw StateError('API_BASE_URL is required outside development.');
    }
    final uri = Uri.tryParse(apiUrl);
    if (uri == null ||
        !uri.isAbsolute ||
        !{'http', 'https'}.contains(uri.scheme)) {
      throw StateError('API_BASE_URL must be an absolute HTTP(S) URL.');
    }
    return AppConfig(
      environment: environment,
      apiBaseUrl: apiUrl.replaceAll(RegExp(r'/+$'), ''),
    );
  }

  final FluxaEnvironment environment;
  final String apiBaseUrl;

  String get environmentName => environment.name;
  String get dioBaseUrl => '$apiBaseUrl/';

  static FluxaEnvironment _parseEnvironment(
    String value,
    FluxaEnvironment fallback,
  ) {
    return switch (value.trim().toLowerCase()) {
      'development' || 'dev' => FluxaEnvironment.development,
      'test' || 'testing' => FluxaEnvironment.test,
      'production' || 'prod' => FluxaEnvironment.production,
      _ => fallback,
    };
  }
}
