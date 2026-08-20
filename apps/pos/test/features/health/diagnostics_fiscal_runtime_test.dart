import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_runtime.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';
import 'package:fluxa_pos/features/settings/presentation/operator_diagnostics_screen.dart';

void main() {
  test('ADE_WEB ready maps to diagnostics Pronto', () {
    final runtime = _runtime(FiscalRuntimeStatus.ready);

    expect(runtime.isReady, isTrue);
    expect(runtime.provider, FiscalProvider.adeWeb);
    expect(diagnosticFiscalStatus(runtime), HealthStatus.ok);
    expect(diagnosticFiscalLabel(runtime), 'Pronto');
  });

  test('diagnostics and fiscal share the READY invariant', () {
    final runtime = _runtime(FiscalRuntimeStatus.ready);

    expect(
      runtime.isReady && runtime.provider != null && runtime.enabled,
      isTrue,
    );
    expect(diagnosticFiscalStatus(runtime), HealthStatus.ok);
    expect(runtime.status, isNot(FiscalRuntimeStatus.notConfigured));
  });

  test('verification error is unknown, never NOT_CONFIGURED', () {
    final runtime = _runtime(
      FiscalRuntimeStatus.verificationError,
      errorMessage: 'Impossibile verificare.',
    );

    expect(diagnosticFiscalStatus(runtime), HealthStatus.unknown);
    expect(diagnosticFiscalLabel(runtime), 'Verifica non disponibile');
    expect(runtime.status, isNot(FiscalRuntimeStatus.notConfigured));
  });

  test('disabled and AUTH_REQUIRED remain distinct diagnostic outcomes', () {
    expect(
      diagnosticFiscalStatus(_runtime(FiscalRuntimeStatus.disabled)),
      HealthStatus.notConfigured,
    );
    expect(
      diagnosticFiscalLabel(_runtime(FiscalRuntimeStatus.disabled)),
      'Disabilitato',
    );
    expect(
      diagnosticFiscalStatus(_runtime(FiscalRuntimeStatus.authRequired)),
      HealthStatus.down,
    );
    expect(
      diagnosticFiscalLabel(_runtime(FiscalRuntimeStatus.authRequired)),
      'Accesso richiesto',
    );
  });
}

FiscalRuntimeConfiguration _runtime(
  FiscalRuntimeStatus status, {
  String? errorMessage,
}) => FiscalRuntimeConfiguration(
  locationId: 'location-bar-latino',
  status: status,
  provider: FiscalProvider.adeWeb,
  environment: FiscalEnvironment.production,
  enabled: status != FiscalRuntimeStatus.disabled &&
      status != FiscalRuntimeStatus.notConfigured,
  autoIssueOnPaid: true,
  lastDocumentStatus: status == FiscalRuntimeStatus.authRequired
      ? FiscalDocumentStatus.authRequired
      : null,
  errorCode: null,
  errorMessage: errorMessage,
);
