enum PrinterPurpose {
  receipt('RECEIPT', 'Ricevute'),
  kitchen('KITCHEN', 'Cucina'),
  labels('LABEL', 'Etichette'),
  generic('GENERIC', 'Generica');

  const PrinterPurpose(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PrinterPurpose fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final purpose in values) {
      if (purpose.wireValue == wireValue) {
        return purpose;
      }
    }
    throw FormatException('Scopo stampante non supportato: $wireValue');
  }
}

enum PrinterStatus {
  active('ACTIVE', 'Attiva'),
  disabled('DISABLED', 'Disabilitata');

  const PrinterStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PrinterStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato stampante non supportato: $wireValue');
  }
}

enum PrintDocumentType {
  kitchenTicket('KITCHEN_TICKET', 'Comanda cucina'),
  orderReceipt('ORDER_RECEIPT', 'Riepilogo ordine'),
  paymentReceipt('PAYMENT_RECEIPT', 'Riepilogo pagamento'),
  testPage('TEST_PAGE', 'Pagina di test');

  const PrintDocumentType(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PrintDocumentType fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final type in values) {
      if (type.wireValue == wireValue) {
        return type;
      }
    }
    throw FormatException('Tipo documento non supportato: $wireValue');
  }
}

enum PrintJobStatus {
  queued('QUEUED', 'In coda'),
  claimed('CLAIMED', 'In stampa'),
  completed('COMPLETED', 'Completato'),
  failed('FAILED', 'Fallito'),
  cancelled('CANCELLED', 'Annullato');

  const PrintJobStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  bool get canRetry => this == PrintJobStatus.failed;
  bool get canCancel =>
      this == PrintJobStatus.queued || this == PrintJobStatus.failed;

  static PrintJobStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato lavoro di stampa non supportato: $wireValue');
  }
}

enum PrintAttemptOutcome {
  claimed('CLAIMED', 'Reclamato'),
  completed('COMPLETED', 'Completato'),
  failed('FAILED', 'Fallito'),
  expired('EXPIRED', 'Lease scaduto');

  const PrintAttemptOutcome(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PrintAttemptOutcome fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final outcome in values) {
      if (outcome.wireValue == wireValue) {
        return outcome;
      }
    }
    throw FormatException('Esito tentativo non supportato: $wireValue');
  }
}

class PrinterListPage {
  const PrinterListPage({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.items,
  });

  factory PrinterListPage.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    return PrinterListPage(
      page: _requiredInt(json, 'page'),
      pageSize: _requiredInt(json, 'pageSize'),
      total: _requiredInt(json, 'total'),
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => PrinterDevice.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PrinterDevice>[],
    );
  }

  final int page;
  final int pageSize;
  final int total;
  final List<PrinterDevice> items;
}

