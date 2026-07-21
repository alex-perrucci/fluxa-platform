import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(authControllerProvider);
    final session = controller.state.session!;
    final organization = session.activeOrganization;
    final location = controller.state.deviceAssignment!.location!;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Ciao, ${session.user.displayName}',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            _InfoCard(
              title: 'Organizzazione',
              value: organization?.organizationName ?? 'Tenant attivo',
              detail: session.role ?? 'Ruolo non disponibile',
              icon: Icons.apartment,
            ),
            _InfoCard(
              title: 'Location operativa',
              value: location.name,
              detail: '${location.code} · ${location.timezone}',
              icon: Icons.storefront_outlined,
            ),
            _InfoCard(
              title: 'Dispositivo',
              value: session.device.name,
              detail: session.device.platform,
              icon: Icons.point_of_sale,
            ),
          ],
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: const Text('Postazione pronta'),
              subtitle: Text(
                'Il dispositivo è assegnato alla location ${location.name}. '
                'Catalogo e funzioni operative possono usare il locationId ${location.id}.',
              ),
            ),
          ),
        ),
        if (session.availableOrganizations.length > 1) ...[
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Cambia organizzazione',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: session.organizationId,
                    items: session.availableOrganizations
                        .map(
                          (item) => DropdownMenuItem(
                            value: item.organizationId,
                            child: Text(item.organizationName),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: controller.state.busy
                        ? null
                        : (value) {
                            if (value != null) {
                              controller.switchOrganization(value);
                            }
                          },
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.value,
    required this.detail,
    required this.icon,
  });

  final String title;
  final String value;
  final String detail;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 340,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(icon, size: 34),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 4),
                  Text(value, style: Theme.of(context).textTheme.titleMedium),
                  Text(detail),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
