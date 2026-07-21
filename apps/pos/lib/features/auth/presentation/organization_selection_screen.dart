import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';

class OrganizationSelectionScreen extends ConsumerWidget {
  const OrganizationSelectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(authControllerProvider);
    final state = controller.state;
    return Scaffold(
      appBar: AppBar(title: const Text('Scegli organizzazione')),
      body: state.pendingOrganizations.isEmpty
          ? FluxaEmptyView(
              title: 'Nessuna organizzazione disponibile',
              message:
                  state.errorMessage ??
                  'Il backend non ha restituito organizzazioni selezionabili.',
            )
          : ListView.separated(
              padding: const EdgeInsets.all(24),
              itemCount: state.pendingOrganizations.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final organization = state.pendingOrganizations[index];
                return Card(
                  child: ListTile(
                    title: Text(organization.organizationName),
                    subtitle: Text(
                      '${organization.organizationSlug} · ${organization.role}',
                    ),
                    trailing: state.busy
                        ? const CircularProgressIndicator()
                        : const Icon(Icons.chevron_right),
                    onTap: state.busy
                        ? null
                        : () => controller.selectOrganization(
                            organization.organizationId,
                          ),
                  ),
                );
              },
            ),
    );
  }
}
