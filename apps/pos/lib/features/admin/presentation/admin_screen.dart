import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import 'admin_controller.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
  String? _scheduledContext;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final controller = ref.watch(adminControllerProvider);
    final session = auth.session;
    final location = auth.deviceAssignment?.location;

    if (session == null || location == null || session.organizationId == null) {
      return const Scaffold(
        body: FluxaEmptyView(
          icon: Icons.admin_panel_settings_outlined,
          title: 'Amministrazione non disponibile',
          message:
              'Completa il contesto operativo prima di aprire l’amministrazione.',
        ),
      );
    }

    final canManage = {'OWNER', 'ADMIN', 'MANAGER'}.contains(session.role);
    if (!canManage) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Amministrazione'),
          leading: IconButton(
            onPressed: () => context.go('/settings'),
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        body: const FluxaEmptyView(
          icon: Icons.lock_outline,
          title: 'Permessi insufficienti',
          message:
              'La sezione è riservata a proprietari, amministratori e manager.',
        ),
      );
    }

    _scheduleBind(
      controller,
      organizationId: session.organizationId!,
      locationId: location.id,
      deviceId: session.device.id,
    );

    final snapshot = controller.snapshot;
    final ownerOrAdmin = {'OWNER', 'ADMIN'}.contains(session.role);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Amministrazione'),
        leading: IconButton(
          tooltip: 'Torna alle impostazioni',
          onPressed: () => context.go('/settings'),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          IconButton(
            tooltip: 'Aggiorna dati amministrativi',
            onPressed: controller.busy ? null : controller.refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: snapshot == null && controller.busy
          ? const FluxaLoadingView(label: 'Caricamento amministrazione')
          : RefreshIndicator(
              onRefresh: controller.refresh,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _AdminHero(
                    locationName: location.name,
                    busy: controller.busy,
                    onCreateDemo: controller.busy
                        ? null
                        : () => _confirmDemo(context, controller),
                  ),
                  if (controller.errorMessage != null) ...[
                    const SizedBox(height: 12),
                    _MessageCard(
                      message: controller.errorMessage!,
                      error: true,
                      onDismiss: controller.clearMessages,
                    ),
                  ] else if (controller.noticeMessage != null) ...[
                    const SizedBox(height: 12),
                    _MessageCard(
                      message: controller.noticeMessage!,
                      error: false,
                      onDismiss: controller.clearMessages,
                    ),
                  ],
                  const SizedBox(height: 16),
                  _AdminSection(
                    icon: Icons.group_outlined,
                    title: 'Utenti e accessi',
                    subtitle: '${snapshot?.members.length ?? 0} membri',
                    actions: [
                      if (ownerOrAdmin)
                        _AdminAction(
                          label: 'Nuovo utente',
                          icon: Icons.person_add_alt_1,
                          onPressed: controller.busy
                              ? null
                              : () => _createMember(context, controller),
                        ),
                    ],
                    preview: _EntityPreview(
                      values: snapshot?.members ?? const [],
                      label: (value) =>
                          '${value['displayName'] ?? value['email']} · ${value['role'] ?? ''}',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _AdminSection(
                    icon: Icons.store_mall_directory_outlined,
                    title: 'Azienda e sedi',
                    subtitle:
                        '${snapshot?.merchants.length ?? 0} merchant · ${snapshot?.locations.length ?? 0} location',
                    actions: [
                      _AdminAction(
                        label: 'Nuovo merchant',
                        icon: Icons.business_outlined,
                        onPressed: controller.busy
                            ? null
                            : () => _createMerchant(context, controller),
                      ),
                      _AdminAction(
                        label: 'Nuova location',
                        icon: Icons.add_location_alt_outlined,
                        onPressed:
                            controller.busy ||
                                snapshot?.merchants.isEmpty != false
                            ? null
                            : () => _createLocation(
                                context,
                                controller,
                                snapshot!.merchants,
                              ),
                      ),
                    ],
                    preview: _EntityPreview(
                      values: snapshot?.locations ?? const [],
                      label: (value) =>
                          '${value['code'] ?? ''} · ${value['name'] ?? ''}',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _AdminSection(
                    icon: Icons.inventory_2_outlined,
                    title: 'Catalogo e prezzi',
                    subtitle:
                        '${snapshot?.categories.length ?? 0} categorie · ${snapshot?.products.length ?? 0} prodotti · ${snapshot?.priceLists.length ?? 0} listini',
                    actions: [
                      _AdminAction(
                        label: 'Aliquota IVA',
                        icon: Icons.percent,
                        onPressed: controller.busy
                            ? null
                            : () => _createVatRate(context, controller),
                      ),
                      _AdminAction(
                        label: 'Categoria',
                        icon: Icons.category_outlined,
                        onPressed: controller.busy
                            ? null
                            : () => _createCategory(context, controller),
                      ),
                      _AdminAction(
                        label: 'Listino',
                        icon: Icons.price_change_outlined,
                        onPressed: controller.busy
                            ? null
                            : () => _createPriceList(context, controller),
                      ),
                      _AdminAction(
                        label: 'Prodotto con prezzo',
                        icon: Icons.add_box_outlined,
                        onPressed:
                            controller.busy ||
                                snapshot?.categories.isEmpty != false ||
                                snapshot?.vatRates.isEmpty != false ||
                                snapshot?.priceLists.isEmpty != false
                            ? null
                            : () => _createProduct(
                                context,
                                controller,
                                snapshot!,
                              ),
                      ),
                    ],
                    preview: _EntityPreview(
                      values: snapshot?.products ?? const [],
                      label: (value) =>
                          '${value['code'] ?? ''} · ${value['name'] ?? ''}',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _AdminSection(
                    icon: Icons.table_restaurant_outlined,
                    title: 'Sala e cucina',
                    subtitle:
                        '${snapshot?.areas.length ?? 0} sale · ${snapshot?.tables.length ?? 0} tavoli · ${snapshot?.stations.length ?? 0} postazioni',
                    actions: [
                      _AdminAction(
                        label: 'Sala',
                        icon: Icons.meeting_room_outlined,
                        onPressed: controller.busy
                            ? null
                            : () => _createArea(context, controller),
                      ),
                      _AdminAction(
                        label: 'Tavolo',
                        icon: Icons.table_bar_outlined,
                        onPressed:
                            controller.busy || snapshot?.areas.isEmpty != false
                            ? null
                            : () => _createTable(
                                context,
                                controller,
                                snapshot!.areas,
                              ),
                      ),
                      _AdminAction(
                        label: 'Postazione cucina',
                        icon: Icons.soup_kitchen_outlined,
                        onPressed: controller.busy
                            ? null
                            : () => _createStation(context, controller),
                      ),
                      _AdminAction(
                        label: 'Routing categoria',
                        icon: Icons.route_outlined,
                        onPressed:
                            controller.busy ||
                                snapshot?.stations.isEmpty != false ||
                                snapshot?.categories.isEmpty != false
                            ? null
                            : () => _routeCategory(
                                context,
                                controller,
                                snapshot!,
                              ),
                      ),
                    ],
                    preview: _EntityPreview(
                      values: snapshot?.tables ?? const [],
                      label: (value) =>
                          '${value['code'] ?? ''} · ${value['name'] ?? ''} · ${value['capacity'] ?? '?'} posti',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _AdminSection(
                    icon: Icons.print_outlined,
                    title: 'Stampa e fiscale',
                    subtitle:
                        '${snapshot?.printers.length ?? 0} stampanti backend',
                    actions: [
                      _AdminAction(
                        label: 'Stampante',
                        icon: Icons.add_to_queue,
                        onPressed: controller.busy
                            ? null
                            : () => _createPrinter(context, controller),
                      ),
                      if (ownerOrAdmin)
                        _AdminAction(
                          label: 'Profilo fiscale MOCK',
                          icon: Icons.receipt_long_outlined,
                          onPressed: controller.busy
                              ? null
                              : () => _configureFiscal(context, controller),
                        ),
                    ],
                    preview: _EntityPreview(
                      values: snapshot?.printers ?? const [],
                      label: (value) =>
                          '${value['code'] ?? ''} · ${value['name'] ?? ''} · ${value['purpose'] ?? ''}',
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }

  void _scheduleBind(
    AdminController controller, {
    required String organizationId,
    required String locationId,
    required String deviceId,
  }) {
    final key = '$organizationId:$locationId:$deviceId';
    if (_scheduledContext == key && controller.snapshot != null) {
      return;
    }
    _scheduledContext = key;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.bindContext(
        organizationId: organizationId,
        locationId: locationId,
        deviceId: deviceId,
      );
      if (mounted) {
        setState(() {});
      }
    });
  }

  Future<void> _confirmDemo(
    BuildContext context,
    AdminController controller,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Creare configurazione demo completa?'),
        content: const Text(
          'Verranno creati o riutilizzati IVA 10%, categorie Pizze e Bibite, '
          'due prodotti, un listino, due tavoli, una postazione cucina, una '
          'stampante backend e un profilo fiscale MOCK. L’operazione è pensata '
          'per il collaudo locale.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Crea setup demo'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await controller.createDemoSetup();
    }
  }

  Future<void> _createMember(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuovo utente',
      fields: const [
        _FieldSpec(keyName: 'email', label: 'Email'),
        _FieldSpec(keyName: 'displayName', label: 'Nome visualizzato'),
        _FieldSpec(
          keyName: 'role',
          label: 'Ruolo',
          initialValue: 'CASHIER',
          options: {
            'OWNER': 'Proprietario',
            'ADMIN': 'Amministratore',
            'MANAGER': 'Manager',
            'CASHIER': 'Cassiere',
            'WAITER': 'Cameriere',
            'ACCOUNTANT': 'Contabile',
            'SUPPORT_READONLY': 'Supporto sola lettura',
          },
        ),
        _FieldSpec(
          keyName: 'password',
          label: 'Password temporanea (minimo 12 caratteri)',
          obscureText: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createMember(
      email: values['email']!,
      displayName: values['displayName']!,
      role: values['role']!,
      temporaryPassword: values['password']!,
    );
  }

  Future<void> _createMerchant(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuovo merchant',
      fields: const [
        _FieldSpec(keyName: 'legalName', label: 'Ragione sociale'),
        _FieldSpec(
          keyName: 'tradeName',
          label: 'Nome commerciale',
          required: false,
        ),
        _FieldSpec(keyName: 'vatNumber', label: 'Partita IVA'),
        _FieldSpec(
          keyName: 'taxCode',
          label: 'Codice fiscale',
          required: false,
        ),
      ],
    );
    if (values == null) return;
    await controller.createMerchant(
      legalName: values['legalName']!,
      tradeName: values['tradeName'] ?? '',
      vatNumber: values['vatNumber']!,
      taxCode: values['taxCode'] ?? '',
    );
  }

  Future<void> _createLocation(
    BuildContext context,
    AdminController controller,
    List<Map<String, Object?>> merchants,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova location',
      fields: [
        _FieldSpec(
          keyName: 'merchantId',
          label: 'Merchant',
          options: _options(
            merchants,
            (value) => value['tradeName'] ?? value['legalName'],
          ),
        ),
        const _FieldSpec(keyName: 'code', label: 'Codice location'),
        const _FieldSpec(keyName: 'name', label: 'Nome location'),
        const _FieldSpec(keyName: 'address', label: 'Indirizzo'),
        const _FieldSpec(keyName: 'postalCode', label: 'CAP'),
        const _FieldSpec(keyName: 'city', label: 'Città'),
        const _FieldSpec(
          keyName: 'province',
          label: 'Provincia',
          initialValue: 'PR',
        ),
      ],
    );
    if (values == null) return;
    await controller.createLocation(
      merchantId: values['merchantId']!,
      code: values['code']!,
      name: values['name']!,
      addressLine1: values['address']!,
      postalCode: values['postalCode']!,
      city: values['city']!,
      province: values['province']!,
    );
  }

  Future<void> _createVatRate(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova aliquota IVA',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice', initialValue: 'IVA10'),
        _FieldSpec(keyName: 'name', label: 'Nome', initialValue: 'IVA 10%'),
        _FieldSpec(
          keyName: 'rate',
          label: 'Aliquota in basis point (1000 = 10%)',
          initialValue: '1000',
          number: true,
        ),
        _FieldSpec(
          keyName: 'default',
          label: 'Aliquota predefinita',
          initialValue: 'true',
          options: {'true': 'Sì', 'false': 'No'},
        ),
      ],
    );
    if (values == null) return;
    await controller.createVatRate(
      code: values['code']!,
      name: values['name']!,
      rateBasisPoints: int.parse(values['rate']!),
      isDefault: values['default'] == 'true',
    );
  }

  Future<void> _createCategory(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova categoria',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice'),
        _FieldSpec(keyName: 'name', label: 'Nome'),
        _FieldSpec(
          keyName: 'color',
          label: 'Colore #RRGGBB',
          initialValue: '#4D5DFB',
        ),
        _FieldSpec(
          keyName: 'sort',
          label: 'Ordinamento',
          initialValue: '10',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createCategory(
      code: values['code']!,
      name: values['name']!,
      colorHex: values['color']!,
      sortOrder: int.parse(values['sort']!),
    );
  }

  Future<void> _createPriceList(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuovo listino',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice'),
        _FieldSpec(keyName: 'name', label: 'Nome'),
        _FieldSpec(
          keyName: 'priority',
          label: 'Priorità',
          initialValue: '100',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createPriceList(
      code: values['code']!,
      name: values['name']!,
      priority: int.parse(values['priority']!),
    );
  }

  Future<void> _createProduct(
    BuildContext context,
    AdminController controller,
    AdminSnapshot snapshot,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuovo prodotto con prezzo',
      fields: [
        _FieldSpec(
          keyName: 'categoryId',
          label: 'Categoria',
          options: _options(snapshot.categories, (value) => value['name']),
        ),
        _FieldSpec(
          keyName: 'vatRateId',
          label: 'Aliquota IVA',
          options: _options(snapshot.vatRates, (value) => value['name']),
        ),
        _FieldSpec(
          keyName: 'priceListId',
          label: 'Listino',
          options: _options(snapshot.priceLists, (value) => value['name']),
        ),
        const _FieldSpec(keyName: 'code', label: 'Codice prodotto'),
        const _FieldSpec(keyName: 'sku', label: 'SKU', required: false),
        const _FieldSpec(keyName: 'name', label: 'Nome prodotto'),
        const _FieldSpec(
          keyName: 'unit',
          label: 'Unità',
          initialValue: 'EACH',
          options: {'EACH': 'Pezzo', 'WEIGHT': 'Peso', 'VOLUME': 'Volume'},
        ),
        const _FieldSpec(
          keyName: 'price',
          label: 'Prezzo in centesimi (750 = €7,50)',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createProductWithPrice(
      categoryId: values['categoryId']!,
      vatRateId: values['vatRateId']!,
      priceListId: values['priceListId']!,
      code: values['code']!,
      sku: values['sku'] ?? '',
      name: values['name']!,
      unit: values['unit']!,
      amountCents: int.parse(values['price']!),
    );
  }

  Future<void> _createArea(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova sala',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice'),
        _FieldSpec(keyName: 'name', label: 'Nome'),
        _FieldSpec(
          keyName: 'sort',
          label: 'Ordinamento',
          initialValue: '10',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createArea(
      code: values['code']!,
      name: values['name']!,
      sortOrder: int.parse(values['sort']!),
    );
  }

  Future<void> _createTable(
    BuildContext context,
    AdminController controller,
    List<Map<String, Object?>> areas,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuovo tavolo',
      fields: [
        _FieldSpec(
          keyName: 'areaId',
          label: 'Sala',
          options: _options(areas, (value) => value['name']),
        ),
        const _FieldSpec(keyName: 'code', label: 'Codice tavolo'),
        const _FieldSpec(keyName: 'name', label: 'Nome tavolo'),
        const _FieldSpec(
          keyName: 'capacity',
          label: 'Posti',
          initialValue: '4',
          number: true,
        ),
        const _FieldSpec(
          keyName: 'sort',
          label: 'Ordinamento',
          initialValue: '10',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createTable(
      areaId: values['areaId']!,
      code: values['code']!,
      name: values['name']!,
      capacity: int.parse(values['capacity']!),
      sortOrder: int.parse(values['sort']!),
    );
  }

  Future<void> _createStation(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova postazione cucina',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice'),
        _FieldSpec(keyName: 'name', label: 'Nome'),
        _FieldSpec(
          keyName: 'sort',
          label: 'Ordinamento',
          initialValue: '10',
          number: true,
        ),
      ],
    );
    if (values == null) return;
    await controller.createStation(
      code: values['code']!,
      name: values['name']!,
      sortOrder: int.parse(values['sort']!),
    );
  }

  Future<void> _routeCategory(
    BuildContext context,
    AdminController controller,
    AdminSnapshot snapshot,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Routing categoria cucina',
      fields: [
        _FieldSpec(
          keyName: 'stationId',
          label: 'Postazione',
          options: _options(snapshot.stations, (value) => value['name']),
        ),
        _FieldSpec(
          keyName: 'categoryId',
          label: 'Categoria',
          options: _options(snapshot.categories, (value) => value['name']),
        ),
      ],
    );
    if (values == null) return;
    await controller.routeCategory(
      stationId: values['stationId']!,
      categoryId: values['categoryId']!,
    );
  }

  Future<void> _createPrinter(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Nuova stampante backend',
      fields: const [
        _FieldSpec(keyName: 'code', label: 'Codice stampante'),
        _FieldSpec(keyName: 'name', label: 'Nome stampante'),
        _FieldSpec(
          keyName: 'purpose',
          label: 'Utilizzo',
          initialValue: 'RECEIPT',
          options: {
            'RECEIPT': 'Ricevute',
            'KITCHEN': 'Cucina',
            'LABEL': 'Etichette',
            'GENERIC': 'Generica',
          },
        ),
      ],
    );
    if (values == null) return;
    await controller.createPrinter(
      code: values['code']!,
      name: values['name']!,
      purpose: values['purpose']!,
    );
  }

  Future<void> _configureFiscal(
    BuildContext context,
    AdminController controller,
  ) async {
    final values = await _showAdminForm(
      context,
      title: 'Profilo fiscale MOCK',
      fields: const [
        _FieldSpec(
          keyName: 'fiscalId',
          label: 'Partita IVA (11 cifre)',
          initialValue: '12345678901',
          number: true,
        ),
        _FieldSpec(
          keyName: 'displayName',
          label: 'Nome attività',
          initialValue: 'Fluxa Demo',
        ),
        _FieldSpec(keyName: 'email', label: 'Email ricevute', required: false),
      ],
    );
    if (values == null) return;
    await controller.configureMockFiscal(
      fiscalId: values['fiscalId']!,
      displayName: values['displayName']!,
      receiptEmail: values['email'] ?? '',
    );
  }
}

class _AdminHero extends StatelessWidget {
  const _AdminHero({
    required this.locationName,
    required this.busy,
    required this.onCreateDemo,
  });

  final String locationName;
  final bool busy;
  final VoidCallback? onCreateDemo;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.admin_panel_settings_outlined, size: 34),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Configurazione POS',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text(locationName),
                  ],
                ),
              ),
              if (busy)
                const SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Crea e verifica i dati necessari al funzionamento del POS senza '
            'passare da Swagger. Il setup demo è idempotente sui codici principali.',
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const Key('admin-create-demo-setup'),
              onPressed: onCreateDemo,
              icon: const Icon(Icons.auto_fix_high),
              label: const Text('Crea configurazione demo completa'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _AdminSection extends StatelessWidget {
  const _AdminSection({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actions,
    required this.preview,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final List<_AdminAction> actions;
  final Widget preview;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleLarge),
                    Text(subtitle),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: actions
                .map(
                  (action) => FilledButton.tonalIcon(
                    onPressed: action.onPressed,
                    icon: Icon(action.icon),
                    label: Text(action.label),
                  ),
                )
                .toList(growable: false),
          ),
          const SizedBox(height: 14),
          preview,
        ],
      ),
    ),
  );
}

