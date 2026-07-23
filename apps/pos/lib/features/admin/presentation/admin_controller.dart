import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../data/admin_api.dart';

class AdminSnapshot {
  const AdminSnapshot({
    required this.members,
    required this.merchants,
    required this.locations,
    required this.devices,
    required this.vatRates,
    required this.categories,
    required this.products,
    required this.priceLists,
    required this.areas,
    required this.tables,
    required this.stations,
    required this.printers,
  });

  final List<Map<String, Object?>> members;
  final List<Map<String, Object?>> merchants;
  final List<Map<String, Object?>> locations;
  final List<Map<String, Object?>> devices;
  final List<Map<String, Object?>> vatRates;
  final List<Map<String, Object?>> categories;
  final List<Map<String, Object?>> products;
  final List<Map<String, Object?>> priceLists;
  final List<Map<String, Object?>> areas;
  final List<Map<String, Object?>> tables;
  final List<Map<String, Object?>> stations;
  final List<Map<String, Object?>> printers;
}

class AdminController extends ChangeNotifier {
  AdminController(this._api);

  final AdminApi _api;

  String? _organizationId;
  String? _locationId;
  String? _deviceId;
  AdminSnapshot? _snapshot;
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;

  String? get organizationId => _organizationId;
  String? get locationId => _locationId;
  String? get deviceId => _deviceId;
  AdminSnapshot? get snapshot => _snapshot;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;

