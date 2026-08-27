import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../printing/presentation/printing_controller.dart';
import '../domain/hospitality_models.dart';
import 'kitchen_controller.dart';

class KitchenScreen extends ConsumerStatefulWidget {
  const KitchenScreen({super.key});

  @override
  ConsumerState<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends ConsumerState<KitchenScreen> {
  String? _scheduledLocationId;
  KitchenController? _pollingController;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final controller = ref.watch(kitchenControllerProvider);
    final printingController = ref.watch(printingControllerProvider);
    final location = authController.state.deviceAssignment?.location;
    if (location == null) {
      _stopPolling();
      return const FluxaEmptyView(
        icon: Icons.soup_kitchen_outlined,
        title: 'Location non disponibile',
        message: 'Completa il contesto operativo prima di aprire la cucina.',
      );
    }
    _scheduleBind(controller, location.id);
    if (controller.locationId != location.id) {
      return const FluxaLoadingView(label: 'Allineamento cucina');
    }
    _startPolling(controller);
    return KitchenView(
      controller: controller,
      location: location,
      canCancel: _isManagerRole(authController.state.session?.role),
      printingController: printingController,
    );
  }

  void _scheduleBind(KitchenController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledLocationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
        if (mounted) {
          _startPolling(controller);
        }
      } finally {
        if (mounted && _scheduledLocationId == locationId) {
          setState(() => _scheduledLocationId = null);
        }
      }
    });
  }

  void _startPolling(KitchenController controller) {
    if (!identical(_pollingController, controller)) {
      _pollingController?.stopAutoPolling();
      _pollingController = controller;
    }
    controller.startAutoPolling();
  }

  void _stopPolling() {
    _pollingController?.stopAutoPolling();
    _pollingController = null;
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }
}

class KitchenView extends StatelessWidget {
  const KitchenView({
    required this.controller,
    required this.location,
    required this.canCancel,
    this.printingController,
    super.key,
  });

  final KitchenController controller;
  final OperationalLocation location;
  final bool canCancel;
  final PrintingController? printingController;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _KitchenHeader(controller: controller, location: location),
          if (controller.errorMessage != null) ...[
            const SizedBox(height: 12),
            _MessageCard(
              message: controller.errorMessage!,
              error: true,
              onDismiss: controller.clearMessages,
            ),
          ] else if (controller.noticeMessage != null) ...[
            const SizedBox(height: 12),
            _MessageCard(
              message: controller.noticeMessage!,
              error: false,
              onDismiss: controller.clearMessages,
            ),
          ],
          const SizedBox(height: 12),
          _KitchenFilters(controller: controller),
          const SizedBox(height: 12),
          Expanded(
            child: _KitchenBody(
              controller: controller,
              canCancel: canCancel,
              printingController: printingController,
            ),
          ),
        ],
      ),
    ),
  );
}

class _KitchenHeader extends StatelessWidget {
  const _KitchenHeader({required this.controller, required this.location});

  final KitchenController controller;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) {
    final active = controller.tickets
        .where(
          (ticket) =>
              ticket.status != KitchenTicketStatus.served &&
              ticket.status != KitchenTicketStatus.cancelled,
        )
        .length;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Cucina', style: Theme.of(context).textTheme.headlineMedium),
              Text(
                '${location.name} · $active comande attive · '
                '${controller.activeStations.length} postazioni',
              ),
            ],
          ),
        ),
        IconButton.filledTonal(
          key: const Key('kitchen-refresh-button'),
          tooltip: 'Aggiorna comande',
          onPressed: controller.busy ? null : controller.refresh,
          icon: controller.status == KitchenLoadStatus.loading
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.refresh),
        ),
      ],
    );
  }
}

class _KitchenFilters extends StatelessWidget {
  const _KitchenFilters({required this.controller});

