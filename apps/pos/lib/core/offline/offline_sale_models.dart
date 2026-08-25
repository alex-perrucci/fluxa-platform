import '../../features/catalog/domain/catalog_models.dart';
import '../../features/orders/domain/uuid_v4.dart';

class OfflineSaleLine {
  const OfflineSaleLine({
    required this.clientItemId,
    required this.productId,
    required this.variantId,
    required this.productCodeSnapshot,
    required this.productNameSnapshot,
    required this.variantCodeSnapshot,
    required this.variantNameSnapshot,
    required this.skuSnapshot,
    required this.barcodeSnapshot,
    required this.categoryIdSnapshot,
    required this.categoryCodeSnapshot,
    required this.categoryNameSnapshot,
    required this.unitSnapshot,
    required this.quantityAmount,
    required this.quantityScale,
    required this.unitPriceCents,
    required this.vatRateIdSnapshot,
    required this.vatCodeSnapshot,
    required this.vatRateBasisPointsSnapshot,
    required this.vatNatureCodeSnapshot,
    required this.priceListIdSnapshot,
    required this.note,
  });

  factory OfflineSaleLine.fromCatalog({
    required CatalogSnapshot snapshot,
    required CatalogProduct product,
    CatalogVariant? variant,
    required int quantityAmount,
    String? note,
  }) {
    CatalogCategory? category;
    for (final candidate in snapshot.categories) {
      if (candidate.products.any((item) => item.id == product.id)) {
        category = candidate;
        break;
      }
    }
    if (category == null) {
      throw StateError('Categoria prodotto non disponibile nel catalogo offline.');
    }
    final price = variant?.price ?? product.price;
    if (price == null) {
      throw StateError('Prezzo non disponibile nel catalogo offline.');
    }
    if (quantityAmount <= 0) {
      throw StateError('La quantità deve essere maggiore di zero.');
    }
    return OfflineSaleLine(
      clientItemId: UuidV4.generate(),
      productId: product.id,
      variantId: variant?.id,
      productCodeSnapshot: product.code,
      productNameSnapshot: product.name,
      variantCodeSnapshot: variant?.code,
      variantNameSnapshot: variant?.name,
      skuSnapshot: variant?.sku ?? product.sku,
      barcodeSnapshot: variant?.barcode ?? product.barcode,
      categoryIdSnapshot: category.id,
      categoryCodeSnapshot: category.code,
      categoryNameSnapshot: category.name,
      unitSnapshot: product.unit.wireValue,
      quantityAmount: quantityAmount,
      quantityScale: product.quantityScale,
      unitPriceCents: price.amountCents,
      vatRateIdSnapshot: product.vat.id,
      vatCodeSnapshot: product.vat.code,
      vatRateBasisPointsSnapshot: product.vat.rateBasisPoints,
      vatNatureCodeSnapshot: product.vat.natureCode,
      priceListIdSnapshot: price.priceListId,
      note: _normalize(note),
    );
  }

  factory OfflineSaleLine.fromJson(Map<String, Object?> json) => OfflineSaleLine(
    clientItemId: _requiredString(json, 'clientItemId'),
    productId: _requiredString(json, 'productId'),
    variantId: _optionalString(json['variantId']),
    productCodeSnapshot: _requiredString(json, 'productCodeSnapshot'),
    productNameSnapshot: _requiredString(json, 'productNameSnapshot'),
    variantCodeSnapshot: _optionalString(json['variantCodeSnapshot']),
    variantNameSnapshot: _optionalString(json['variantNameSnapshot']),
    skuSnapshot: _optionalString(json['skuSnapshot']),
    barcodeSnapshot: _optionalString(json['barcodeSnapshot']),
    categoryIdSnapshot: _requiredString(json, 'categoryIdSnapshot'),
    categoryCodeSnapshot: _requiredString(json, 'categoryCodeSnapshot'),
    categoryNameSnapshot: _requiredString(json, 'categoryNameSnapshot'),
    unitSnapshot: _requiredString(json, 'unitSnapshot'),
    quantityAmount: _requiredInt(json, 'quantityAmount'),
    quantityScale: _requiredInt(json, 'quantityScale'),
    unitPriceCents: _requiredInt(json, 'unitPriceCents'),
    vatRateIdSnapshot: _requiredString(json, 'vatRateIdSnapshot'),
    vatCodeSnapshot: _requiredString(json, 'vatCodeSnapshot'),
    vatRateBasisPointsSnapshot: _requiredInt(
      json,
      'vatRateBasisPointsSnapshot',
    ),
    vatNatureCodeSnapshot: _optionalString(json['vatNatureCodeSnapshot']),
    priceListIdSnapshot: _requiredString(json, 'priceListIdSnapshot'),
    note: _optionalString(json['note']),
  );