class PrinterDevice {
  const PrinterDevice({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.code,
    required this.name,
    required this.purpose,
    required this.agentDeviceId,
    required this.driver,
    required this.paperWidthMm,
    required this.charactersPerLine,
    required this.supportsCut,
    required this.supportsDrawer,
    required this.status,
    required this.lastSeenAt,
    required this.agentVersion,
    required this.statusMessage,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PrinterDevice.fromJson(Map<String, Object?> json) => PrinterDevice(
    id: _requiredString(json, 'id'),
    organizationId: _requiredString(json, 'organizationId'),
    locationId: _requiredString(json, 'locationId'),
    code: _requiredString(json, 'code'),
    name: _requiredString(json, 'name'),
    purpose: PrinterPurpose.fromWire(json['purpose']),
    agentDeviceId: _optionalString(json['agentDeviceId']),
    driver: _requiredString(json, 'driver'),
    paperWidthMm: _requiredInt(json, 'paperWidthMm'),
    charactersPerLine: _requiredInt(json, 'charactersPerLine'),
    supportsCut: json['supportsCut'] == true,
    supportsDrawer: json['supportsDrawer'] == true,
    status: PrinterStatus.fromWire(json['status']),
    lastSeenAt: _optionalDateTime(json['lastSeenAt']),
    agentVersion: _optionalString(json['agentVersion']),
    statusMessage: _optionalString(json['statusMessage']),
    createdAt: _requiredDateTime(json, 'createdAt'),
    updatedAt: _requiredDateTime(json, 'updatedAt'),
  );

  final String id;
  final String organizationId;
  final String locationId;
  final String code;
  final String name;
  final PrinterPurpose purpose;
  final String? agentDeviceId;
  final String driver;
  final int paperWidthMm;
  final int charactersPerLine;
  final bool supportsCut;
  final bool supportsDrawer;
  final PrinterStatus status;
  final DateTime? lastSeenAt;
  final String? agentVersion;
  final String? statusMessage;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool isAssignedTo(String? deviceId) =>
      deviceId != null &&
      agentDeviceId == deviceId &&
      status == PrinterStatus.active;
}

class PrintJobPage {
  const PrintJobPage({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.items,
  });

  factory PrintJobPage.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    return PrintJobPage(
      page: _requiredInt(json, 'page'),
      pageSize: _requiredInt(json, 'pageSize'),
      total: _requiredInt(json, 'total'),
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => PrintJob.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PrintJob>[],
    );
  }

  final int page;
  final int pageSize;
  final int total;
  final List<PrintJob> items;
}

class PrintJob {
  const PrintJob({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.printerId,
    required this.documentType,
    required this.sourceEntityType,
    required this.sourceEntityId,
    required this.dedupeKey,
    required this.payload,
    required this.renderedText,
    required this.templateVersion,
    required this.copies,
    required this.status,
    required this.priority,
    required this.attempts,
    required this.maxAttempts,
    required this.nextAttemptAt,
    required this.claimedByDeviceId,
    required this.leaseToken,
    required this.leaseExpiresAt,
    required this.lastError,
    required this.version,
    required this.completedAt,
    required this.cancelledAt,
    required this.cancelReason,
    required this.createdAt,
    required this.updatedAt,
    required this.attemptHistory,
  });

  factory PrintJob.fromJson(Map<String, Object?> json) {
    final rawPayload = json['payload'];
    final rawAttempts = json['attempts'];
    return PrintJob(
      id: _requiredString(json, 'id'),
      organizationId: _requiredString(json, 'organizationId'),
      locationId: _requiredString(json, 'locationId'),
      printerId: _requiredString(json, 'printerId'),
      documentType: PrintDocumentType.fromWire(json['documentType']),
      sourceEntityType: _requiredString(json, 'sourceEntityType'),
      sourceEntityId: _optionalString(json['sourceEntityId']),
      dedupeKey: _requiredString(json, 'dedupeKey'),
      payload: rawPayload is Map
          ? Map<String, Object?>.unmodifiable(
              Map<String, Object?>.from(rawPayload),
            )
          : const <String, Object?>{},
      renderedText: _requiredString(json, 'renderedText'),
      templateVersion: _requiredInt(json, 'templateVersion'),
      copies: _requiredInt(json, 'copies'),
      status: PrintJobStatus.fromWire(json['status']),
      priority: _requiredInt(json, 'priority'),
      attempts: rawAttempts is List
          ? rawAttempts.length
          : _requiredInt(json, 'attempts'),
      maxAttempts: _requiredInt(json, 'maxAttempts'),
      nextAttemptAt: _requiredDateTime(json, 'nextAttemptAt'),
      claimedByDeviceId: _optionalString(json['claimedByDeviceId']),
      leaseToken: _optionalString(json['leaseToken']),
      leaseExpiresAt: _optionalDateTime(json['leaseExpiresAt']),
      lastError: _optionalString(json['lastError']),
      version: _requiredInt(json, 'version'),
      completedAt: _optionalDateTime(json['completedAt']),
      cancelledAt: _optionalDateTime(json['cancelledAt']),
      cancelReason: _optionalString(json['cancelReason']),
      createdAt: _requiredDateTime(json, 'createdAt'),
      updatedAt: _requiredDateTime(json, 'updatedAt'),
      attemptHistory: rawAttempts is List
          ? rawAttempts
                .map(
                  (value) => PrintAttempt.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PrintAttempt>[],
    );
  }

  final String id;
  final String organizationId;
  final String locationId;
  final String printerId;
  final PrintDocumentType documentType;
  final String sourceEntityType;
  final String? sourceEntityId;
  final String dedupeKey;
  final Map<String, Object?> payload;
  final String renderedText;
  final int templateVersion;
  final int copies;
  final PrintJobStatus status;
  final int priority;
  final int attempts;
  final int maxAttempts;
  final DateTime nextAttemptAt;
  final String? claimedByDeviceId;
  final String? leaseToken;
  final DateTime? leaseExpiresAt;
  final String? lastError;
  final int version;
  final DateTime? completedAt;
  final DateTime? cancelledAt;
  final String? cancelReason;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<PrintAttempt> attemptHistory;

  bool get canReprint => sourceEntityId != null;
}

class PrintAttempt {
  const PrintAttempt({
    required this.id,
    required this.attemptNo,
    required this.leaseToken,
    required this.outcome,
    required this.error,
    required this.startedAt,
    required this.finishedAt,
  });