  final KitchenController controller;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                key: const Key('kitchen-station-all'),
                selected: controller.stationFilterId == null,
                label: const Text('Tutte le postazioni'),
                onSelected: controller.busy
                    ? null
                    : (_) async => controller.setStationFilter(null),
              ),
            ),
            ...controller.activeStations.map(
              (station) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  key: Key('kitchen-station-${station.id}'),
                  selected: controller.stationFilterId == station.id,
                  label: Text(station.name),
                  onSelected: controller.busy
                      ? null
                      : (_) async => controller.setStationFilter(station.id),
                ),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 8),
      SizedBox(
        height: 44,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                key: const Key('kitchen-status-all'),
                selected: controller.statusFilter == null,
                label: const Text('Tutti gli stati'),
                onSelected: controller.busy
                    ? null
                    : (_) async => controller.setStatusFilter(null),
              ),
            ),
            ...KitchenTicketStatus.values.map(
              (status) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  key: Key('kitchen-status-${status.wireValue}'),
                  selected: controller.statusFilter == status,
                  label: Text(status.label),
                  onSelected: controller.busy
                      ? null
                      : (_) async => controller.setStatusFilter(status),
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class _KitchenBody extends StatelessWidget {
  const _KitchenBody({
    required this.controller,
    required this.canCancel,
    this.printingController,
  });

  final KitchenController controller;
  final bool canCancel;
  final PrintingController? printingController;

  @override
  Widget build(BuildContext context) {
    if (controller.status == KitchenLoadStatus.loading &&
        controller.tickets.isEmpty) {
      return const FluxaLoadingView(label: 'Caricamento comande');
    }
    if (controller.status == KitchenLoadStatus.failure &&
        controller.tickets.isEmpty) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Cucina non disponibile',
        message: controller.errorMessage ?? 'Riprova tra poco.',
      );
    }
    if (controller.activeStations.isEmpty) {
      return const FluxaEmptyView(
        icon: Icons.soup_kitchen_outlined,
        title: 'Postazioni cucina non configurate',
        message:
            'Un amministratore deve configurare le postazioni e il routing delle categorie.',
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final list = _TicketList(controller: controller);
        final detail = _TicketDetailPanel(
          controller: controller,
          canCancel: canCancel,
          printingController: printingController,
        );
        if (constraints.maxWidth >= 1050) {
          return Row(
            children: [
              Expanded(child: list),
              const SizedBox(width: 16),
              SizedBox(width: 430, child: detail),
            ],
          );
        }
        if (controller.selectedTicket == null) {
          return list;
        }
        return detail;
      },
    );
  }
}

class _TicketList extends StatelessWidget {
  const _TicketList({required this.controller});