  final String clientItemId;
  final String productId;
  final String? variantId;
  final String productCodeSnapshot;
  final String productNameSnapshot;
  final String? variantCodeSnapshot;
  final String? variantNameSnapshot;
  final String? skuSnapshot;
  final String? barcodeSnapshot;
  final String categoryIdSnapshot;
  final String categoryCodeSnapshot;
  final String categoryNameSnapshot;
  final String unitSnapshot;
  final int quantityAmount;
  final int quantityScale;
  final int unitPriceCents;
  final String vatRateIdSnapshot;
  final String vatCodeSnapshot;
  final int vatRateBasisPointsSnapshot;
  final String? vatNatureCodeSnapshot;
  final String priceListIdSnapshot;
  final String? note;

  int get grossCents => _roundRatio(
    unitPriceCents * quantityAmount,
    _pow10(quantityScale),
  );

  int get taxCents {
    if (vatRateBasisPointsSnapshot == 0) {
      return 0;
    }
    return _roundRatio(
      grossCents * vatRateBasisPointsSnapshot,
      10000 + vatRateBasisPointsSnapshot,
    );
  }

  int get netCents => grossCents - taxCents;

  String get displayName => variantNameSnapshot == null
      ? productNameSnapshot
      : '$productNameSnapshot · $variantNameSnapshot';

  OfflineSaleLine copyWith({required int quantityAmount}) => OfflineSaleLine(
    clientItemId: clientItemId,
    productId: productId,
    variantId: variantId,
    productCodeSnapshot: productCodeSnapshot,
    productNameSnapshot: productNameSnapshot,
    variantCodeSnapshot: variantCodeSnapshot,
    variantNameSnapshot: variantNameSnapshot,
    skuSnapshot: skuSnapshot,
    barcodeSnapshot: barcodeSnapshot,
    categoryIdSnapshot: categoryIdSnapshot,
    categoryCodeSnapshot: categoryCodeSnapshot,
    categoryNameSnapshot: categoryNameSnapshot,
    unitSnapshot: unitSnapshot,
    quantityAmount: quantityAmount,
    quantityScale: quantityScale,
    unitPriceCents: unitPriceCents,
    vatRateIdSnapshot: vatRateIdSnapshot,
    vatCodeSnapshot: vatCodeSnapshot,
    vatRateBasisPointsSnapshot: vatRateBasisPointsSnapshot,
    vatNatureCodeSnapshot: vatNatureCodeSnapshot,
    priceListIdSnapshot: priceListIdSnapshot,
    note: note,
  );

  Map<String, Object?> toJson() => {
    'clientItemId': clientItemId,
    'productId': productId,
    'variantId': variantId,
    'productCodeSnapshot': productCodeSnapshot,
    'productNameSnapshot': productNameSnapshot,
    'variantCodeSnapshot': variantCodeSnapshot,
    'variantNameSnapshot': variantNameSnapshot,
    'skuSnapshot': skuSnapshot,
    'barcodeSnapshot': barcodeSnapshot,
    'categoryIdSnapshot': categoryIdSnapshot,
    'categoryCodeSnapshot': categoryCodeSnapshot,
    'categoryNameSnapshot': categoryNameSnapshot,
    'unitSnapshot': unitSnapshot,
    'quantityAmount': quantityAmount,
    'quantityScale': quantityScale,
    'unitPriceCents': unitPriceCents,
    'vatRateIdSnapshot': vatRateIdSnapshot,
    'vatCodeSnapshot': vatCodeSnapshot,
    'vatRateBasisPointsSnapshot': vatRateBasisPointsSnapshot,
    'vatNatureCodeSnapshot': vatNatureCodeSnapshot,
    'priceListIdSnapshot': priceListIdSnapshot,
    'note': note,
  };
}

