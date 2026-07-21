class TokenPair {
  const TokenPair({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.expiresIn,
  });

  factory TokenPair.fromJson(Map<String, Object?> json) => TokenPair(
    accessToken: json['accessToken']! as String,
    refreshToken: json['refreshToken']! as String,
    tokenType: json['tokenType']?.toString() ?? 'Bearer',
    expiresIn: (json['expiresIn'] as num).toInt(),
  );

  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final int expiresIn;
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.platformAdmin,
  });

  factory UserProfile.fromJson(Map<String, Object?> json) => UserProfile(
    id: json['id']! as String,
    email: json['email']! as String,
    displayName: json['displayName']! as String,
    platformAdmin: json['platformAdmin'] == true,
  );

  final String id;
  final String email;
  final String displayName;
  final bool platformAdmin;
}

class OrganizationMembership {
  const OrganizationMembership({
    required this.membershipId,
    required this.organizationId,
    required this.organizationName,
    required this.organizationSlug,
    required this.role,
  });

  factory OrganizationMembership.fromJson(Map<String, Object?> json) =>
      OrganizationMembership(
        membershipId: json['id']! as String,
        organizationId: json['organizationId']! as String,
        organizationName: json['organizationName']! as String,
        organizationSlug: json['organizationSlug']! as String,
        role: json['role']! as String,
      );

  final String membershipId;
  final String organizationId;
  final String organizationName;
  final String organizationSlug;
  final String role;
}

class DeviceIdentity {
  const DeviceIdentity({
    required this.installationId,
    required this.name,
    required this.platform,
    this.model,
    this.appVersion,
  });

  final String installationId;
  final String name;
  final String platform;
  final String? model;
  final String? appVersion;

  Map<String, Object?> toJson() => {
    'installationId': installationId,
    'name': name,
    'platform': platform,
    'model': ?model,
    'appVersion': ?appVersion,
  };
}

class DeviceRecord {
  const DeviceRecord({
    required this.id,
    required this.installationId,
    required this.name,
    required this.platform,
    this.userId,
    this.model,
    this.appVersion,
    this.status,
    this.lastSeenAt,
  });

  factory DeviceRecord.fromJson(Map<String, Object?> json) => DeviceRecord(
    id: json['id']! as String,
    userId: json['userId']?.toString(),
    installationId: json['installationId']! as String,
    name: json['name']! as String,
    platform: json['platform']! as String,
    model: json['model']?.toString(),
    appVersion: json['appVersion']?.toString(),
    status: json['status']?.toString(),
    lastSeenAt: DateTime.tryParse(json['lastSeenAt']?.toString() ?? ''),
  );

  final String id;
  final String? userId;
  final String installationId;
  final String name;
  final String platform;
  final String? model;
  final String? appVersion;
  final String? status;
  final DateTime? lastSeenAt;
}

class AuthSession {
  const AuthSession({
    required this.user,
    required this.device,
    required this.availableOrganizations,
    this.sessionId,
    this.organizationId,
    this.membershipId,
    this.role,
  });

  final UserProfile user;
  final DeviceRecord device;
  final List<OrganizationMembership> availableOrganizations;
  final String? sessionId;
  final String? organizationId;
  final String? membershipId;
  final String? role;

  OrganizationMembership? get activeOrganization {
    for (final organization in availableOrganizations) {
      if (organization.organizationId == organizationId) {
        return organization;
      }
    }
    return null;
  }

  AuthSession copyWith({DeviceRecord? device}) => AuthSession(
    user: user,
    device: device ?? this.device,
    availableOrganizations: availableOrganizations,
    sessionId: sessionId,
    organizationId: organizationId,
    membershipId: membershipId,
    role: role,
  );
}
