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
              value: organization?.organizationName ?? 'Nessuna selezionata',
              detail: session.role ?? 'Contesto tenant non attivo',
              icon: Icons.apartment,
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Contesto operativo',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.location_off_outlined),
                  title: Text(
                    'Location non disponibile nel contratto corrente',
                  ),
                  subtitle: Text(
                    'GET /devices/me non restituisce l’assegnazione alla location. '
                    'Il Blocco 02 completerà il setup quando il backend esporrà il dato al dispositivo corrente.',
                  ),
                ),
              ],
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
