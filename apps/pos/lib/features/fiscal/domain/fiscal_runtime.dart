import '../../health/domain/health_models.dart';
import 'fiscal_models.dart';

enum FiscalRuntimeStatus {
  ready,
  notConfigured,
  disabled,
  authRequired,
  attention,
  verificationError,
}

class FiscalRuntimeConfiguration {
  const FiscalRuntimeConfiguration({
    required this.locationId,
    required this.status,
    required this.provider,
    required this.environment,
    required this.enabled,
    required this.autoIssueOnPaid,
    required this.lastDocumentStatus,
    required this.errorCode,
    required this.errorMessage,
  });

  factory FiscalRuntimeConfiguration.fromOperationalHealth({
    required String locationId,
    required OperationalHealth health,
  }) {
    final providerWire = health.fiscalProvider?.trim();
    if (providerWire == null || providerWire.isEmpty) {
      return FiscalRuntimeConfiguration(
        locationId: locationId,
        status: FiscalRuntimeStatus.notConfigured,
        provider: null,
        environment: null,
        enabled: false,
        autoIssueOnPaid: false,
        lastDocumentStatus: null,
        errorCode: health.fiscalErrorCode,
        errorMessage: health.fiscalErrorMessage,
      );
    }

    final provider = FiscalProvider.fromWire(providerWire);
    final environment = FiscalEnvironment.fromWire(health.fiscalEnvironment);
    final enabled = health.fiscalEnabled ??
        health.fiscalStatus != HealthStatus.notConfigured;
    final lastDocumentStatus = _documentStatus(health.fiscalLastDocumentStatus);

    final status = !enabled
        ? FiscalRuntimeStatus.disabled
        : lastDocumentStatus == FiscalDocumentStatus.authRequired
        ? FiscalRuntimeStatus.authRequired
        : lastDocumentStatus == FiscalDocumentStatus.unknown
        ? FiscalRuntimeStatus.attention
        : FiscalRuntimeStatus.ready;

    return FiscalRuntimeConfiguration(
      locationId: locationId,
      status: status,
      provider: provider,
      environment: environment,
      enabled: enabled,
      autoIssueOnPaid: health.fiscalAutoIssueOnPaid,
      lastDocumentStatus: lastDocumentStatus,
      errorCode: health.fiscalErrorCode,
      errorMessage: health.fiscalErrorMessage,
    );
  }

  factory FiscalRuntimeConfiguration.verificationError({
    required String locationId,
    required String message,
    FiscalRuntimeConfiguration? previous,
  }) => FiscalRuntimeConfiguration(
    locationId: locationId,
    status: FiscalRuntimeStatus.verificationError,
    provider: previous?.locationId == locationId ? previous?.provider : null,
    environment: previous?.locationId == locationId
        ? previous?.environment
        : null,
    enabled: previous?.locationId == locationId && previous?.enabled == true,
    autoIssueOnPaid:
        previous?.locationId == locationId && previous?.autoIssueOnPaid == true,
    lastDocumentStatus: previous?.locationId == locationId
        ? previous?.lastDocumentStatus
        : null,
    errorCode: previous?.locationId == locationId ? previous?.errorCode : null,
    errorMessage: message,
  );

  final String locationId;
  final FiscalRuntimeStatus status;
  final FiscalProvider? provider;
  final FiscalEnvironment? environment;
  final bool enabled;
  final bool autoIssueOnPaid;
  final FiscalDocumentStatus? lastDocumentStatus;
  final String? errorCode;
  final String? errorMessage;

  bool get isConfigured => provider != null && environment != null;

  bool get isOperationallyConfigured => isConfigured && enabled;

  bool get isReady => status == FiscalRuntimeStatus.ready;

  String get operatorStatusLabel => switch (status) {
    FiscalRuntimeStatus.ready => 'Operativo',
    FiscalRuntimeStatus.notConfigured => 'Non configurato',
    FiscalRuntimeStatus.disabled => 'Disabilitato',
    FiscalRuntimeStatus.authRequired => 'Accesso richiesto',
    FiscalRuntimeStatus.attention => 'Da verificare',
    FiscalRuntimeStatus.verificationError => 'Verifica non disponibile',
  };

  static FiscalDocumentStatus? _documentStatus(String? value) {
    if (value == null || value.isEmpty) return null;
    try {
      return FiscalDocumentStatus.fromWire(value);
    } on FormatException {
      return null;
    }
  }
}