  final KitchenController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.tickets.isEmpty) {
      return const FluxaEmptyView(
        icon: Icons.receipt_long_outlined,
        title: 'Nessuna comanda',
        message: 'Le nuove quantità inviate dagli ordini compariranno qui.',
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = switch (constraints.maxWidth) {
          >= 1250 => 4,
          >= 900 => 3,
          >= 580 => 2,
          _ => 1,
        };
        return GridView.builder(
          key: const Key('kitchen-ticket-grid'),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: columns == 1 ? 2.35 : 1.35,
          ),
          itemCount: controller.tickets.length,
          itemBuilder: (context, index) {
            final ticket = controller.tickets[index];
            return _TicketCard(
              ticket: ticket,
              stationName: controller.stationName(ticket.stationId),
              selected: controller.selectedTicket?.ticket.id == ticket.id,
              onTap: controller.busy
                  ? null
                  : () async => controller.selectTicket(ticket.id),
            );
          },
        );
      },
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({
    required this.ticket,
    required this.stationName,
    required this.selected,
    required this.onTap,
  });

  final KitchenTicketSummary ticket;
  final String stationName;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      key: Key('kitchen-ticket-${ticket.id}'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.receipt_long_outlined),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    ticket.number,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (selected) const Icon(Icons.check_circle),
              ],
            ),
            const SizedBox(height: 8),
            Text(stationName),
            Text(
              ticket.tableCodeSnapshot == null
                  ? 'Ordine senza tavolo'
                  : 'Tavolo ${ticket.tableCodeSnapshot}',
            ),
            const Spacer(),
            Row(
              children: [
                Expanded(child: Text(ticket.status.label)),
                Text('v${ticket.version}'),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _TicketDetailPanel extends StatelessWidget {
  const _TicketDetailPanel({
    required this.controller,
    required this.canCancel,
    this.printingController,
  });

  final KitchenController controller;
  final bool canCancel;
  final PrintingController? printingController;

  @override
  Widget build(BuildContext context) {
    final detail = controller.selectedTicket;
    if (detail == null) {
      return const FluxaEmptyView(
        icon: Icons.touch_app_outlined,
        title: 'Seleziona una comanda',
        message: 'Apri una comanda per vedere prodotti, note e avanzamento.',
      );
    }
    final ticket = detail.ticket;
    final nextStatus = _nextStatus(ticket.status);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ticket.number,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        '${detail.station?.name ?? 'Postazione'} · '
                        '${ticket.tableCodeSnapshot == null ? 'senza tavolo' : 'tavolo ${ticket.tableCodeSnapshot}'}',
                      ),
                    ],
                  ),
                ),
                Chip(label: Text(ticket.status.label)),
                IconButton(
                  tooltip: 'Chiudi dettaglio',
                  onPressed: controller.busy ? null : controller.closeTicket,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const Divider(height: 24),
            Expanded(
              child: detail.items.isEmpty
                  ? const FluxaEmptyView(
                      icon: Icons.restaurant_menu,
                      title: 'Comanda vuota',
                      message: 'Non risultano righe per questa comanda.',
                    )
                  : ListView.separated(
                      itemCount: detail.items.length,
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = detail.items[index];
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                            child: Text(item.displayQuantity),
                          ),
                          title: Text(item.displayName),
                          subtitle: item.note == null
                              ? null
                              : Text('Nota: ${item.note}'),
                        );
                      },
                    ),
            ),
            const Divider(height: 24),
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 8,
              runSpacing: 8,
              children: [
                if (printingController != null)
                  OutlinedButton.icon(
                    key: const Key('reprint-kitchen-ticket-button'),
                    onPressed: controller.busy || printingController!.busy
                        ? null
                        : () => printingController!.requestKitchenTicket(
                            ticket.id,
                          ),
                    icon: const Icon(Icons.print_outlined),
                    label: const Text('Ristampa'),
                  ),
                if (canCancel && ticket.status == KitchenTicketStatus.queued)
                  TextButton.icon(
                    key: const Key('cancel-kitchen-ticket-button'),
                    onPressed: controller.busy
                        ? null
                        : () async =>
                              _confirmCancelTicket(context, controller, ticket),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Annulla'),
                  ),
                if (nextStatus != null)
                  FilledButton.icon(
                    key: const Key('advance-kitchen-ticket-button'),
                    onPressed: controller.busy
                        ? null
                        : () async =>
                              controller.transitionTicket(ticket, nextStatus),
                    icon: Icon(_nextIcon(nextStatus)),
                    label: Text(_nextLabel(nextStatus)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

KitchenTicketStatus? _nextStatus(KitchenTicketStatus status) => switch (status) {
  KitchenTicketStatus.queued => KitchenTicketStatus.inProgress,
  KitchenTicketStatus.inProgress => KitchenTicketStatus.ready,
  KitchenTicketStatus.ready => KitchenTicketStatus.served,
  KitchenTicketStatus.served || KitchenTicketStatus.cancelled => null,
};

String _nextLabel(KitchenTicketStatus status) => switch (status) {
  KitchenTicketStatus.inProgress => 'Inizia preparazione',
  KitchenTicketStatus.ready => 'Segna pronta',
  KitchenTicketStatus.served => 'Segna servita',
  _ => status.label,
};

IconData _nextIcon(KitchenTicketStatus status) => switch (status) {
  KitchenTicketStatus.inProgress => Icons.play_arrow,
  KitchenTicketStatus.ready => Icons.check_circle_outline,
  KitchenTicketStatus.served => Icons.room_service_outlined,
  _ => Icons.arrow_forward,
};

Future<void> _confirmCancelTicket(
  BuildContext context,
  KitchenController controller,
  KitchenTicketSummary ticket,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Annullare la comanda?'),
      content: Text(
        'La comanda ${ticket.number} verrà annullata e le quantità potranno essere inviate di nuovo.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Indietro'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('Annulla comanda'),
        ),
      ],
    ),
  );
  if (confirmed == true) {
    await controller.transitionTicket(ticket, KitchenTicketStatus.cancelled);
  }
}

bool _isManagerRole(String? role) =>
    role == 'OWNER' || role == 'ADMIN' || role == 'MANAGER';

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.error,
    required this.onDismiss,
  });

  final String message;
  final bool error;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Material(
    color: error
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(12),
    child: ListTile(
      leading: Icon(error ? Icons.error_outline : Icons.check_circle_outline),
      title: Text(message),
      trailing: IconButton(onPressed: onDismiss, icon: const Icon(Icons.close)),
    ),
  );
}
