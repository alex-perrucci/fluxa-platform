import 'esc_pos_text_formatter.dart';
import 'local_printer_backend_contract.dart';

class ProfileAwareLocalPrinterBackend implements LocalPrinterBackend {
  ProfileAwareLocalPrinterBackend(this._delegate);

  final LocalPrinterBackend _delegate;
  final Map<String, EscPosPrintProfile> _profiles = {};

  @override
  bool get isSupported => _delegate.isSupported;

  @override
  Future<List<String>> listQueues() => _delegate.listQueues();

  void clearProfiles() => _profiles.clear();

  void registerProfile(String queueName, EscPosPrintProfile profile) {
    final normalized = queueName.trim();
    if (normalized.isEmpty) return;
    _profiles[normalized] = profile;
  }

  void unregisterProfile(String queueName) {
    _profiles.remove(queueName.trim());
  }

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) {
    final profile =
        _profiles[queueName.trim()] ??
        const EscPosPrintProfile(
          paperWidthMm: 80,
          charactersPerLine: 48,
        );
    return _delegate.printText(
      queueName: queueName,
      text: EscPosTextFormatter.format(text, profile),
      copies: copies,
      supportsCut: supportsCut,
    );
  }
}
