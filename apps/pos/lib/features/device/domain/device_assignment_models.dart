enum DeviceOperationalStatus {
  ready('READY'),
  locationRequired('LOCATION_REQUIRED'),
  assignmentRevoked('ASSIGNMENT_REVOKED'),
  locationInactive('LOCATION_INACTIVE');

  const DeviceOperationalStatus(this.wireValue);
  final String wireValue;

  static DeviceOperationalStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException(
      'Stato operativo dispositivo non supportato: $wireValue',
    );
  }
}

class CurrentDeviceAssignmentDevice {
  const CurrentDeviceAssignmentDevice({
    required this.id,
    required this.installationId,
    required this.name,
    required this.platform,
    required this.model,
    required this.appVersion,
    required this.status,
    required this.lastSeenAt,
  });

  factory CurrentDeviceAssignmentDevice.fromJson(Map<String, Object?> json) =>
      CurrentDeviceAssignmentDevice(
        id: json['id']! as String,
        installationId: json['installationId']! as String,
        name: json['name']! as String,
        platform: json['platform']! as String,
        model: json['model']?.toString(),
        appVersion: json['appVersion']?.toString(),
        status: json['status']! as String,
        lastSeenAt: DateTime.parse(json['lastSeenAt']! as String),
      );

  final String id;
  final String installationId;
  final String name;
  final String platform;
  final String? model;
  final String? appVersion;
  final String status;
  final DateTime lastSeenAt;
}

class DeviceAssignmentRecord {
  const DeviceAssignmentRecord({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.active,
    required this.assignedAt,
    required this.revokedAt,
    required this.updatedAt,
  });

  factory DeviceAssignmentRecord.fromJson(Map<String, Object?> json) =>
      DeviceAssignmentRecord(
        id: json['id']! as String,
        organizationId: json['organizationId']! as String,
        locationId: json['locationId']?.toString(),
        active: json['active'] == true,
        assignedAt: DateTime.parse(json['assignedAt']! as String),
        revokedAt: json['revokedAt'] == null
            ? null
            : DateTime.parse(json['revokedAt']! as String),
        updatedAt: DateTime.parse(json['updatedAt']! as String),
      );

  final String id;
  final String organizationId;
  final String? locationId;
  final bool active;
  final DateTime assignedAt;
  final DateTime? revokedAt;
  final DateTime updatedAt;
}

class OperationalLocation {
  const OperationalLocation({
    required this.id,
    required this.code,
    required this.name,
    required this.timezone,
    required this.status,
  });

  factory OperationalLocation.fromJson(Map<String, Object?> json) =>
      OperationalLocation(
        id: json['id']! as String,
        code: json['code']! as String,
        name: json['name']! as String,
        timezone: json['timezone']! as String,
        status: json['status']! as String,
      );

  final String id;
  final String code;
  final String name;
  final String timezone;
  final String status;
}

class CurrentDeviceAssignmentContext {
  const CurrentDeviceAssignmentContext({
    required this.operationalStatus,
    required this.device,
    required this.assignment,
    required this.location,
  });

  factory CurrentDeviceAssignmentContext.fromJson(Map<String, Object?> json) {
    final device = Map<String, Object?>.from(json['device']! as Map);
    final assignment = Map<String, Object?>.from(json['assignment']! as Map);
    final rawLocation = json['location'];
    return CurrentDeviceAssignmentContext(
      operationalStatus: DeviceOperationalStatus.fromWire(
        json['operationalStatus'],
      ),
      device: CurrentDeviceAssignmentDevice.fromJson(device),
      assignment: DeviceAssignmentRecord.fromJson(assignment),
      location: rawLocation is Map
          ? OperationalLocation.fromJson(Map<String, Object?>.from(rawLocation))
          : null,
    );
  }

  final DeviceOperationalStatus operationalStatus;
  final CurrentDeviceAssignmentDevice device;
  final DeviceAssignmentRecord assignment;
  final OperationalLocation? location;

  bool get isReady =>
      operationalStatus == DeviceOperationalStatus.ready &&
      device.status == 'ACTIVE' &&
      assignment.active &&
      assignment.locationId != null &&
      location?.status == 'ACTIVE' &&
      location?.id == assignment.locationId;
}