  factory PrintAttempt.fromJson(Map<String, Object?> json) => PrintAttempt(
    id: _requiredString(json, 'id'),
    attemptNo: _requiredInt(json, 'attemptNo'),
    leaseToken: _requiredString(json, 'leaseToken'),
    outcome: PrintAttemptOutcome.fromWire(json['outcome']),
    error: _optionalString(json['error']),
    startedAt: _requiredDateTime(json, 'startedAt'),
    finishedAt: _optionalDateTime(json['finishedAt']),
  );

  final String id;
  final int attemptNo;
  final String leaseToken;
  final PrintAttemptOutcome outcome;
  final String? error;
  final DateTime startedAt;
  final DateTime? finishedAt;
}

class PrintRequestResult {
  const PrintRequestResult({required this.jobs});

  factory PrintRequestResult.fromJson(Map<String, Object?> json) {
    final rawJobs = json['jobs'];
    return PrintRequestResult(
      jobs: rawJobs is List
          ? rawJobs
                .map(
                  (value) => PrintRequestJob.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PrintRequestJob>[],
    );
  }

  final List<PrintRequestJob> jobs;
}

class PrintRequestJob {
  const PrintRequestJob({
    required this.id,
    required this.status,
    required this.printerId,
    required this.documentType,
  });

  factory PrintRequestJob.fromJson(Map<String, Object?> json) =>
      PrintRequestJob(
        id: _requiredString(json, 'id'),
        status: PrintJobStatus.fromWire(json['status']),
        printerId: _requiredString(json, 'printerId'),
        documentType: PrintDocumentType.fromWire(json['documentType']),
      );

  final String id;
  final PrintJobStatus status;
  final String printerId;
  final PrintDocumentType documentType;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key]?.toString();
  if (value == null || value.isEmpty) {
    throw FormatException('Campo obbligatorio mancante: $key');
  }
  return value;
}

String? _optionalString(Object? value) {
  final normalized = value?.toString();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  final parsed = int.tryParse(value?.toString() ?? '');
  if (parsed == null) {
    throw FormatException('Intero obbligatorio non valido: $key');
  }
  return parsed;
}

DateTime _requiredDateTime(Map<String, Object?> json, String key) {
  final value = json[key]?.toString();
  if (value == null) {
    throw FormatException('Data obbligatoria mancante: $key');
  }
  return DateTime.parse(value);
}

DateTime? _optionalDateTime(Object? value) =>
    value == null ? null : DateTime.parse(value.toString());
