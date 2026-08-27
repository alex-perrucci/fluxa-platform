import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../data/catalog_api.dart';
import '../data/catalog_snapshot_cache.dart';
import '../domain/catalog_models.dart';

enum CatalogLoadStatus { idle, loading, ready, failure }

class CatalogController extends ChangeNotifier {
  CatalogController(this._gateway, {CatalogSnapshotCache? cache})
    : _cache = cache;

  final CatalogGateway _gateway;
  final CatalogSnapshotCache? _cache;
  CatalogLoadStatus _status = CatalogLoadStatus.idle;
  CatalogSnapshot? _snapshot;
  String? _locationId;
  String? _errorMessage;
  String _searchQuery = '';
  String? _selectedCategoryId;
  bool _offlineMode = false;
  int _requestVersion = 0;

  CatalogLoadStatus get status => _status;
  CatalogSnapshot? get snapshot => _snapshot;
  String? get locationId => _locationId;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  String? get selectedCategoryId => _selectedCategoryId;
  bool get isLoading => _status == CatalogLoadStatus.loading;
  bool get offlineMode => _offlineMode;

  List<CatalogCategory> get categories =>
      _snapshot?.categories ?? const <CatalogCategory>[];

  List<CatalogProduct> get visibleProducts {
    final products = <CatalogProduct>[];
    for (final category in categories) {
      if (_selectedCategoryId != null && category.id != _selectedCategoryId) {
        continue;
      }
      products.addAll(
        category.products.where((product) => product.matches(_searchQuery)),
      );
    }
    return products;
  }

  Future<void> ensureLoaded(String locationId) async {
    if (_locationId == locationId && _snapshot != null) {
      return;
    }
    await load(locationId);
  }

  Future<void> load(String locationId) async {
    final requestVersion = ++_requestVersion;
    final keepSnapshot = _locationId == locationId ? _snapshot : null;
    _locationId = locationId;
    _snapshot = keepSnapshot;
    _selectedCategoryId = null;
    _errorMessage = null;
    _status = CatalogLoadStatus.loading;
    notifyListeners();

    try {
      final snapshot = await _gateway.fetchCatalog(locationId: locationId);
      if (requestVersion != _requestVersion) {
        return;
      }
      if (snapshot.locationId != locationId) {
        throw const BackendError(
          message: 'Il catalogo ricevuto appartiene a una location diversa.',
        );
      }
      _snapshot = snapshot;
      _offlineMode = false;
      _status = CatalogLoadStatus.ready;
      await _saveCacheBestEffort(snapshot);
    } on BackendError catch (error) {
      if (requestVersion != _requestVersion) {
        return;
      }
      if (_canFallbackToCache(error) &&
          await _restoreCache(locationId, requestVersion)) {
        return;
      }
      _errorMessage = error.message;
      _status = CatalogLoadStatus.failure;
    } on FormatException {
      if (requestVersion != _requestVersion) {
        return;
      }
      _errorMessage = 'Il backend ha restituito un catalogo non valido.';
      _status = CatalogLoadStatus.failure;
    } catch (_) {
      if (requestVersion != _requestVersion) {
        return;
      }
      if (await _restoreCache(locationId, requestVersion)) {
        return;
      }
      _errorMessage = 'Impossibile recuperare il catalogo.';
      _status = CatalogLoadStatus.failure;
    }
    notifyListeners();
  }

  Future<void> refresh() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    await load(currentLocationId);
  }

  void setSearchQuery(String value) {
    if (_searchQuery == value) {
      return;
    }
    _searchQuery = value;
    notifyListeners();
  }

  void selectCategory(String? categoryId) {
    if (_selectedCategoryId == categoryId) {
      return;
    }
    _selectedCategoryId = categoryId;
    notifyListeners();
  }

  void clear() {
    _requestVersion += 1;
    _status = CatalogLoadStatus.idle;
    _snapshot = null;
    _locationId = null;
    _errorMessage = null;
    _searchQuery = '';
    _selectedCategoryId = null;
    _offlineMode = false;
    notifyListeners();
  }

  bool _canFallbackToCache(BackendError error) {
    if (error.isUnauthorized) {
      return false;
    }
    final statusCode = error.statusCode;
    return statusCode == null || statusCode >= 500;
  }

  Future<bool> _restoreCache(String locationId, int requestVersion) async {
    final cache = _cache;
    if (cache == null) {
      return false;
    }
    try {
      final cached = await cache.load(locationId);
      if (requestVersion != _requestVersion || cached == null) {
        return false;
      }
      _snapshot = cached;
      _offlineMode = true;
      _errorMessage = null;
      _status = CatalogLoadStatus.ready;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _saveCacheBestEffort(CatalogSnapshot snapshot) async {
    final cache = _cache;
    if (cache == null) {
      return;
    }
    try {
      await cache.save(snapshot);
    } catch (_) {
      // A cache write must never break a healthy online checkout.
    }
  }
}
