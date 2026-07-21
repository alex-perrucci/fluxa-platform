import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/auth/domain/auth_models.dart';

void main() {
  test('maps backend membership fields exactly', () {
    final membership = OrganizationMembership.fromJson({
      'id': 'membership-id',
      'organizationId': 'organization-id',
      'organizationName': 'Fluxa Demo',
      'organizationSlug': 'fluxa-demo',
      'role': 'CASHIER',
    });
    expect(membership.membershipId, 'membership-id');
    expect(membership.organizationId, 'organization-id');
    expect(membership.role, 'CASHIER');
  });
}
