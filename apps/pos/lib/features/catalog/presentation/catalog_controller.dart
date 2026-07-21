import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../data/catalog_api.dart';
import '../domain/catalog_models.dart';

enum CatalogLoadStatus { idle, loading, ready, failure }

class CatalogController extends ChangeNotifier {
  CatalogController(this._gateway);

  final CatalogGateway _gateway;
  CatalogLoadStatus _status = CatalogLoadStatus.idle;
  CatalogSnapshot? _snapshot;
  String? _locationId;
  String? _errorMessage;
  String _searchQuery = '';
  String? _selectedCategoryId;
  int _requestVersion = 0;

  CatalogLoadStatus get status => _status;
  CatalogSnapshot? get snapshot => _snapshot;
  String? get locationId => _locationId;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  String? get selectedCategoryId => _selectedCategoryId;
  bool get isLoading => _status == CatalogLoadStatus.loading;

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
    _locationId = locationId;
    _snapshot = null;
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
      _status = CatalogLoadStatus.ready;
    } on BackendError catch (error) {
      if (requestVersion != _requestVersion) {
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
    notifyListeners();
  }
}
