import '../../orders/domain/order_models.dart';

class FloorSnapshot {
  const FloorSnapshot({required this.locationId, required this.areas});

  factory FloorSnapshot.fromJson(Map<String, Object?> json) {
    final rawAreas = json['areas'];
    return FloorSnapshot(
      locationId: _requiredString(json, 'locationId'),
      areas: rawAreas is List
          ? rawAreas
                .map(
                  (value) => DiningAreaFloor.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <DiningAreaFloor>[],
    );
  }

  final String locationId;
  final List<DiningAreaFloor> areas;

  List<DiningTableFloor> get tables =>
      areas.expand((area) => area.tables).toList(growable: false);

  DiningTableFloor? tableById(String tableId) {
    for (final table in tables) {
      if (table.id == tableId) {
        return table;
      }
    }
    return null;
  }
}

class DiningAreaFloor {
  const DiningAreaFloor({
    required this.id,
    required this.code,
    required this.name,
    required this.sortOrder,
    required this.tables,
  });

  factory DiningAreaFloor.fromJson(Map<String, Object?> json) {
    final rawTables = json['tables'];
    return DiningAreaFloor(
      id: _requiredString(json, 'id'),
      code: _requiredString(json, 'code'),
      name: _requiredString(json, 'name'),
      sortOrder: _requiredInt(json, 'sortOrder'),
      tables: rawTables is List
          ? rawTables
                .map(
                  (value) => DiningTableFloor.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <DiningTableFloor>[],
    );
  }

  final String id;
  final String code;
  final String name;
  final int sortOrder;
  final List<DiningTableFloor> tables;
}

class DiningTableFloor {
  const DiningTableFloor({
    required this.id,
    required this.code,
    required this.name,
    required this.capacity,
    required this.sortOrder,
    required this.occupied,
    required this.session,
  });

  factory DiningTableFloor.fromJson(Map<String, Object?> json) {
    final rawSession = json['session'];
    return DiningTableFloor(
      id: _requiredString(json, 'id'),
      code: _requiredString(json, 'code'),
      name: _requiredString(json, 'name'),
      capacity: _requiredInt(json, 'capacity'),
      sortOrder: _requiredInt(json, 'sortOrder'),
      occupied: json['occupied'] == true,
      session: rawSession is Map
          ? FloorTableSession.fromJson(Map<String, Object?>.from(rawSession))
          : null,
    );
  }

  final String id;
  final String code;
  final String name;
  final int capacity;
  final int sortOrder;
  final bool occupied;
  final FloorTableSession? session;
}

class FloorTableSession {
  const FloorTableSession({
    required this.id,
    required this.guestCount,
    required this.openedAt,
    required this.version,
    required this.openTotalCents,
    required this.orderCount,
  });

  factory FloorTableSession.fromJson(Map<String, Object?> json) =>
      FloorTableSession(
        id: _requiredString(json, 'id'),
        guestCount: _requiredInt(json, 'guestCount'),
        openedAt: _requiredDateTime(json, 'openedAt'),
        version: _requiredInt(json, 'version'),
        openTotalCents: _requiredInt(json, 'openTotalCents'),
        orderCount: _requiredInt(json, 'orderCount'),
      );

  final String id;
  final int guestCount;
  final DateTime openedAt;
  final int version;
  final int openTotalCents;
  final int orderCount;
}

enum TableSessionStatus {
  open('OPEN', 'Aperto'),
  closed('CLOSED', 'Chiuso'),
  cancelled('CANCELLED', 'Annullato');

  const TableSessionStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  bool get isOpen => this == TableSessionStatus.open;

  static TableSessionStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato sessione tavolo non supportato: $wireValue');
  }
}

class TableSessionDetail {
  const TableSessionDetail({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.tableId,
    required this.deviceId,
    required this.clientSessionId,
    required this.status,
    required this.guestCount,
    required this.note,
    required this.version,
    required this.openedAt,
    required this.closedAt,
    required this.cancelledAt,
    required this.table,
    required this.orders,
  });

