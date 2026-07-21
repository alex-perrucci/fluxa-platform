class CatalogSnapshot {
  const CatalogSnapshot({
    required this.locationId,
    required this.currency,
    required this.priceListIds,
    required this.categories,
  });

  factory CatalogSnapshot.fromJson(Map<String, Object?> json) {
    final rawPriceLists = json['priceLists'];
    final rawCategories = json['categories'];
    return CatalogSnapshot(
      locationId: _requiredString(json, 'locationId'),
      currency: _requiredString(json, 'currency'),
      priceListIds: rawPriceLists is List
          ? rawPriceLists
                .map((value) => value.toString())
                .toList(growable: false)
          : const <String>[],
      categories: rawCategories is List
          ? rawCategories
                .map(
                  (value) => CatalogCategory.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <CatalogCategory>[],
    );
  }

  final String locationId;
  final String currency;
  final List<String> priceListIds;
  final List<CatalogCategory> categories;

  List<CatalogProduct> get products => categories
      .expand((category) => category.products)
      .toList(growable: false);
}

class CatalogCategory {
  const CatalogCategory({
    required this.id,
    required this.code,
    required this.name,
    required this.sortOrder,
    required this.products,
  });

  factory CatalogCategory.fromJson(Map<String, Object?> json) {
    final rawProducts = json['products'];
    return CatalogCategory(
      id: _requiredString(json, 'id'),
      code: _requiredString(json, 'code'),
      name: _requiredString(json, 'name'),
      sortOrder: _requiredInt(json, 'sortOrder'),
      products: rawProducts is List
          ? rawProducts
                .map(
                  (value) => CatalogProduct.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <CatalogProduct>[],
    );
  }

  final String id;
  final String code;
  final String name;
  final int sortOrder;
  final List<CatalogProduct> products;
}

class CatalogProduct {
  const CatalogProduct({
    required this.id,
    required this.code,
    required this.sku,
    required this.barcode,
    required this.name,
    required this.description,
    required this.imageUrl,
    required this.unit,
    required this.quantityScale,
    required this.trackAvailability,
    required this.vat,
    required this.price,
    required this.variants,
  });

  factory CatalogProduct.fromJson(Map<String, Object?> json) {
    final rawVat = json['vat'];
    final rawPrice = json['price'];
    final rawVariants = json['variants'];
    if (rawVat is! Map) {
      throw const FormatException('Aliquota IVA prodotto mancante.');
    }
    return CatalogProduct(
      id: _requiredString(json, 'id'),
      code: _requiredString(json, 'code'),
      sku: _optionalString(json['sku']),
      barcode: _optionalString(json['barcode']),
      name: _requiredString(json, 'name'),
      description: _optionalString(json['description']),
      imageUrl: _optionalString(json['imageUrl']),
      unit: CatalogProductUnit.fromWire(json['unit']),
      quantityScale: _requiredInt(json, 'quantityScale'),
      trackAvailability: json['trackAvailability'] == true,
      vat: CatalogVat.fromJson(Map<String, Object?>.from(rawVat)),
      price: rawPrice is Map
          ? CatalogPrice.fromJson(Map<String, Object?>.from(rawPrice))
          : null,
      variants: rawVariants is List
          ? rawVariants
                .map(
                  (value) => CatalogVariant.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <CatalogVariant>[],
    );
  }

  final String id;
  final String code;
  final String? sku;
  final String? barcode;
  final String name;
  final String? description;
  final String? imageUrl;
  final CatalogProductUnit unit;
  final int quantityScale;
  final bool trackAvailability;
  final CatalogVat vat;
  final CatalogPrice? price;
  final List<CatalogVariant> variants;

  CatalogPrice? get lowestPrice {
    final prices = <CatalogPrice>[
      ?price,
      ...variants.map((variant) => variant.price).nonNulls,
    ];
    if (prices.isEmpty) {
      return null;
    }
    prices.sort((left, right) => left.amountCents.compareTo(right.amountCents));
    return prices.first;
  }

  bool matches(String rawQuery) {
    final query = rawQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return true;
    }
    final values = <String?>[
      code,
      sku,
      barcode,
      name,
      description,
      ...variants.expand(
        (variant) => <String?>[
          variant.code,
          variant.sku,
          variant.barcode,
          variant.name,
        ],
      ),
    ];
    return values.whereType<String>().any(
      (value) => value.toLowerCase().contains(query),
    );
  }
}

enum CatalogProductUnit {
  each('EACH', 'pz'),
  weight('WEIGHT', 'peso'),
  volume('VOLUME', 'volume');

  const CatalogProductUnit(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static CatalogProductUnit fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final unit in values) {
      if (unit.wireValue == wireValue) {
        return unit;
      }
    }
    throw FormatException('Unità prodotto non supportata: $wireValue');
  }
}

class CatalogVat {
  const CatalogVat({
    required this.id,
    required this.code,
    required this.rateBasisPoints,
    required this.natureCode,
  });

  factory CatalogVat.fromJson(Map<String, Object?> json) => CatalogVat(
    id: _requiredString(json, 'id'),
    code: _requiredString(json, 'code'),
    rateBasisPoints: _requiredInt(json, 'rateBasisPoints'),
    natureCode: _optionalString(json['natureCode']),
  );

  final String id;
  final String code;
  final int rateBasisPoints;
  final String? natureCode;

  String get displayRate {
    if (rateBasisPoints == 0) {
      return natureCode == null ? 'IVA 0%' : 'IVA 0% · $natureCode';
    }
    final whole = rateBasisPoints ~/ 100;
    final remainder = rateBasisPoints % 100;
    if (remainder == 0) {
      return 'IVA $whole%';
    }
    return 'IVA ${(rateBasisPoints / 100).toStringAsFixed(2).replaceAll('.', ',')}%';
  }
}

class CatalogPrice {
  const CatalogPrice({required this.priceListId, required this.amountCents});

  factory CatalogPrice.fromJson(Map<String, Object?> json) => CatalogPrice(
    priceListId: _requiredString(json, 'priceListId'),
    amountCents: _requiredInt(json, 'amountCents'),
  );

  final String priceListId;
  final int amountCents;
}

class CatalogVariant {
  const CatalogVariant({
    required this.id,
    required this.code,
    required this.sku,
    required this.barcode,
    required this.name,
    required this.sortOrder,
    required this.price,
  });

  factory CatalogVariant.fromJson(Map<String, Object?> json) {
    final rawPrice = json['price'];
    return CatalogVariant(
      id: _requiredString(json, 'id'),
      code: _requiredString(json, 'code'),
      sku: _optionalString(json['sku']),
      barcode: _optionalString(json['barcode']),
      name: _requiredString(json, 'name'),
      sortOrder: _requiredInt(json, 'sortOrder'),
      price: rawPrice is Map
          ? CatalogPrice.fromJson(Map<String, Object?>.from(rawPrice))
          : null,
    );
  }

  final String id;
  final String code;
  final String? sku;
  final String? barcode;
  final String name;
  final int sortOrder;
  final CatalogPrice? price;
}

String formatCatalogMoney(int amountCents, String currency) {
  final amount = (amountCents / 100).toStringAsFixed(2).replaceAll('.', ',');
  final prefix = switch (currency.toUpperCase()) {
    'EUR' => '€',
    'USD' => r'$',
    'GBP' => '£',
    _ => currency.toUpperCase(),
  };
  return '$prefix $amount';
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) {
    return value;
  }
  throw FormatException('Campo catalogo non valido: $key');
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  throw FormatException('Campo catalogo non valido: $key');
}

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
