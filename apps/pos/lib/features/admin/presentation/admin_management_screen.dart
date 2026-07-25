import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/backend_error.dart';

class AdminManagementScreen extends ConsumerStatefulWidget {
  const AdminManagementScreen({super.key});

  @override
  ConsumerState<AdminManagementScreen> createState() =>
      _AdminManagementScreenState();
}

class _AdminManagementScreenState
    extends ConsumerState<AdminManagementScreen> {
  bool _loading = true;
  String? _error;
  String? _notice;
  final Map<String, List<Map<String, Object?>>> _items = {};
  List<Map<String, Object?>> _routes = const [];

  static const _specs = <_EntitySpec>[
    _EntitySpec(
      keyName: 'merchants',
      title: 'Merchant',
      endpoint: 'merchants',
      icon: Icons.business_outlined,
      fields: [
        _Field('legalName', 'Ragione sociale'),
        _Field('tradeName', 'Nome commerciale'),
        _Field('vatNumber', 'Partita IVA'),
        _Field('taxCode', 'Codice fiscale'),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'locations',
      title: 'Sedi',
      endpoint: 'locations',
      icon: Icons.store_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('addressLine1', 'Indirizzo'),
        _Field('postalCode', 'CAP'),
        _Field('city', 'Città'),
        _Field('province', 'Provincia'),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'vatRates',
      title: 'Aliquote IVA',
      endpoint: 'vat-rates',
      icon: Icons.percent,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('rateBasisPoints', 'Basis point', number: true),
        _Field('isDefault', 'Predefinita', options: ['true', 'false']),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
    ),
    _EntitySpec(
      keyName: 'categories',
      title: 'Categorie',
      endpoint: 'categories',
      icon: Icons.category_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('colorHex', 'Colore'),
        _Field('sortOrder', 'Ordinamento', number: true),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
    ),
    _EntitySpec(
      keyName: 'products',
      title: 'Prodotti',
      endpoint: 'products',
      icon: Icons.inventory_2_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('sku', 'SKU'),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
    ),
    _EntitySpec(
      keyName: 'priceLists',
      title: 'Listini',
      endpoint: 'price-lists',
      icon: Icons.price_change_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('priority', 'Priorità', number: true),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'areas',
      title: 'Sale',
      endpoint: 'dining-areas',
      icon: Icons.meeting_room_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('sortOrder', 'Ordinamento', number: true),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'tables',
      title: 'Tavoli',
      endpoint: 'dining-tables',
      icon: Icons.table_restaurant_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('capacity', 'Posti', number: true),
        _Field('sortOrder', 'Ordinamento', number: true),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'stations',
      title: 'Postazioni cucina',
      endpoint: 'kitchen-stations',
      icon: Icons.soup_kitchen_outlined,
      fields: [
        _Field('code', 'Codice'),
        _Field('name', 'Nome'),
        _Field('sortOrder', 'Ordinamento', number: true),
        _Field('status', 'Stato', options: ['ACTIVE', 'INACTIVE']),
      ],
      softDelete: true,
    ),
    _EntitySpec(
      keyName: 'printers',
      title: 'Stampanti backend',
      endpoint: 'printers',
      icon: Icons.print_outlined,
      fields: [
        _Field('name', 'Nome'),
        _Field(
          'purpose',
          'Utilizzo',
          options: ['RECEIPT', 'KITCHEN', 'LABEL', 'GENERIC'],
        ),
        _Field('status', 'Stato', options: ['ACTIVE', 'DISABLED']),
      ],
      softDelete: true,
      inactiveValue: 'DISABLED',
    ),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = ref.read(authControllerProvider).state;
    final locationId = auth.deviceAssignment?.location?.id;
    if (locationId == null) {
      setState(() {
        _loading = false;
        _error = 'Location operativa non disponibile.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(adminApiProvider);
    try {
      for (final spec in _specs) {
        final query = switch (spec.keyName) {
          'areas' || 'tables' || 'stations' || 'printers' => {
            'locationId': locationId,
            'page': 1,
            'pageSize': 100,
          },
          'vatRates' || 'categories' || 'products' || 'priceLists' => {
            'page': 1,
            'pageSize': 100,
          },
          _ => null,
        };
        _items[spec.keyName] = await api.list(
          spec.endpoint,
          queryParameters: query,
        );
      }
      _routes = await api.list(
        'print-routes',
        queryParameters: {'locationId': locationId},
      );
    } catch (error) {
      _error = _message(error);
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestione amministrativa'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Aggiorna',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    _MessageCard(message: _error!, error: true),
                  if (_notice != null)
                    _MessageCard(message: _notice!, error: false),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.info_outline),
                      title: const Text('Gestione sicura dei dati'),
                      subtitle: const Text(
                        'Le entità già usate da ordini o documenti vengono disattivate o archiviate, così lo storico rimane integro.',
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (final spec in _specs) _buildEntitySection(spec),
                  _buildRoutesSection(),
                ],
              ),
            ),
    );
  }

  Widget _buildEntitySection(_EntitySpec spec) {
    final values = _items[spec.keyName] ?? const [];
    return Card(
      child: ExpansionTile(
        leading: Icon(spec.icon),
        title: Text(spec.title),
        subtitle: Text('${values.length} elementi'),
        children: [
          if (values.isEmpty)
            const ListTile(title: Text('Nessun elemento configurato.')),
          for (final value in values)
            ListTile(
              title: Text(_entityTitle(value)),
              subtitle: Text(_entitySubtitle(value)),
              trailing: PopupMenuButton<String>(
                onSelected: (action) async {
                  if (action == 'edit') {
                    await _editEntity(spec, value);
                  } else {
                    await _removeEntity(spec, value);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', child: Text('Modifica')),
                  PopupMenuItem(
                    value: 'remove',
                    child: Text(spec.softDelete ? 'Disattiva' : 'Archivia'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildRoutesSection() {
    final printers = _items['printers'] ?? const [];
    final stations = _items['stations'] ?? const [];
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.alt_route),
        title: const Text('Rotte di stampa'),
        subtitle: Text('${_routes.length} rotte configurate'),
        trailing: IconButton(
          tooltip: 'Nuova rotta',
          onPressed: printers.isEmpty
              ? null
              : () => _configureRoute(printers, stations),
          icon: const Icon(Icons.add),
        ),
        children: [
          if (_routes.isEmpty)
            const ListTile(
              title: Text('Nessuna rotta configurata.'),
              subtitle: Text(
                'Crea una rotta per riepiloghi pagamento, ordini o comande cucina.',
              ),
            ),
          for (final route in _routes)
            ListTile(
              leading: const Icon(Icons.print),
              title: Text(
                '${_documentLabel(route['documentType'])} → ${route['printerName'] ?? route['printerCode']}',
              ),
              subtitle: Text(
                '${route['kitchenStationName'] ?? 'Predefinita'} · ${route['copies'] ?? 1} copia/e · ${route['active'] == true ? 'Attiva' : 'Disattivata'}',
              ),
              trailing: PopupMenuButton<String>(
                onSelected: (action) async {
                  if (action == 'edit') {
                    await _configureRoute(printers, stations, route: route);
                  } else {
                    await _deleteRoute(route);
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'edit', child: Text('Modifica')),
                  PopupMenuItem(value: 'delete', child: Text('Elimina')),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _editEntity(
    _EntitySpec spec,
    Map<String, Object?> value,
  ) async {
    final result = await _showEntityDialog(context, spec, value);
    if (result == null) return;
    final id = value['id']?.toString();
    if (id == null) return;
    await _runMutation(() async {
      await ref.read(adminApiProvider).patch('${spec.endpoint}/$id', data: result);
    }, '${spec.title}: modifiche salvate.');
  }

  Future<void> _removeEntity(
    _EntitySpec spec,
    Map<String, Object?> value,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(spec.softDelete ? 'Disattivare elemento?' : 'Archiviare elemento?'),
        content: Text(_entityTitle(value)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(spec.softDelete ? 'Disattiva' : 'Archivia'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final id = value['id']?.toString();
    if (id == null) return;
    await _runMutation(() async {
      if (spec.softDelete) {
        await ref.read(adminApiProvider).patch(
          '${spec.endpoint}/$id',
          data: {'status': spec.inactiveValue},
        );
      } else {
        await ref.read(adminApiProvider).delete('${spec.endpoint}/$id');
      }
    }, '${spec.title}: elemento rimosso dalla configurazione attiva.');
  }

  Future<void> _configureRoute(
    List<Map<String, Object?>> printers,
    List<Map<String, Object?>> stations, {
    Map<String, Object?>? route,
  }) async {
    final auth = ref.read(authControllerProvider).state;
    final locationId = auth.deviceAssignment?.location?.id;
    if (locationId == null) return;
    final values = await _showRouteDialog(
      context,
      printers: printers,
      stations: stations,
      route: route,
    );
    if (values == null) return;
    await _runMutation(() async {
      if (route != null && route['id'] != null) {
        await ref.read(adminApiProvider).delete('print-routes/${route['id']}');
      }
      await ref.read(adminApiProvider).put(
        'print-routes',
        data: {
          'locationId': locationId,
          'documentType': values['documentType'],
          'printerId': values['printerId'],
          'copies': int.parse(values['copies']!),
          'active': values['active'] == 'true',
          if (values['documentType'] == 'KITCHEN_TICKET')
            'kitchenStationId': values['kitchenStationId'],
        },
      );
    }, 'Rotta di stampa salvata.');
  }

  Future<void> _deleteRoute(Map<String, Object?> route) async {
    final id = route['id']?.toString();
    if (id == null) return;
    await _runMutation(() async {
      await ref.read(adminApiProvider).delete('print-routes/$id');
    }, 'Rotta di stampa eliminata.');
  }

  Future<void> _runMutation(
    Future<void> Function() action,
    String success,
  ) async {
    setState(() {
      _loading = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
      _notice = success;
      await _load();
    } catch (error) {
      setState(() {
        _loading = false;
        _error = _message(error);
      });
    }
  }

  String _entityTitle(Map<String, Object?> value) =>
      (value['name'] ??
              value['tradeName'] ??
              value['legalName'] ??
              value['code'] ??
              value['id'])
          .toString();

  String _entitySubtitle(Map<String, Object?> value) {
    final code = value['code']?.toString();
    final status = value['status']?.toString();
    return [
      if (code != null) code,
      if (status != null) status,
    ].join(' · ');
  }

  String _message(Object error) => switch (error) {
    final BackendError value => value.message,
    _ => 'Operazione amministrativa non riuscita: $error',
  };

  String _documentLabel(Object? value) => switch (value?.toString()) {
    'PAYMENT_RECEIPT' => 'Riepilogo pagamento',
    'ORDER_RECEIPT' => 'Riepilogo ordine',
    'KITCHEN_TICKET' => 'Comanda cucina',
    'TEST_PAGE' => 'Pagina di test',
    _ => value?.toString() ?? 'Documento',
  };
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, required this.error});

  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(error ? Icons.error_outline : Icons.check_circle_outline),
      title: Text(message),
    ),
  );
}

class _EntitySpec {
  const _EntitySpec({
    required this.keyName,
    required this.title,
    required this.endpoint,
    required this.icon,
    required this.fields,
    this.softDelete = false,
    this.inactiveValue = 'INACTIVE',
  });

  final String keyName;
  final String title;
  final String endpoint;
  final IconData icon;
  final List<_Field> fields;
  final bool softDelete;
  final String inactiveValue;
}

class _Field {
  const _Field(this.keyName, this.label, {this.number = false, this.options});

  final String keyName;
  final String label;
  final bool number;
  final List<String>? options;
}

Future<Map<String, Object?>?> _showEntityDialog(
  BuildContext context,
  _EntitySpec spec,
  Map<String, Object?> entity,
) async {
  final controllers = <String, TextEditingController>{};
  final values = <String, String>{};
  for (final field in spec.fields) {
    final initial = entity[field.keyName]?.toString() ?? '';
    values[field.keyName] = initial;
    if (field.options == null) {
      controllers[field.keyName] = TextEditingController(text: initial);
    }
  }
  final result = await showDialog<Map<String, Object?>>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text('Modifica ${spec.title}'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final field in spec.fields)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: field.options == null
                        ? TextField(
                            controller: controllers[field.keyName],
                            keyboardType: field.number
                                ? TextInputType.number
                                : TextInputType.text,
                            decoration: InputDecoration(
                              labelText: field.label,
                              border: const OutlineInputBorder(),
                            ),
                          )
                        : DropdownButtonFormField<String>(
                            value: field.options!.contains(values[field.keyName])
                                ? values[field.keyName]
                                : field.options!.first,
                            decoration: InputDecoration(
                              labelText: field.label,
                              border: const OutlineInputBorder(),
                            ),
                            items: field.options!
                                .map(
                                  (value) => DropdownMenuItem(
                                    value: value,
                                    child: Text(value),
                                  ),
                                )
                                .toList(growable: false),
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => values[field.keyName] = value);
                              }
                            },
                          ),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              final payload = <String, Object?>{};
              for (final field in spec.fields) {
                final raw = field.options == null
                    ? controllers[field.keyName]!.text.trim()
                    : values[field.keyName] ?? '';
                payload[field.keyName] = field.number
                    ? int.tryParse(raw)
                    : raw == 'true'
                    ? true
                    : raw == 'false'
                    ? false
                    : raw;
              }
              Navigator.pop(context, payload);
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

Future<Map<String, String>?> _showRouteDialog(
  BuildContext context, {
  required List<Map<String, Object?>> printers,
  required List<Map<String, Object?>> stations,
  Map<String, Object?>? route,
}) async {
  var documentType = route?['documentType']?.toString() ?? 'PAYMENT_RECEIPT';
  var printerId = route?['printerId']?.toString() ?? printers.first['id'].toString();
  var stationId = route?['kitchenStationId']?.toString() ??
      (stations.isEmpty ? '' : stations.first['id'].toString());
  var copies = route?['copies']?.toString() ?? '1';
  var active = route?['active'] == false ? 'false' : 'true';

  return showDialog<Map<String, String>>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(route == null ? 'Nuova rotta di stampa' : 'Modifica rotta'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: documentType,
                  decoration: const InputDecoration(
                    labelText: 'Documento',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'PAYMENT_RECEIPT',
                      child: Text('Riepilogo pagamento'),
                    ),
                    DropdownMenuItem(
                      value: 'ORDER_RECEIPT',
                      child: Text('Riepilogo ordine'),
                    ),
                    DropdownMenuItem(
                      value: 'KITCHEN_TICKET',
                      child: Text('Comanda cucina'),
                    ),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => documentType = value);
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: printerId,
                  decoration: const InputDecoration(
                    labelText: 'Stampante',
                    border: OutlineInputBorder(),
                  ),
                  items: printers
                      .map(
                        (printer) => DropdownMenuItem(
                          value: printer['id'].toString(),
                          child: Text(
                            '${printer['name'] ?? printer['code']} · ${printer['purpose']}',
                          ),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value != null) setState(() => printerId = value);
                  },
                ),
                if (documentType == 'KITCHEN_TICKET') ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: stationId.isEmpty ? null : stationId,
                    decoration: const InputDecoration(
                      labelText: 'Postazione cucina',
                      border: OutlineInputBorder(),
                    ),
                    items: stations
                        .map(
                          (station) => DropdownMenuItem(
                            value: station['id'].toString(),
                            child: Text('${station['name'] ?? station['code']}'),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: (value) {
                      if (value != null) setState(() => stationId = value);
                    },
                  ),
                ],
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: copies,
                  decoration: const InputDecoration(
                    labelText: 'Copie',
                    border: OutlineInputBorder(),
                  ),
                  items: const ['1', '2', '3', '4', '5']
                      .map(
                        (value) => DropdownMenuItem(
                          value: value,
                          child: Text(value),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value != null) setState(() => copies = value);
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: active,
                  decoration: const InputDecoration(
                    labelText: 'Stato',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'true', child: Text('Attiva')),
                    DropdownMenuItem(value: 'false', child: Text('Disattivata')),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => active = value);
                  },
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: documentType == 'KITCHEN_TICKET' && stationId.isEmpty
                ? null
                : () => Navigator.pop(context, {
                    'documentType': documentType,
                    'printerId': printerId,
                    'kitchenStationId': stationId,
                    'copies': copies,
                    'active': active,
                  }),
            child: const Text('Salva'),
          ),
        ],
      ),
    ),
  );
}