  factory TableSessionDetail.fromJson(Map<String, Object?> json) {
    final rawTable = json['table'];
    final rawOrders = json['orders'];
    return TableSessionDetail(
      id: _requiredString(json, 'id'),
      organizationId: _requiredString(json, 'organizationId'),
      locationId: _requiredString(json, 'locationId'),
      tableId: _requiredString(json, 'tableId'),
      deviceId: _requiredString(json, 'deviceId'),
      clientSessionId: _requiredString(json, 'clientSessionId'),
      status: TableSessionStatus.fromWire(json['status']),
      guestCount: _requiredInt(json, 'guestCount'),
      note: _optionalString(json['note']),
      version: _requiredInt(json, 'version'),
      openedAt: _requiredDateTime(json, 'openedAt'),
      closedAt: _optionalDateTime(json['closedAt']),
      cancelledAt: _optionalDateTime(json['cancelledAt']),
      table: rawTable is Map
          ? SessionTable.fromJson(Map<String, Object?>.from(rawTable))
          : null,
      orders: rawOrders is List
          ? rawOrders
                .map(
                  (value) => OrderHeader.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <OrderHeader>[],
    );
  }

  final String id;
  final String organizationId;
  final String locationId;
  final String tableId;
  final String deviceId;
  final String clientSessionId;
  final TableSessionStatus status;
  final int guestCount;
  final String? note;
  final int version;
  final DateTime openedAt;
  final DateTime? closedAt;
  final DateTime? cancelledAt;
  final SessionTable? table;
  final List<OrderHeader> orders;

  bool get hasBlockingOrders => orders.any(
    (order) =>
        order.status != OrderStatus.paid &&
        order.status != OrderStatus.cancelled,
  );

  int get totalCents => orders
      .where((order) => order.status != OrderStatus.cancelled)
      .fold(0, (total, order) => total + order.totalCents);

  String get currency => orders.isEmpty ? 'EUR' : orders.first.currency;
}

class SessionTable {
  const SessionTable({
    required this.id,
    required this.code,
    required this.name,
    required this.capacity,
    required this.areaId,
    required this.areaCode,
    required this.areaName,
  });

  factory SessionTable.fromJson(Map<String, Object?> json) => SessionTable(
    id: _requiredString(json, 'id'),
    code: _requiredString(json, 'code'),
    name: _requiredString(json, 'name'),
    capacity: _requiredInt(json, 'capacity'),
    areaId: _requiredString(json, 'areaId'),
    areaCode: _requiredString(json, 'areaCode'),
    areaName: _requiredString(json, 'areaName'),
  );

  final String id;
  final String code;
  final String name;
  final int capacity;
  final String areaId;
  final String areaCode;
  final String areaName;
}

class KitchenStation {
  const KitchenStation({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.code,
    required this.name,
    required this.sortOrder,
    required this.status,
  });

  factory KitchenStation.fromJson(Map<String, Object?> json) => KitchenStation(
    id: _requiredString(json, 'id'),
    organizationId: _requiredString(json, 'organizationId'),
    locationId: _requiredString(json, 'locationId'),
    code: _requiredString(json, 'code'),
    name: _requiredString(json, 'name'),
    sortOrder: _requiredInt(json, 'sortOrder'),
    status: _requiredString(json, 'status'),
  );

  final String id;
  final String organizationId;
  final String locationId;
  final String code;
  final String name;
  final int sortOrder;
  final String status;

  bool get isActive => status == 'ACTIVE';
}

class KitchenStationReference {
  const KitchenStationReference({
    required this.id,
    required this.code,
    required this.name,
  });

  factory KitchenStationReference.fromJson(Map<String, Object?> json) =>
      KitchenStationReference(
        id: _requiredString(json, 'id'),
        code: _requiredString(json, 'code'),
        name: _requiredString(json, 'name'),
      );

  final String id;
  final String code;
  final String name;
}

enum KitchenTicketStatus {
  queued('QUEUED', 'In coda'),
  inProgress('IN_PROGRESS', 'In lavorazione'),
  ready('READY', 'Pronta'),
  served('SERVED', 'Servita'),
  cancelled('CANCELLED', 'Annullata');

  const KitchenTicketStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static KitchenTicketStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato comanda non supportato: $wireValue');
  }
}

class KitchenTicketSummary {
  const KitchenTicketSummary({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.orderId,
    required this.stationId,
    required this.number,
    required this.status,
    required this.version,
    required this.tableCodeSnapshot,
    required this.queuedAt,
  });