class OfflineSaleDraft {
  const OfflineSaleDraft({
    required this.saleId,
    required this.clientOrderId,
    required this.clientCheckoutId,
    required this.clientPaymentId,
    required this.locationId,
    required this.currency,
    required this.createdAt,
    required this.items,
  });

  factory OfflineSaleDraft.empty({
    required String locationId,
    required String currency,
  }) => OfflineSaleDraft(
    saleId: UuidV4.generate(),
    clientOrderId: UuidV4.generate(),
    clientCheckoutId: UuidV4.generate(),
    clientPaymentId: UuidV4.generate(),
    locationId: locationId,
    currency: currency.toUpperCase(),
    createdAt: DateTime.now().toUtc(),
    items: const [],
  );

  factory OfflineSaleDraft.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    if (rawItems is! List) {
      throw const FormatException('Righe vendita offline mancanti.');
    }
    return OfflineSaleDraft(
      saleId: _requiredString(json, 'saleId'),
      clientOrderId: _requiredString(json, 'clientOrderId'),
      clientCheckoutId: _requiredString(json, 'clientCheckoutId'),
      clientPaymentId: _requiredString(json, 'clientPaymentId'),
      locationId: _requiredString(json, 'locationId'),
      currency: _requiredString(json, 'currency').toUpperCase(),
      createdAt: DateTime.parse(_requiredString(json, 'createdAt')).toUtc(),
      items: rawItems
          .map(
            (value) => OfflineSaleLine.fromJson(
              Map<String, Object?>.from(value as Map),
            ),
          )
          .toList(growable: false),
    );
  }

  final String saleId;
  final String clientOrderId;
  final String clientCheckoutId;
  final String clientPaymentId;
  final String locationId;
  final String currency;
  final DateTime createdAt;
  final List<OfflineSaleLine> items;

  int get totalCents => items.fold(0, (sum, item) => sum + item.grossCents);
  int get netTotalCents => items.fold(0, (sum, item) => sum + item.netCents);
  int get taxTotalCents => items.fold(0, (sum, item) => sum + item.taxCents);

  OfflineSaleDraft copyWith({required List<OfflineSaleLine> items}) =>
      OfflineSaleDraft(
        saleId: saleId,
        clientOrderId: clientOrderId,
        clientCheckoutId: clientCheckoutId,
        clientPaymentId: clientPaymentId,
        locationId: locationId,
        currency: currency,
        createdAt: createdAt,
        items: List.unmodifiable(items),
      );

  Map<String, Object?> toJson() => {
    'saleId': saleId,
    'clientOrderId': clientOrderId,
    'clientCheckoutId': clientCheckoutId,
    'clientPaymentId': clientPaymentId,
    'locationId': locationId,
    'currency': currency,
    'createdAt': createdAt.toIso8601String(),
    'items': items.map((item) => item.toJson()).toList(growable: false),
  };

  Map<String, Object?> toReplayJson({required int tenderedCents}) => {
    ...toJson(),
    'serviceMode': 'COUNTER',
    'payment': {
      'method': 'CASH',
      'provider': 'CASH',
      'amountCents': totalCents,
      'tenderedCents': tenderedCents,
    },
  };
}

class OfflineCashSaleResult {
  const OfflineCashSaleResult({
    required this.saleId,
    required this.totalCents,
    required this.tenderedCents,
  });

  final String saleId;
  final int totalCents;
  final int tenderedCents;

  int get changeCents => tenderedCents - totalCents;
}

int _roundRatio(int numerator, int denominator) {
  if (numerator < 0 || denominator <= 0) {
    throw RangeError('Rapporto monetario non valido.');
  }
  return (numerator + denominator ~/ 2) ~/ denominator;
}

int _pow10(int exponent) {
  if (exponent < 0 || exponent > 6) {
    throw RangeError.range(exponent, 0, 6, 'quantityScale');
  }
  var value = 1;
  for (var index = 0; index < exponent; index += 1) {
    value *= 10;
  }
  return value;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) {
    return value.trim();
  }
  throw FormatException('Campo vendita offline non valido: $key');
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  throw FormatException('Campo vendita offline non valido: $key');
}

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

String? _normalize(String? value) {
  final normalized = value?.trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
