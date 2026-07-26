// dart format off
import '../data/local_printer_mapping_store.dart';
import '../data/printing_api.dart';
import '../domain/printing_models.dart';
import '../platform/esc_pos_text_formatter.dart';
import '../platform/profile_aware_local_printer_backend.dart';
import 'printing_controller.dart';

class GuidedPrintingController extends PrintingController {
  // The third argument is also retained by this subclass to synchronize
  // per-queue print profiles, so forwarding all three as super parameters
  // would remove the local value needed for _profileBackend.
  // ignore: use_super_parameters
  GuidedPrintingController(
    PrintingGateway gateway,
    LocalPrinterMappingStore mappingStore,
    ProfileAwareLocalPrinterBackend profileBackend,
  ) : _profileBackend = profileBackend,
       super(gateway, mappingStore, profileBackend);

  final ProfileAwareLocalPrinterBackend _profileBackend;

  @override
  Future<void> bindContext({
    required String locationId,
    required String deviceId,
  }) async {
    await super.bindContext(locationId: locationId, deviceId: deviceId);
    _syncProfiles();
  }

  @override
  Future<void> refresh() async {
    await super.refresh();
    _syncProfiles();
  }

  @override
  Future<void> setQueueMapping(PrinterDevice printer, String? queueName) async {
    await super.setQueueMapping(printer, queueName);
    _syncProfiles();
  }

  @override
  Future<void> setAgentEnabled(bool enabled) async {
    if (!enabled || canEnableAgent || !agentSupported) {
      await super.setAgentEnabled(enabled);
      return;
    }

    if (assignedPrinters.isEmpty) {
      await super.setAgentEnabled(true);
      return;
    }

    await refreshLocalQueues();
    if (canEnableAgent) {
      await super.setAgentEnabled(true);
      return;
    }

    if (assignedPrinters.length == 1 && localQueues.length == 1) {
      await setQueueMapping(assignedPrinters.single, localQueues.single);
      await super.setAgentEnabled(true);
      return;
    }

    await super.setAgentEnabled(true);
  }

  void _syncProfiles() {
    _profileBackend.clearProfiles();
    for (final printer in assignedPrinters) {
      final queueName = queueFor(printer.id);
      if (queueName == null || queueName.trim().isEmpty) continue;
      _profileBackend.registerProfile(
        queueName,
        EscPosPrintProfile(
          paperWidthMm: printer.paperWidthMm,
          charactersPerLine: printer.charactersPerLine,
          encoding: 'CP858',
        ),
      );
    }
  }
}
// dart format on
