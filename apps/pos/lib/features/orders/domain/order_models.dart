import 'quantity_codec.dart';

class OrderListPage {
  const OrderListPage({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.items,
  });

  factory OrderListPage.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    return OrderListPage(
      page: _requiredInt(json, 'page'),
      pageSize: _requiredInt(json, 'pageSize'),
      total: _requiredInt(json, 'total'),
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => OrderHeader.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <OrderHeader>[],
    );
  }

  final int page;
  final int pageSize;
  final int total;
  final List<OrderHeader> items;
}

enum OrderStatus {
  open('OPEN', 'Aperto'),
  held('HELD', 'In attesa'),
  awaitingPayment('AWAITING_PAYMENT', 'In pagamento'),
  paid('PAID', 'Pagato'),
  cancelled('CANCELLED', 'Annullato');

  const OrderStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  bool get isEditable => this == OrderStatus.open;

  static OrderStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato ordine non supportato: $wireValue');
  }
}

enum OrderServiceMode {
  counter('COUNTER', 'Banco'),
  takeaway('TAKEAWAY', 'Asporto'),
  delivery('DELIVERY', 'Consegna'),
  table('TABLE', 'Tavolo');

  const OrderServiceMode(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static OrderServiceMode fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final mode in values) {
      if (mode.wireValue == wireValue) {
        return mode;
      }
    }
    throw FormatException('Modalità ordine non supportata: $wireValue');
  }
}

class OrderDraft {
  const OrderDraft({
    required this.clientOrderId,
    required this.serviceMode,
    required this.customerNote,
  });

  final String clientOrderId;
  final OrderServiceMode serviceMode;
  final String? customerNote;
}

class OrderHeader {
  const OrderHeader({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.deviceId,
    required this.createdByUserId,
    required this.clientOrderId,
    required this.number,
    required this.businessDate,
    required this.status,
    required this.serviceMode,
    required this.customerNote,
    required this.currency,
    required this.version,
    required this.subtotalCents,
    required this.discountCents,
    required this.totalCents,
    required this.netTotalCents,
    required this.taxTotalCents,
    required this.heldAt,
    required this.cancelledAt,
    required this.cancelReason,
    required this.createdAt,
    required this.updatedAt,
  });

  factory OrderHeader.fromJson(Map<String, Object?> json) => OrderHeader(
    id: _requiredString(json, 'id'),
    organizationId: _requiredString(json, 'organizationId'),
    locationId: _requiredString(json, 'locationId'),
    deviceId: _requiredString(json, 'deviceId'),
    createdByUserId: _requiredString(json, 'createdByUserId'),
    clientOrderId: _requiredString(json, 'clientOrderId'),
    number: _requiredString(json, 'number'),
    businessDate: _requiredString(json, 'businessDate'),
    status: OrderStatus.fromWire(json['status']),
    serviceMode: OrderServiceMode.fromWire(json['serviceMode']),
    customerNote: _optionalString(json['customerNote']),
    currency: _requiredString(json, 'currency'),
    version: _requiredInt(json, 'version'),
    subtotalCents: _requiredInt(json, 'subtotalCents'),
    discountCents: _requiredInt(json, 'discountCents'),
    totalCents: _requiredInt(json, 'totalCents'),
    netTotalCents: _requiredInt(json, 'netTotalCents'),
    taxTotalCents: _requiredInt(json, 'taxTotalCents'),
    heldAt: _optionalDateTime(json['heldAt']),
    cancelledAt: _optionalDateTime(json['cancelledAt']),
    cancelReason: _optionalString(json['cancelReason']),
    createdAt: _requiredDateTime(json, 'createdAt'),
    updatedAt: _requiredDateTime(json, 'updatedAt'),
  );