  factory KitchenTicketSummary.fromJson(Map<String, Object?> json) =>
      KitchenTicketSummary(
        id: _requiredString(json, 'id'),
        organizationId: _requiredString(json, 'organizationId'),
        locationId: _requiredString(json, 'locationId'),
        orderId: _requiredString(json, 'orderId'),
        stationId: _requiredString(json, 'stationId'),
        number: _requiredString(json, 'number'),
        status: KitchenTicketStatus.fromWire(json['status']),
        version: _requiredInt(json, 'version'),
        tableCodeSnapshot: _optionalString(json['tableCodeSnapshot']),
        queuedAt: _requiredDateTime(json, 'queuedAt'),
      );

  final String id;
  final String organizationId;
  final String locationId;
  final String orderId;
  final String stationId;
  final String number;
  final KitchenTicketStatus status;
  final int version;
  final String? tableCodeSnapshot;
  final DateTime queuedAt;
}

class KitchenTicketDetail {
  const KitchenTicketDetail({
    required this.ticket,
    required this.station,
    required this.items,
  });

  factory KitchenTicketDetail.fromJson(Map<String, Object?> json) {
    final rawStation = json['station'];
    final rawItems = json['items'];
    return KitchenTicketDetail(
      ticket: KitchenTicketSummary.fromJson(json),
      station: rawStation is Map
          ? KitchenStationReference.fromJson(
              Map<String, Object?>.from(rawStation),
            )
          : null,
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => KitchenTicketItem.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <KitchenTicketItem>[],
    );
  }

  final KitchenTicketSummary ticket;
  final KitchenStationReference? station;
  final List<KitchenTicketItem> items;
}

class KitchenTicketItem {
  const KitchenTicketItem({
    required this.id,
    required this.orderItemId,
    required this.quantityAmount,
    required this.quantityScale,
    required this.productName,
    required this.variantName,
    required this.note,
  });

  factory KitchenTicketItem.fromJson(Map<String, Object?> json) =>
      KitchenTicketItem(
        id: _requiredString(json, 'id'),
        orderItemId: _requiredString(json, 'orderItemId'),
        quantityAmount: _requiredInt(json, 'quantityAmount'),
        quantityScale: _requiredInt(json, 'quantityScale'),
        productName: _requiredString(json, 'productName'),
        variantName: _optionalString(json['variantName']),
        note: _optionalString(json['note']),
      );

  final String id;
  final String orderItemId;
  final int quantityAmount;
  final int quantityScale;
  final String productName;
  final String? variantName;
  final String? note;

  String get displayName =>
      variantName == null ? productName : '$productName · $variantName';

  String get displayQuantity {
    if (quantityScale == 0) {
      return quantityAmount.toString();
    }
    final divisor = _pow10(quantityScale);
    return (quantityAmount / divisor)
        .toStringAsFixed(quantityScale)
        .replaceAll('.', ',');
  }
}

class KitchenDispatchBatch {
  const KitchenDispatchBatch({
    required this.id,
    required this.locationId,
    required this.orderId,
    required this.clientBatchId,
    required this.createdAt,
    required this.tickets,
  });

  factory KitchenDispatchBatch.fromJson(Map<String, Object?> json) {
    final rawTickets = json['tickets'];
    return KitchenDispatchBatch(
      id: _requiredString(json, 'id'),
      locationId: _requiredString(json, 'locationId'),
      orderId: _requiredString(json, 'orderId'),
      clientBatchId: _requiredString(json, 'clientBatchId'),
      createdAt: _requiredDateTime(json, 'createdAt'),
      tickets: rawTickets is List
          ? rawTickets
                .map(
                  (value) => KitchenTicketSummary.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <KitchenTicketSummary>[],
    );
  }

  final String id;
  final String locationId;
  final String orderId;
  final String clientBatchId;
  final DateTime createdAt;
  final List<KitchenTicketSummary> tickets;
}

int _pow10(int scale) {
  var result = 1;
  for (var index = 0; index < scale; index += 1) {
    result *= 10;
  }
  return result;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) {
    return value;
  }
  throw FormatException('Campo hospitality non valido: $key');
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  throw FormatException('Campo hospitality non valido: $key');
}

DateTime _requiredDateTime(Map<String, Object?> json, String key) {
  final value = DateTime.tryParse(json[key]?.toString() ?? '');
  if (value == null) {
    throw FormatException('Data hospitality non valida: $key');
  }
  return value;
}

DateTime? _optionalDateTime(Object? value) =>
    DateTime.tryParse(value?.toString() ?? '');

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
