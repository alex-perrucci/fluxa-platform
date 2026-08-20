import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_runtime.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';

void main() {
  test('ADE_WEB production enabled is READY', () {
    final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
      locationId: 'location-1',
      health: _health(
        provider: FiscalProvider.adeWeb,
        environment: FiscalEnvironment.production,
        enabled: true,
        autoIssueOnPaid: true,
      ),
    );

    expect(runtime.status, FiscalRuntimeStatus.ready);
    expect(runtime.provider, FiscalProvider.adeWeb);
    expect(runtime.environment, FiscalEnvironment.production);
    expect(runtime.enabled, isTrue);
    expect(runtime.autoIssueOnPaid, isTrue);
  });

  test('missing profile is NOT_CONFIGURED', () {
    final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
      locationId: 'location-1',
      health: _health(provider: null, enabled: false),
    );

    expect(runtime.status, FiscalRuntimeStatus.notConfigured);
    expect(runtime.provider, isNull);
  });

  test('present but disabled profile is DISABLED', () {
    final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
      locationId: 'location-1',
      health: _health(enabled: false),
    );

    expect(runtime.status, FiscalRuntimeStatus.disabled);
    expect(runtime.provider, isNotNull);
  });

  test('AUTH_REQUIRED remains distinct from NOT_CONFIGURED', () {
    final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
      locationId: 'location-1',
      health: _health(lastDocumentStatus: FiscalDocumentStatus.authRequired),
    );

    expect(runtime.status, FiscalRuntimeStatus.authRequired);
    expect(runtime.status, isNot(FiscalRuntimeStatus.notConfigured));
  });

  test('UNKNOWN and rejected outcomes require attention', () {
    for (final status in [
      FiscalDocumentStatus.unknown,
      FiscalDocumentStatus.rejected,
      FiscalDocumentStatus.cancelled,
    ]) {
      final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
        locationId: 'location-1',
        health: _health(lastDocumentStatus: status),
      );
      expect(runtime.status, FiscalRuntimeStatus.attention);
    }
  });

  test('all supported providers are recognized without legacy regression', () {
    for (final provider in FiscalProvider.values) {
      final environment = provider == FiscalProvider.adeWeb
          ? FiscalEnvironment.production
          : FiscalEnvironment.sandbox;
      final runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
        locationId: 'location-1',
        health: _health(provider: provider, environment: environment),
      );

      expect(runtime.provider, provider);
      expect(runtime.environment, environment);
      expect(runtime.isOperationallyConfigured, isTrue);
    }
  });

  test('verification error preserves known provider but is not configured state', () {
    final previous = FiscalRuntimeConfiguration.fromOperationalHealth(
      locationId: 'location-1',
      health: _health(provider: FiscalProvider.adeWeb),
    );

    final runtime = FiscalRuntimeConfiguration.verificationError(
      locationId: 'location-1',
      message: 'Impossibile verificare.',
      previous: previous,
    );

    expect(runtime.status, FiscalRuntimeStatus.verificationError);
    expect(runtime.provider, FiscalProvider.adeWeb);
    expect(runtime.status, isNot(FiscalRuntimeStatus.notConfigured));
  });
}

OperationalHealth _health({
  FiscalProvider? provider = FiscalProvider.acubeSmartReceipts,
  FiscalEnvironment environment = FiscalEnvironment.sandbox,
  bool enabled = true,
  bool autoIssueOnPaid = false,
  FiscalDocumentStatus? lastDocumentStatus,
}) => OperationalHealth(
  generatedAt: DateTime.utc(2026, 8, 20),
  overallStatus: HealthStatus.ok,
  apiStatus: HealthStatus.ok,
  apiLatencyMs: 10,
  printerStatus: HealthStatus.ok,
  printerCount: 1,
  fiscalStatus: provider == null || !enabled
      ? HealthStatus.notConfigured
      : HealthStatus.ok,
  fiscalProvider: provider?.wireValue,
  fiscalEnvironment: provider == null ? null : environment.wireValue,
  fiscalEnabled: provider == null ? null : enabled,
  fiscalAutoIssueOnPaid: provider == null ? false : autoIssueOnPaid,
  fiscalLastDocumentStatus: lastDocumentStatus?.wireValue,
  fiscalErrorCode: null,
  fiscalErrorMessage: null,
  paymentStatus: HealthStatus.ok,
  paymentProvider: 'MANUAL_TERMINAL',
  lastPrintJob: null,
  suggestions: const [],
  raw: const {},
);
