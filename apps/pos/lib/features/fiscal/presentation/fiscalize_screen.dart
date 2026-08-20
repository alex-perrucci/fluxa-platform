import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/fiscal_models.dart';
import 'fiscal_controller.dart';
import 'fiscal_screen.dart';

class FiscalizeScreen extends ConsumerStatefulWidget {
  const FiscalizeScreen({required this.orderId, super.key});
  final String orderId;

  @override
  ConsumerState<FiscalizeScreen> createState() => _FiscalizeScreenState();
}

class _FiscalizeScreenState extends ConsumerState<FiscalizeScreen> {
  String? _scheduledKey;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final fiscal = ref.watch(fiscalControllerProvider);
    final orders = ref.watch(orderControllerProvider);
    final location = auth.state.deviceAssignment?.location;
    final role = auth.state.session?.role;
    if (!{
      'OWNER',
      'ADMIN',
      'MANAGER',
      'CASHIER',
      'ACCOUNTANT',
      'SUPPORT_READONLY',
    }.contains(role)) {
      return const FluxaEmptyView(
        icon: Icons.lock_outline,
        title: 'Accesso fiscale non autorizzato',
        message: 'Il ruolo corrente non può consultare i documenti fiscali.',
      );
    }
    if (location == null) {
      return const Scaffold(
        body: FluxaEmptyView(
          icon: Icons.storefront_outlined,
          title: 'Location non disponibile',
          message: 'Completa il contesto operativo.',
        ),
      );
    }
    _schedule(fiscal, orders, location.id, widget.orderId);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fiscalizza ordine'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: AnimatedBuilder(
        animation: Listenable.merge([fiscal, orders]),
        builder: (context, child) => _FiscalizeView(
          orderId: widget.orderId,
          fiscal: fiscal,
          orders: orders,
          role: role,
        ),
      ),
    );
  }

  void _schedule(
    FiscalController fiscal,
    OrderController orders,
    String locationId,
    String orderId,
  ) {
    final key = '$locationId:$orderId';
    if (_scheduledKey == key) return;
    _scheduledKey = key;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await fiscal.bindLocation(locationId);
      if (orders.locationId != locationId) {
        await orders.bindLocation(locationId);
      }
      if (orders.activeOrder?.header.id != orderId) {
        await orders.selectOrder(orderId);
      }
      if (mounted) setState(() {});
    });
  }
}

class _FiscalizeView extends StatelessWidget {
  const _FiscalizeView({
    required this.orderId,
    required this.fiscal,
    required this.orders,
    required this.role,
  });
  final String orderId;
  final FiscalController fiscal;
  final OrderController orders;
  final String? role;

  @override
  Widget build(BuildContext context) {
    final order = orders.activeOrder;
    if (order == null || order.header.id != orderId) {
      return const FluxaLoadingView(label: 'Caricamento ordine pagato');
    }
    final document = fiscal.documentForOrder(orderId);
    final runtime = fiscal.runtime;
    final canIssue = {'OWNER', 'ADMIN', 'MANAGER', 'CASHIER'}.contains(role);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.header.number,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(
                  '${order.header.businessDate} · ${formatFiscalMoney(order.header.totalCents, order.header.currency)}',
                ),
                const SizedBox(height: 12),
                Chip(label: Text(order.header.status.label)),
                const Divider(height: 28),
                if (runtime == null)
                  const Text('Verifica dello stato fiscale in corso.')
                else if (runtime.provider == null ||
                    runtime.environment == null)
                  Text(runtime.operatorStatusLabel)
                else
                  Text(
                    '${runtime.provider!.label} · ${runtime.environment!.label} · ${runtime.operatorStatusLabel.toLowerCase()}',
                  ),
                const SizedBox(height: 16),
                if (order.header.status != OrderStatus.paid)
                  const Text('Solo un ordine pagato può essere fiscalizzato.')
                else if (document != null) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.receipt_long_outlined),
                    title: Text(document.documentNumber ?? 'Documento fiscale'),
                    subtitle: Text(document.status.label),
                    trailing: Chip(label: Text(document.environment.label)),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: () => context.go('/fiscal'),
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('Apri documenti fiscali'),
                  ),
                ] else
                  FilledButton.icon(
                    key: const Key('fiscalize-order-confirm-button'),
                    onPressed: !canIssue || fiscal.busy
                        ? null
                        : () async {
                            final lottery = await showLotteryCodeDialog(
                              context,
                              order.header.number,
                            );
                            if (lottery == null || !context.mounted) return;
                            final success = await fiscal.issueOrder(
                              orderId,
                              lotteryCode: lottery,
                            );
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    success
                                        ? fiscal.noticeMessage ??
                                              'Fiscalizzazione accodata.'
                                        : fiscal.errorMessage ??
                                              'Fiscalizzazione non riuscita.',
                                  ),
                                ),
                              );
                            }
                          },
                    icon: const Icon(Icons.receipt_long),
                    label: const Text('Fiscalizza'),
                  ),
                if (!canIssue &&
                    document == null &&
                    order.header.status == OrderStatus.paid)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'Il ruolo corrente non può emettere documenti fiscali.',
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
