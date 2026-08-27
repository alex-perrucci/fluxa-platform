import 'dart:convert';

import '../../../core/offline/offline_database.dart';
import '../domain/catalog_models.dart';

abstract interface class CatalogSnapshotCache {
  Future<void> save(CatalogSnapshot snapshot);

  Future<CatalogSnapshot?> load(String locationId);
}

class OfflineCatalogSnapshotCache implements CatalogSnapshotCache {
  const OfflineCatalogSnapshotCache(this._database);

  final OfflineDatabase _database;

  @override
  Future<void> save(CatalogSnapshot snapshot) => _database.putCache(
    _cacheKey(snapshot.locationId),
    encodeCatalogSnapshot(snapshot),
  );

  @override
  Future<CatalogSnapshot?> load(String locationId) async {
    final raw = await _database.readCache(_cacheKey(locationId));
    if (raw == null) {
      return null;
    }
    try {
      final snapshot = decodeCatalogSnapshot(raw);
      return snapshot.locationId == locationId ? snapshot : null;
    } catch (_) {
      return null;
    }
  }

  static String _cacheKey(String locationId) => 'catalog-snapshot:$locationId';
}

String encodeCatalogSnapshot(CatalogSnapshot snapshot) => jsonEncode({
  'locationId': snapshot.locationId,
  'currency': snapshot.currency,
  'priceLists': snapshot.priceListIds,
  'categories': snapshot.categories
      .map(
        (category) => {
          'id': category.id,
          'code': category.code,
          'name': category.name,
          'sortOrder': category.sortOrder,
          'products': category.products
              .map(_productToJson)
              .toList(growable: false),
        },
      )
      .toList(growable: false),
});

CatalogSnapshot decodeCatalogSnapshot(String raw) {
  final decoded = jsonDecode(raw);
  if (decoded is! Map) {
    throw const FormatException('Cache catalogo non valida.');
  }
  return CatalogSnapshot.fromJson(Map<String, Object?>.from(decoded));
}

Map<String, Object?> _productToJson(CatalogProduct product) => {
  'id': product.id,
  'code': product.code,
  'sku': product.sku,
  'barcode': product.barcode,
  'name': product.name,
  'description': product.description,
  'imageUrl': product.imageUrl,
  'unit': product.unit.wireValue,
  'quantityScale': product.quantityScale,
  'trackAvailability': product.trackAvailability,
  'vat': {
    'id': product.vat.id,
    'code': product.vat.code,
    'rateBasisPoints': product.vat.rateBasisPoints,
    'natureCode': product.vat.natureCode,
  },
  'price': product.price == null
      ? null
      : {
          'priceListId': product.price!.priceListId,
          'amountCents': product.price!.amountCents,
        },
  'variants': product.variants
      .map(
        (variant) => {
          'id': variant.id,
          'code': variant.code,
          'sku': variant.sku,
          'barcode': variant.barcode,
          'name': variant.name,
          'sortOrder': variant.sortOrder,
          'price': variant.price == null
              ? null
              : {
                  'priceListId': variant.price!.priceListId,
                  'amountCents': variant.price!.amountCents,
                },
        },
      )
      .toList(growable: false),
};
