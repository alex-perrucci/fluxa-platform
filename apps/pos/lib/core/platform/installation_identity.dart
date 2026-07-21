import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../storage/session_store.dart';
import '../../features/auth/domain/auth_models.dart';

class InstallationIdentityService {
  InstallationIdentityService(this._sessionStore);

  final SessionStore _sessionStore;

  Future<DeviceIdentity> load() async {
    var installationId = _sessionStore.installationId;
    if (installationId == null || installationId.length < 16) {
      installationId = _newUuid();
      await _sessionStore.saveInstallationId(installationId);
    }
    final package = await PackageInfo.fromPlatform();
    final info = await DeviceInfoPlugin().deviceInfo;
    final Map<String, dynamic> data = info.data;
    final platform = _platform();
    final model = _firstText(data, const [
      'model',
      'computerName',
      'machine',
      'name',
      'browserName',
      'productName',
    ]);
    final name = model == null ? 'Fluxa POS - $platform' : 'Fluxa POS - $model';
    return DeviceIdentity(
      installationId: installationId,
      name: name.length <= 160 ? name : name.substring(0, 160),
      platform: platform,
      model: model,
      appVersion: '${package.version}+${package.buildNumber}',
    );
  }

  String _platform() {
    if (kIsWeb) {
      return 'WEB';
    }
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'ANDROID',
      TargetPlatform.iOS => 'IOS',
      TargetPlatform.windows => 'WINDOWS',
      _ => 'OTHER',
    };
  }

  String? _firstText(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final Object? rawValue = data[key];
      final value = rawValue?.toString().trim();
      if (value != null && value.isNotEmpty && value != 'null') {
        return value.length <= 160 ? value : value.substring(0, 160);
      }
    }
    return null;
  }

  String _newUuid() {
    final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes
        .map((value) => value.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