  Future<void> bindContext({
    required String organizationId,
    required String locationId,
    required String deviceId,
  }) async {
    final sameContext =
        _organizationId == organizationId &&
        _locationId == locationId &&
        _deviceId == deviceId;
    _organizationId = organizationId;
    _locationId = locationId;
    _deviceId = deviceId;
    if (sameContext && _snapshot != null) {
      return;
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (_busy || _organizationId == null || _locationId == null) {
      return;
    }
    _busy = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _snapshot = await _loadSnapshot();
    } catch (error) {
      _errorMessage = _message(error);
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  Future<bool> createMember({
    required String email,
    required String displayName,
    required String role,
    required String temporaryPassword,
  }) => _mutate('Utente creato e associato all’organizzazione.', () async {
    await _api.post(
      'organizations/${_requiredOrganizationId()}/members',
      data: {
        'email': email.trim(),
        'displayName': displayName.trim(),
        'role': role,
        'temporaryPassword': temporaryPassword,
      },
    );
  });

  Future<bool> createMerchant({
    required String legalName,
    required String tradeName,
    required String vatNumber,
    required String taxCode,
  }) => _mutate('Merchant creato.', () async {
    await _api.post(
      'merchants',
      data: {
        'legalName': legalName.trim(),
        'tradeName': tradeName.trim().isEmpty ? null : tradeName.trim(),
        'vatNumber': vatNumber.trim(),
        'taxCode': taxCode.trim().isEmpty ? null : taxCode.trim(),
        'countryCode': 'IT',
      },
    );
  });

  Future<bool> createLocation({
    required String merchantId,
    required String code,
    required String name,
    required String addressLine1,
    required String postalCode,
    required String city,
    required String province,
  }) => _mutate('Location creata.', () async {
    await _api.post(
      'locations',
      data: {
        'merchantId': merchantId,
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'addressLine1': addressLine1.trim(),
        'postalCode': postalCode.trim(),
        'city': city.trim(),
        'province': province.trim().toUpperCase(),
        'countryCode': 'IT',
        'timezone': 'Europe/Rome',
      },
    );
  });

  Future<bool> createVatRate({
    required String code,
    required String name,
    required int rateBasisPoints,
    required bool isDefault,
  }) => _mutate('Aliquota IVA creata.', () async {
    await _api.post(
      'vat-rates',
      data: {
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'rateBasisPoints': rateBasisPoints,
        'isDefault': isDefault,
      },
    );
  });

  Future<bool> createCategory({
    required String code,
    required String name,
    required String colorHex,
    required int sortOrder,
  }) => _mutate('Categoria creata.', () async {
    await _api.post(
      'categories',
      data: {
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'colorHex': colorHex.trim().isEmpty ? null : colorHex.trim(),
        'sortOrder': sortOrder,
      },
    );
  });

  Future<bool> createPriceList({
    required String code,
    required String name,
    required int priority,
  }) => _mutate('Listino creato e assegnato alla location corrente.', () async {
    final created = await _api.post(
      'price-lists',
      data: {
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'currency': 'EUR',
        'priority': priority,
      },
    );
    await _api.put(
      'price-lists/${_requiredId(created, 'listino')}/locations',
      data: {
        'locationId': _requiredLocationId(),
        'priority': priority,
        'active': true,
      },
    );
  });

  Future<bool> createProductWithPrice({
    required String categoryId,
    required String vatRateId,
    required String priceListId,
    required String code,
    required String sku,
    required String name,
    required String unit,
    required int amountCents,
  }) => _mutate('Prodotto creato e prezzato.', () async {
    final product = await _api.post(
      'products',
      data: {
        'categoryId': categoryId,
        'vatRateId': vatRateId,
        'code': code.trim().toUpperCase(),
        'sku': sku.trim().isEmpty ? null : sku.trim(),
        'name': name.trim(),
        'unit': unit,
        'quantityScale': unit == 'EACH' ? 0 : 3,
        'trackAvailability': false,
      },
    );
    await _api.put(
      'price-lists/$priceListId/prices',
      data: {
        'productId': _requiredId(product, 'prodotto'),
        'amountCents': amountCents,
      },
    );
  });

  Future<bool> createArea({
    required String code,
    required String name,
    required int sortOrder,
  }) => _mutate('Sala creata.', () async {
    await _api.post(
      'dining-areas/${_requiredLocationId()}',
      data: {
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'sortOrder': sortOrder,
      },
    );
  });

  Future<bool> createTable({
    required String areaId,
    required String code,
    required String name,
    required int capacity,
    required int sortOrder,
  }) => _mutate('Tavolo creato.', () async {
    await _api.post(
      'dining-tables',
      data: {
        'locationId': _requiredLocationId(),
        'areaId': areaId,
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'capacity': capacity,
        'sortOrder': sortOrder,
      },
    );
  });

  Future<bool> createStation({
    required String code,
    required String name,
    required int sortOrder,
  }) => _mutate('Postazione cucina creata.', () async {
    await _api.post(
      'kitchen-stations',
      data: {
        'locationId': _requiredLocationId(),
        'code': code.trim().toUpperCase(),
        'name': name.trim(),
        'sortOrder': sortOrder,
      },
    );
  });

  Future<bool> routeCategory({
    required String stationId,
    required String categoryId,
  }) => _mutate('Categoria instradata alla postazione cucina.', () async {
    await _api.put('kitchen-stations/$stationId/categories/$categoryId');
  });

  Future<bool> createPrinter({
    required String code,
    required String name,
    required String purpose,
  }) => _mutate(
    'Stampante backend creata e assegnata al dispositivo corrente.',
    () async {
      await _api.post(
        'printers',
        data: {
          'locationId': _requiredLocationId(),
          'code': code.trim().toUpperCase(),
          'name': name.trim(),
          'purpose': purpose,
          'agentDeviceId': _requiredDeviceId(),
          'driver': 'ESC_POS',
          'paperWidthMm': 80,
          'charactersPerLine': 48,
          'supportsCut': true,
          'supportsDrawer': false,
        },
      );
    },
  );

  Future<bool> configureMockFiscal({
    required String fiscalId,
    required String displayName,
    required String receiptEmail,
  }) => _mutate('Profilo fiscale MOCK configurato.', () async {
    await _api.put(
      'fiscal-profiles/${_requiredLocationId()}',
      data: {
        'provider': 'MOCK',
        'environment': 'SANDBOX',
        'fiscalId': fiscalId.trim(),
        'enabled': true,
        'autoIssueOnPaid': false,
        'receiptEmail': receiptEmail.trim().isEmpty
            ? null
            : receiptEmail.trim(),
        'displayName': displayName.trim(),
      },
    );
  });

  Future<bool> createDemoSetup() => _mutate(
    'Configurazione demo completa creata. Aggiorna Cassa, Tavoli, Cucina, Stampa e Fiscale.',
    () async {
      final current = await _loadSnapshot();

      final vat = await _ensureByCode(
        current.vatRates,
        'IVA10',
        () => _api.post(
          'vat-rates',
          data: {
            'code': 'IVA10',
            'name': 'IVA 10%',
            'rateBasisPoints': 1000,
            'isDefault': true,
          },
        ),
      );
      final pizzas = await _ensureByCode(
        current.categories,
        'PIZZE',
        () => _api.post(
          'categories',
          data: {
            'code': 'PIZZE',
            'name': 'Pizze',
            'description': 'Pizze demo per il collaudo Fluxa',
            'colorHex': '#E76F51',
            'sortOrder': 10,
          },
        ),
      );
      final drinks = await _ensureByCode(
        current.categories,
        'BIBITE',
        () => _api.post(
          'categories',
          data: {
            'code': 'BIBITE',
            'name': 'Bibite',
            'colorHex': '#2A9D8F',
            'sortOrder': 20,
          },
        ),
      );
      final priceList = await _ensureByCode(
        current.priceLists,
        'DEMO',
        () => _api.post(
          'price-lists',
          data: {
            'code': 'DEMO',
            'name': 'Listino demo',
            'currency': 'EUR',
            'priority': 100,
          },
        ),
      );
      final priceListId = _requiredId(priceList, 'listino demo');
      await _api.put(
        'price-lists/$priceListId/locations',
        data: {
          'locationId': _requiredLocationId(),
          'priority': 100,
          'active': true,
        },
      );

      final margherita = await _ensureByCode(
        current.products,
        'MARGHERITA',
        () => _api.post(
          'products',
          data: {
            'categoryId': _requiredId(pizzas, 'categoria Pizze'),
            'vatRateId': _requiredId(vat, 'IVA 10%'),
            'code': 'MARGHERITA',
            'sku': 'PIZZA-MARGHERITA',
            'name': 'Pizza Margherita',
            'description': 'Pomodoro, mozzarella e basilico',
            'unit': 'EACH',
            'quantityScale': 0,
            'trackAvailability': false,
          },
        ),
      );
      final cola = await _ensureByCode(
        current.products,
        'COLA033',
        () => _api.post(
          'products',
          data: {
            'categoryId': _requiredId(drinks, 'categoria Bibite'),
            'vatRateId': _requiredId(vat, 'IVA 10%'),
            'code': 'COLA033',
            'sku': 'COLA-033',
            'barcode': '8000000000019',
            'name': 'Cola 33 cl',
            'unit': 'EACH',
            'quantityScale': 0,
            'trackAvailability': false,
          },
        ),
      );
      await _api.put(
        'price-lists/$priceListId/prices',
        data: {
          'productId': _requiredId(margherita, 'Pizza Margherita'),
          'amountCents': 750,
        },
      );
      await _api.put(
        'price-lists/$priceListId/prices',
        data: {
          'productId': _requiredId(cola, 'Cola 33 cl'),
          'amountCents': 300,
        },
      );

      final area = await _ensureByCode(
        current.areas,
        'SALA',
        () => _api.post(
          'dining-areas/${_requiredLocationId()}',
          data: {'code': 'SALA', 'name': 'Sala principale', 'sortOrder': 10},
        ),
      );
      final areaId = _requiredId(area, 'Sala principale');
      await _ensureByCode(
        current.tables,
        'T01',
        () => _api.post(
          'dining-tables',
          data: {
            'locationId': _requiredLocationId(),
            'areaId': areaId,
            'code': 'T01',
            'name': 'Tavolo 1',
            'capacity': 4,
            'sortOrder': 10,
          },
        ),
      );
      await _ensureByCode(
        current.tables,
        'T02',
        () => _api.post(
          'dining-tables',
          data: {
            'locationId': _requiredLocationId(),
            'areaId': areaId,
            'code': 'T02',
            'name': 'Tavolo 2',
            'capacity': 2,
            'sortOrder': 20,
          },
        ),
      );

      final station = await _ensureByCode(
        current.stations,
        'CUCINA',
        () => _api.post(
          'kitchen-stations',
          data: {
            'locationId': _requiredLocationId(),
            'code': 'CUCINA',
            'name': 'Cucina principale',
            'sortOrder': 10,
          },
        ),
      );
      await _api.put(
        'kitchen-stations/${_requiredId(station, 'Cucina')}/categories/${_requiredId(pizzas, 'Pizze')}',
      );

      final printer = await _ensureByCode(
        current.printers,
        'CASSA01',
        () => _api.post(
          'printers',
          data: {
            'locationId': _requiredLocationId(),
            'code': 'CASSA01',
            'name': 'Stampante cassa demo',
            'purpose': 'RECEIPT',
            'agentDeviceId': _requiredDeviceId(),
            'driver': 'ESC_POS',
            'paperWidthMm': 80,
            'charactersPerLine': 48,
            'supportsCut': true,
            'supportsDrawer': false,
          },
        ),
      );
      final printerId = _requiredId(printer, 'Stampante cassa');
      await _api.put(
        'print-routes',
        data: {
          'locationId': _requiredLocationId(),
          'documentType': 'ORDER_RECEIPT',
          'printerId': printerId,
          'copies': 1,
          'active': true,
        },
      );
      await _api.put(
        'print-routes',
        data: {
          'locationId': _requiredLocationId(),
          'documentType': 'PAYMENT_RECEIPT',
          'printerId': printerId,
          'copies': 1,
          'active': true,
        },
      );
      await _api.put(
        'fiscal-profiles/${_requiredLocationId()}',
        data: {
          'provider': 'MOCK',
          'environment': 'SANDBOX',
          'fiscalId': '12345678901',
          'enabled': true,
          'autoIssueOnPaid': false,
          'receiptEmail': null,
          'displayName': 'Fluxa Demo',
        },
      );
    },
  );

  Future<AdminSnapshot> _loadSnapshot() async {
    final organizationId = _requiredOrganizationId();
    final locationId = _requiredLocationId();
    return AdminSnapshot(
      members: await _api.list('organizations/$organizationId/members'),
      merchants: await _api.list('merchants'),
      locations: await _api.list('locations'),
      devices: await _api.list('devices'),
      vatRates: await _api.list(
        'vat-rates',
        queryParameters: const {'page': 1, 'pageSize': 100},
      ),
      categories: await _api.list(
        'categories',
        queryParameters: const {'page': 1, 'pageSize': 100},
      ),
      products: await _api.list(
        'products',
        queryParameters: const {'page': 1, 'pageSize': 100},
      ),
      priceLists: await _api.list(
        'price-lists',
        queryParameters: const {'page': 1, 'pageSize': 100},
      ),
      areas: await _api.list(
        'dining-areas',
        queryParameters: {'locationId': locationId},
      ),
      tables: await _api.list(
        'dining-tables',
        queryParameters: {'locationId': locationId},
      ),
      stations: await _api.list(
        'kitchen-stations',
        queryParameters: {'locationId': locationId},
      ),
      printers: await _api.list(
        'printers',
        queryParameters: {'locationId': locationId, 'page': 1, 'pageSize': 100},
      ),
    );
  }

  Future<bool> _mutate(
    String successMessage,
    Future<void> Function() action,
  ) async {
    if (_busy) {
      return false;
    }
    _busy = true;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
    try {
      await action();
      _snapshot = await _loadSnapshot();
      _noticeMessage = successMessage;
      return true;
    } catch (error) {
      _errorMessage = _message(error);
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<Map<String, Object?>> _ensureByCode(
    List<Map<String, Object?>> values,
    String code,
    Future<Map<String, Object?>> Function() create,
  ) async {
    for (final value in values) {
      if (value['code']?.toString().toUpperCase() == code.toUpperCase()) {
        return value;
      }
    }
    return create();
  }

  String _requiredOrganizationId() =>
      _organizationId ?? (throw StateError('Organizzazione non disponibile.'));

  String _requiredLocationId() =>
      _locationId ?? (throw StateError('Location non disponibile.'));

  String _requiredDeviceId() =>
      _deviceId ?? (throw StateError('Dispositivo non disponibile.'));

  String _requiredId(Map<String, Object?> value, String entity) {
    final id = value['id']?.toString();
    if (id == null || id.isEmpty) {
      throw StateError('Il backend non ha restituito l’ID per $entity.');
    }
    return id;
  }

  String _message(Object error) => switch (error) {
    final BackendError value => value.message,
    final StateError value => value.message.toString(),
    _ => 'Operazione amministrativa non riuscita.',
  };
}