  final String id;
  final String organizationId;
  final String locationId;
  final String deviceId;
  final String createdByUserId;
  final String clientOrderId;
  final String number;
  final String businessDate;
  final OrderStatus status;
  final OrderServiceMode serviceMode;
  final String? customerNote;
  final String currency;
  final int version;
  final int subtotalCents;
  final int discountCents;
  final int totalCents;
  final int netTotalCents;
  final int taxTotalCents;
  final DateTime? heldAt;
  final DateTime? cancelledAt;
  final String? cancelReason;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class OrderDetail {
  const OrderDetail({
    required this.header,
    required this.items,
    required this.adjustments,
    required this.vatSummaries,
  });

  factory OrderDetail.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    final rawAdjustments = json['adjustments'];
    final rawVatSummaries = json['vatSummaries'];
    return OrderDetail(
      header: OrderHeader.fromJson(json),
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => OrderItem.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <OrderItem>[],
      adjustments: rawAdjustments is List
          ? rawAdjustments
                .map(
                  (value) => OrderAdjustment.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <OrderAdjustment>[],
      vatSummaries: rawVatSummaries is List
          ? rawVatSummaries
                .map(
                  (value) => OrderVatSummary.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <OrderVatSummary>[],
    );
  }

  final OrderHeader header;
  final List<OrderItem> items;
  final List<OrderAdjustment> adjustments;
  final List<OrderVatSummary> vatSummaries;

  bool get canHold => header.status == OrderStatus.open && items.isNotEmpty;
}

class OrderItem {
  const OrderItem({
    required this.id,
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
    required this.grossTotalCents,
    required this.allocatedDiscountCents,
    required this.finalGrossCents,
    required this.finalNetCents,
    required this.finalTaxCents,
    required this.vatRateIdSnapshot,
    required this.vatCodeSnapshot,
    required this.vatRateBasisPointsSnapshot,
    required this.vatNatureCodeSnapshot,
    required this.priceListIdSnapshot,
    required this.note,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory OrderItem.fromJson(Map<String, Object?> json) => OrderItem(
    id: _requiredString(json, 'id'),
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
    grossTotalCents: _requiredInt(json, 'grossTotalCents'),
    allocatedDiscountCents: _requiredInt(json, 'allocatedDiscountCents'),
    finalGrossCents: _requiredInt(json, 'finalGrossCents'),
    finalNetCents: _requiredInt(json, 'finalNetCents'),
    finalTaxCents: _requiredInt(json, 'finalTaxCents'),
    vatRateIdSnapshot: _requiredString(json, 'vatRateIdSnapshot'),
    vatCodeSnapshot: _requiredString(json, 'vatCodeSnapshot'),
    vatRateBasisPointsSnapshot: _requiredInt(
      json,
      'vatRateBasisPointsSnapshot',
    ),
    vatNatureCodeSnapshot: _optionalString(json['vatNatureCodeSnapshot']),
    priceListIdSnapshot: _requiredString(json, 'priceListIdSnapshot'),
    note: _optionalString(json['note']),
    sortOrder: _requiredInt(json, 'sortOrder'),
    createdAt: _requiredDateTime(json, 'createdAt'),
    updatedAt: _requiredDateTime(json, 'updatedAt'),
  );

  final String id;
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
  final int grossTotalCents;
  final int allocatedDiscountCents;
  final int finalGrossCents;
  final int finalNetCents;
  final int finalTaxCents;
  final String vatRateIdSnapshot;
  final String vatCodeSnapshot;
  final int vatRateBasisPointsSnapshot;
  final String? vatNatureCodeSnapshot;
  final String priceListIdSnapshot;
  final String? note;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get displayName => variantNameSnapshot == null
      ? productNameSnapshot
      : '$productNameSnapshot · $variantNameSnapshot';

  String get displayQuantity =>
      QuantityCodec.format(quantityAmount, quantityScale);
}

class OrderAdjustment {
  const OrderAdjustment({
    required this.id,
    required this.clientAdjustmentId,
    required this.type,
    required this.value,
    required this.reason,
    required this.appliedCents,
    required this.createdByUserId,
    required this.createdAt,
  });

  factory OrderAdjustment.fromJson(Map<String, Object?> json) =>
      OrderAdjustment(
        id: _requiredString(json, 'id'),
        clientAdjustmentId: _requiredString(json, 'clientAdjustmentId'),
        type: _requiredString(json, 'type'),
        value: _requiredInt(json, 'value'),
        reason: _requiredString(json, 'reason'),
        appliedCents: _requiredInt(json, 'appliedCents'),
        createdByUserId: _requiredString(json, 'createdByUserId'),
        createdAt: _requiredDateTime(json, 'createdAt'),
      );

  final String id;
  final String clientAdjustmentId;
  final String type;
  final int value;
  final String reason;
  final int appliedCents;
  final String createdByUserId;
  final DateTime createdAt;
}

class OrderVatSummary {
  const OrderVatSummary({
    required this.vatKey,
    required this.vatRateBasisPoints,
    required this.vatNatureCode,
    required this.grossCents,
    required this.netCents,
    required this.taxCents,
  });

  factory OrderVatSummary.fromJson(Map<String, Object?> json) =>
      OrderVatSummary(
        vatKey: _requiredString(json, 'vatKey'),
        vatRateBasisPoints: _requiredInt(json, 'vatRateBasisPoints'),
        vatNatureCode: _optionalString(json['vatNatureCode']),
        grossCents: _requiredInt(json, 'grossCents'),
        netCents: _requiredInt(json, 'netCents'),
        taxCents: _requiredInt(json, 'taxCents'),
      );

  final String vatKey;
  final int vatRateBasisPoints;
  final String? vatNatureCode;
  final int grossCents;
  final int netCents;
  final int taxCents;
}

String formatOrderMoney(int amountCents, String currency) {
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
  throw FormatException('Campo ordine non valido: $key');
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  throw FormatException('Campo ordine non valido: $key');
}

DateTime _requiredDateTime(Map<String, Object?> json, String key) {
  final value = DateTime.tryParse(json[key]?.toString() ?? '');
  if (value == null) {
    throw FormatException('Data ordine non valida: $key');
  }
  return value;
}

DateTime? _optionalDateTime(Object? value) {
  if (value == null) {
    return null;
  }
  return DateTime.tryParse(value.toString());
}

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}