class _AdminAction {
  const _AdminAction({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
}

class _EntityPreview extends StatelessWidget {
  const _EntityPreview({required this.values, required this.label});

  final List<Map<String, Object?>> values;
  final String Function(Map<String, Object?> value) label;

  @override
  Widget build(BuildContext context) {
    if (values.isEmpty) {
      return const Text('Nessun elemento configurato.');
    }
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: values
          .take(6)
          .map((value) => Chip(label: Text(label(value))))
          .toList(growable: false),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.error,
    required this.onDismiss,
  });

  final String message;
  final bool error;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(error ? Icons.error_outline : Icons.check_circle_outline),
      title: Text(message),
      trailing: IconButton(onPressed: onDismiss, icon: const Icon(Icons.close)),
    ),
  );
}

class _FieldSpec {
  const _FieldSpec({
    required this.keyName,
    required this.label,
    this.initialValue = '',
    this.options,
    this.required = true,
    this.number = false,
    this.obscureText = false,
  });

  final String keyName;
  final String label;
  final String initialValue;
  final Map<String, String>? options;
  final bool required;
  final bool number;
  final bool obscureText;
}

Future<Map<String, String>?> _showAdminForm(
  BuildContext context, {
  required String title,
  required List<_FieldSpec> fields,
}) async {
  final formKey = GlobalKey<FormState>();
  final controllers = <String, TextEditingController>{};
  final values = <String, String>{};

  for (final field in fields) {
    if (field.options == null) {
      controllers[field.keyName] = TextEditingController(
        text: field.initialValue,
      );
    } else {
      final options = field.options!;
      values[field.keyName] = field.initialValue.isNotEmpty
          ? field.initialValue
          : options.keys.first;
    }
  }

  final result = await showDialog<Map<String, String>>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(title),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: fields
                    .map(
                      (field) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: field.options == null
                            ? TextFormField(
                                controller: controllers[field.keyName],
                                obscureText: field.obscureText,
                                keyboardType: field.number
                                    ? TextInputType.number
                                    : TextInputType.text,
                                decoration: InputDecoration(
                                  labelText: field.label,
                                  border: const OutlineInputBorder(),
                                ),
                                validator: (value) {
                                  final normalized = value?.trim() ?? '';
                                  if (field.required && normalized.isEmpty) {
                                    return 'Campo obbligatorio';
                                  }
                                  if (field.number &&
                                      normalized.isNotEmpty &&
                                      int.tryParse(normalized) == null) {
                                    return 'Inserisci un numero intero';
                                  }
                                  return null;
                                },
                              )
                            : DropdownButtonFormField<String>(
                                value: values[field.keyName],
                                decoration: InputDecoration(
                                  labelText: field.label,
                                  border: const OutlineInputBorder(),
                                ),
                                items: field.options!.entries
                                    .map(
                                      (entry) => DropdownMenuItem(
                                        value: entry.key,
                                        child: Text(
                                          entry.value,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    )
                                    .toList(growable: false),
                                onChanged: (value) {
                                  if (value != null) {
                                    setState(
                                      () => values[field.keyName] = value,
                                    );
                                  }
                                },
                              ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) {
                return;
              }
              for (final entry in controllers.entries) {
                values[entry.key] = entry.value.text.trim();
              }
              Navigator.pop(dialogContext, Map<String, String>.from(values));
            },
            child: const Text('Salva'),
          ),
        ],
      ),
    ),
  );

  for (final controller in controllers.values) {
    controller.dispose();
  }
  return result;
}

Map<String, String> _options(
  List<Map<String, Object?>> values,
  Object? Function(Map<String, Object?> value) label,
) => {
  for (final value in values)
    if (value['id'] != null)
      value['id'].toString():
          label(value)?.toString() ?? value['id'].toString(),
};
