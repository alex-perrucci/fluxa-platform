import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import 'payment_receipt_routing_card.dart';
import 'printing_screen_advanced_base.dart' as advanced;

export 'printing_screen_advanced_base.dart' show PrintingView;

class PrintingScreen extends ConsumerWidget {
  const PrintingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final controller = ref.watch(printingControllerProvider);
    final location = auth.deviceAssignment?.location;
    final session = auth.session;
    if (location == null || session == null) {
      return const FluxaEmptyView(
        icon: Icons.print_disabled_outlined,
        title: 'Contesto di stampa non disponibile',
        message: 'Completa il bootstrap operativo prima di aprire la stampa.',
      );
    }

    final canManage = _isManagerRole(session.role);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: PaymentReceiptRoutingCard(
            locationId: location.id,
            locationName: location.name,
            printers: controller.printers,
            canManage: canManage,
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: advanced.PrintingView(
            controller: controller,
            location: location,
            canManageJobs: canManage,
          ),
        ),
      ],
    );
  }
}

bool _isManagerRole(String? role) =>
    role == 'OWNER' || role == 'ADMIN' || role == 'MANAGER';
