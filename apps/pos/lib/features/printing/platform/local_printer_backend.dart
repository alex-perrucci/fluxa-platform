import 'local_printer_backend_contract.dart';
import 'local_printer_backend_stub.dart'
    if (dart.library.io) 'local_printer_backend_io.dart'
    as platform;

export 'local_printer_backend_contract.dart';

LocalPrinterBackend createLocalPrinterBackend() =>
    platform.createPlatformLocalPrinterBackend();
