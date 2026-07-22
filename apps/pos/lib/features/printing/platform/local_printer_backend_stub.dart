import 'local_printer_backend_contract.dart';

LocalPrinterBackend createPlatformLocalPrinterBackend() =>
    const _UnsupportedLocalPrinterBackend();

class _UnsupportedLocalPrinterBackend implements LocalPrinterBackend {
  const _UnsupportedLocalPrinterBackend();

  @override
  bool get isSupported => false;

  @override
  Future<List<String>> listQueues() async => const [];

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) async {
    throw UnsupportedError(
      'La stampa locale è disponibile soltanto nell’app Android.',
    );
  }
}
