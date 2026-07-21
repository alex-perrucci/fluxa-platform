import '../../features/auth/domain/auth_models.dart';
import 'secure_store.dart';

class SessionStore {
  SessionStore(this._storage);

  static const _accessTokenKey = 'fluxa.access_token';
  static const _refreshTokenKey = 'fluxa.refresh_token';
  static const _expiresInKey = 'fluxa.expires_in';
  static const _installationIdKey = 'fluxa.installation_id';
  static const _themeModeKey = 'fluxa.theme_mode';

  final SecureKeyValueStore _storage;
  TokenPair? _tokens;
  String? _installationId;
  String? _themeMode;

  TokenPair? get tokens => _tokens;
  String? get accessToken => _tokens?.accessToken;
  String? get refreshToken => _tokens?.refreshToken;
  String? get installationId => _installationId;
  String? get themeMode => _themeMode;
  bool get hasSession => _tokens?.refreshToken.isNotEmpty == true;

  Future<void> load() async {
    final accessToken = await _storage.read(_accessTokenKey);
    final refreshToken = await _storage.read(_refreshTokenKey);
    final expiresIn = int.tryParse(await _storage.read(_expiresInKey) ?? '');
    if (accessToken != null && refreshToken != null && expiresIn != null) {
      _tokens = TokenPair(
        accessToken: accessToken,
        refreshToken: refreshToken,
        tokenType: 'Bearer',
        expiresIn: expiresIn,
      );
    }
    _installationId = await _storage.read(_installationIdKey);
    _themeMode = await _storage.read(_themeModeKey);
  }

  Future<void> saveTokens(TokenPair tokens) async {
    _tokens = tokens;
    await Future.wait([
      _storage.write(_accessTokenKey, tokens.accessToken),
      _storage.write(_refreshTokenKey, tokens.refreshToken),
      _storage.write(_expiresInKey, tokens.expiresIn.toString()),
    ]);
  }

  Future<void> clearSession() async {
    _tokens = null;
    await Future.wait([
      _storage.delete(_accessTokenKey),
      _storage.delete(_refreshTokenKey),
      _storage.delete(_expiresInKey),
    ]);
  }

  Future<void> saveInstallationId(String value) async {
    _installationId = value;
    await _storage.write(_installationIdKey, value);
  }

  Future<void> saveThemeMode(String value) async {
    _themeMode = value;
    await _storage.write(_themeModeKey, value);
  }
}
