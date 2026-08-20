import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_runtime.dart';
import 'package:fluxa_pos/features/fiscal/presentation/operator_fiscal_screen.dart';

void main() {
  testWidgets('ADE_WEB production enabled renders OPERATIVO', (tester) async {
    final runtime = _runtime(
      status: FiscalRuntimeStatus.ready,
      provider: FiscalProvider.adeWeb,
      environment: FiscalEnvironment.production,
      autoIssueOnPaid: true,
    );

    await _pumpSummary(tester, runtime);

    expect(find.text('OPERATIVO'), findsOneWidget);
    expect(
      find.text(
        'La fiscalizzazione è attiva. Gli scontrini vengono emessi automaticamente al pagamento.',
      ),
      findsOneWidget,
    );
    expect(find.text('Provider: Agenzia delle Entrate'), findsOneWidget);
    expect(find.text('Ambiente: Produzione'), findsOneWidget);
    expect(find.textContaining('non è configurata'), findsNothing);
  });

  testWidgets('verification error never renders NOT_CONFIGURED copy', (
    tester,
  ) async {
    final runtime = _runtime(
      status: FiscalRuntimeStatus.verificationError,
      provider: FiscalProvider.adeWeb,
      environment: FiscalEnvironment.production,
      errorMessage:
          'Impossibile verificare lo stato fiscale. Controlla la connessione o riprova.',
    );

    await _pumpSummary(tester, runtime);

    expect(find.text('VERIFICA NON DISPONIBILE'), findsOneWidget);
    expect(find.textContaining('Impossibile verificare'), findsOneWidget);
    expect(find.textContaining('non è configurata'), findsNothing);
  });

  testWidgets('AUTH_REQUIRED has its own operator message', (tester) async {
    final runtime = _runtime(
      status: FiscalRuntimeStatus.authRequired,
      lastDocumentStatus: FiscalDocumentStatus.authRequired,
    );

    await _pumpSummary(tester, runtime);

    expect(find.text('SERVE ATTENZIONE'), findsOneWidget);
    expect(
      find.textContaining('ripristinare l’accesso fiscale'),
      findsOneWidget,
    );
    expect(find.textContaining('non è configurata'), findsNothing);
  });

  testWidgets('UNKNOWN is attention and never auto-retry copy', (tester) async {
    final runtime = _runtime(
      status: FiscalRuntimeStatus.attention,
      lastDocumentStatus: FiscalDocumentStatus.unknown,
    );

    await _pumpSummary(tester, runtime);

    expect(find.text('SERVE ATTENZIONE'), findsOneWidget);
    expect(find.textContaining('Non ripetere automaticamente'), findsOneWidget);
    expect(find.text('OPERATIVO'), findsNothing);
  });

  testWidgets('widget rebuild preserves the same normalized runtime state', (
    tester,
  ) async {
    final runtime = _runtime(
      status: FiscalRuntimeStatus.ready,
      provider: FiscalProvider.adeWeb,
      environment: FiscalEnvironment.production,
      autoIssueOnPaid: true,
    );

    await _pumpSummary(tester, runtime);
    expect(find.text('OPERATIVO'), findsOneWidget);

    await _pumpSummary(tester, runtime);
    expect(find.text('OPERATIVO'), findsOneWidget);
    expect(find.text('Provider: Agenzia delle Entrate'), findsOneWidget);
  });
}

Future<void> _pumpSummary(
  WidgetTester tester,
  FiscalRuntimeConfiguration runtime,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: OperatorFiscalSummary(
          runtime: runtime,
          allGood: runtime.isReady,
          missingCount: 0,
          pendingCount: 0,
          problemCount: 0,
          errorMessage: runtime.status == FiscalRuntimeStatus.verificationError
              ? runtime.errorMessage
              : null,
        ),
      ),
    ),
  );
  await tester.pump();
}

FiscalRuntimeConfiguration _runtime({
  required FiscalRuntimeStatus status,
  FiscalProvider provider = FiscalProvider.adeWeb,
  FiscalEnvironment environment = FiscalEnvironment.production,
  bool autoIssueOnPaid = true,
  FiscalDocumentStatus? lastDocumentStatus,
  String? errorMessage,
}) => FiscalRuntimeConfiguration(
  locationId: 'location-bar-latino',
  status: status,
  provider: provider,
  environment: environment,
  enabled:
      status != FiscalRuntimeStatus.notConfigured &&
      status != FiscalRuntimeStatus.disabled,
  autoIssueOnPaid: autoIssueOnPaid,
  lastDocumentStatus: lastDocumentStatus,
  errorCode: null,
  errorMessage: errorMessage,
);
