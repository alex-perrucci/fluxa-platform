import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/manual_amount_keypad.dart';
import '../../orders/presentation/order_cancellation_action.dart';
import '../../orders/presentation/order_composer.dart';
import '../../orders/presentation/order_controller.dart';
import '../../payments/presentation/quick_payment_sheet.dart';
import '../domain/catalog_models.dart';
import 'cashier_responsive_layout.dart';
import 'catalog_controller.dart';

class OperatorCashierScreen extends ConsumerStatefulWidget {
  const OperatorCashierScreen({super.key});

  @override
  ConsumerState<OperatorCashierScreen> createState() =>
      _OperatorCashierScreenState();
}

class _OperatorCashierScreenState extends ConsumerState<OperatorCashierScreen> {
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final catalog = ref.watch(catalogControllerProvider);
    final orders = ref.watch(orderControllerProvider);
    final workflow = ref.watch(posWorkflowCoordinatorProvider);
    final location = auth.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.storefront_outlined,
        title: 'Cassa non disponibile',
        message: 'Questa postazione non è ancora associata a una sede.',
      );
    }

    _scheduleLoad(location.id, catalog, orders);
    if (catalog.locationId != location.id || orders.locationId != location.id) {
      return const FluxaLoadingView(label: 'Apertura cassa');
    }

    final snapshot = catalog.snapshot;
    if (catalog.isLoading && snapshot == null) {
      return const FluxaLoadingView(label: 'Caricamento prodotti');
    }
    if (snapshot == null) {
      return FluxaEmptyView(
        icon: Icons.inventory_2_outlined,
        title: 'Prodotti non disponibili',
        message: catalog.errorMessage ?? 'Aggiorna la cassa e riprova.',
      );
    }

    return _CashierWorkspace(
      location: location,
      snapshot: snapshot,
      catalog: catalog,
      orders: orders,
      workflowMessage: workflow.message,
      workflowAttention: workflow.needsAttention,
      onClearWorkflowMessage: workflow.clearMessage,
    );
  }

  void _scheduleLoad(
    String locationId,
    CatalogController catalog,
    OrderController orders,
  ) {
    if (_scheduledLocationId == locationId &&
        catalog.locationId == locationId &&
        orders.locationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future.wait([
        catalog.ensureLoaded(locationId),
        orders.locationId == locationId
            ? orders.refreshOperationalState()
            : orders.bindLocation(locationId),
      ]);
      if (mounted) {
        setState(() {});
      }
    });
  }
}

class _CashierWorkspace extends StatelessWidget {
  const _CashierWorkspace({
    required this.location,
    required this.snapshot,
    required this.catalog,
    required this.orders,
    required this.workflowMessage,
    required this.workflowAttention,
    required this.onClearWorkflowMessage,
  });

  final OperationalLocation location;
  final CatalogSnapshot snapshot;
  final CatalogController catalog;
  final OrderController orders;
  final String? workflowMessage;
  final bool workflowAttention;
  final VoidCallback onClearWorkflowMessage;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (workflowMessage != null) ...[
          _WorkflowBanner(
            message: workflowMessage!,
            attention: workflowAttention,
            onClose: onClearWorkflowMessage,
          ),
          const SizedBox(height: 10),
        ],
        Expanded(
          child: CashierResponsiveWorkspace(
            hasActiveContent: orders.activeOrder?.items.isNotEmpty == true,
            catalogPane: _CatalogPane(
              location: location,
              snapshot: snapshot,
              catalog: catalog,
              orders: orders,
            ),
            orderPane: _OrderPane(orders: orders, currency: snapshot.currency),
          ),
        ),
      ],
    ),
  );
}

class _CatalogPane extends StatelessWidget {
  const _CatalogPane({
    required this.location,
    required this.snapshot,
    required this.catalog,
    required this.orders,
  });

  final OperationalLocation location;
  final CatalogSnapshot snapshot;
  final CatalogController catalog;
  final OrderController orders;

  @override
  Widget build(BuildContext context) {
    final products = catalog.visibleProducts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Cassa',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  Text(
                    '${location.name} · tocca un prodotto per aggiungerlo',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            PopupMenuButton<String>(
              tooltip: 'Operazioni meno frequenti',
              onSelected: (value) async {
                if (value == 'options') {
                  await showNewOrderDialog(context, orders);
                } else if (value == 'hold') {
                  await orders.holdActiveOrder();
                } else if (value == 'advanced-payment') {
                  final order = orders.activeOrder;
                  if (order != null && context.mounted) {
                    context.push('/checkout-advanced/${order.header.id}');
                  }
                } else if (value == 'refresh') {
                  await Future.wait([
                    catalog.refresh(),
                    orders.refreshOperationalState(),
                  ]);
                }
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: 'options',
                  child: Text('Ordine con opzioni'),
                ),
                if (orders.activeOrder?.canHold == true)
                  const PopupMenuItem(
                    value: 'hold',
                    child: Text('Metti in attesa'),
                  ),
                if (orders.activeOrder != null)
                  const PopupMenuItem(
                    value: 'advanced-payment',
                    child: Text('Pagamento avanzato'),
                  ),
                const PopupMenuDivider(),
                const PopupMenuItem(value: 'refresh', child: Text('Aggiorna')),
              ],
              child: const Chip(
                avatar: Icon(Icons.more_horiz, size: 18),
                label: Text('Altro'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          key: const Key('operator-cashier-search'),
          onChanged: catalog.setSearchQuery,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Cerca prodotto o barcode',
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        if (catalog.categories.isNotEmpty) ...[
          const SizedBox(height: 8),
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: const Text('Tutti'),
                    selected: catalog.selectedCategoryId == null,
                    onSelected: (_) => catalog.selectCategory(null),
                  ),
                ),
                ...catalog.categories.map(
                  (category) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(category.name),
                      selected: catalog.selectedCategoryId == category.id,
                      onSelected: (_) => catalog.selectCategory(category.id),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 10),
        Expanded(
          child: products.isEmpty
              ? const FluxaEmptyView(
                  icon: Icons.search_off,
                  title: 'Nessun prodotto',
                  message: 'Cambia ricerca oppure usa Importo libero.',
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final columns = switch (constraints.maxWidth) {
                      >= 1180 => 5,
                      >= 860 => 4,
                      >= 580 => 3,
                      >= 380 => 2,
                      _ => 1,
                    };
                    return GridView.builder(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: columns == 1 ? 3 : 1.35,
                      ),
                      itemCount: products.length,
                      itemBuilder: (context, index) => _ProductButton(
                        product: products[index],
                        currency: snapshot.currency,
                        orders: orders,
                      ),
                    );
                  },
                ),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.tonalIcon(
            key: const Key('operator-manual-amount'),
            onPressed: orders.busy
                ? null
                : () => showManualAmountKeypad(
                    context,
                    controller: orders,
                    currency: snapshot.currency,
                  ),
            icon: const Icon(Icons.dialpad),
            label: const Text('Importo libero'),
          ),
        ),
      ],
    );
  }
}

class _ProductButton extends StatelessWidget {
  const _ProductButton({
    required this.product,
    required this.currency,
    required this.orders,
  });

  final CatalogProduct product;
  final String currency;
  final OrderController orders;

  bool get _quick =>
      product.price != null &&
      product.variants.isEmpty &&
      product.unit == CatalogProductUnit.each &&
      product.quantityScale == 0;

  OrderItem? get _existing {
    if (!_quick) return null;
    final order = orders.activeOrder;
    if (order == null) return null;
    for (final item in order.items) {
      if (item.productId == product.id &&
          item.variantId == null &&
          item.note == null &&
          item.quantityScale == 0) {
        return item;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final existing = _existing;
    final price = product.lowestPrice;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('operator-product-${product.id}'),
        onTap: orders.busy ? null : () => _add(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (existing != null)
                    Chip(label: Text('×${existing.displayQuantity}')),
                ],
              ),
              const Spacer(),
              Text(
                price == null
                    ? 'Prezzo non disponibile'
                    : '${product.price == null ? 'Da ' : ''}${formatCatalogMoney(price.amountCents, currency)}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _add(BuildContext context) async {
    final active = orders.activeOrder;
    if (active != null && active.header.status != OrderStatus.open) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Concludi la vendita corrente prima di aggiungere prodotti.',
          ),
        ),
      );
      return;
    }

    if (_quick) {
      final existing = _existing;
      if (existing != null) {
        await orders.updateItem(
          item: existing,
          quantityAmount: existing.quantityAmount + 1,
        );
        return;
      }
      if (!orders.hasCurrentOrder) {
        orders.startDraft(serviceMode: OrderServiceMode.counter);
      }
      await orders.addCatalogItem(product: product, quantityAmount: 1);
      return;
    }

    final temporaryDraft = !orders.hasCurrentOrder;
    if (temporaryDraft) {
      orders.startDraft(serviceMode: OrderServiceMode.counter);
    }
    await showAddProductDialog(context, orders, product, currency);
    if (temporaryDraft && orders.draft != null && orders.activeOrder == null) {
      orders.discardCurrentView();
    }
  }
}

class _OrderPane extends ConsumerWidget {
  const _OrderPane({required this.orders, required this.currency});

  final OrderController orders;
  final String currency;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final order = orders.activeOrder;
    final role = auth.session?.role;
    final hasKitchen =
        auth.session?.organizationEntitlements?.has('KITCHEN') == true;
    final location = auth.deviceAssignment?.location;
    final kitchen = ref.watch(kitchenControllerProvider);
    final canDispatch =
        hasKitchen &&
        location != null &&
        order != null &&
        order.items.isNotEmpty &&
        order.header.status == OrderStatus.open &&
        !orders.busy &&
        !kitchen.busy;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order == null ? 'Vendita corrente' : order.header.number,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                if (order != null && canQuickCancelOrder(order.header, role))
                  TextButton.icon(
                    key: const Key('cancel-current-order'),
                    onPressed: orders.busy || kitchen.busy
                        ? null
                        : () => confirmAndCancelOrder(
                            context,
                            ref,
                            order.header,
                            discardCurrentView: true,
                          ),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('ANNULLA'),
                    style: TextButton.styleFrom(
                      foregroundColor: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
            if (orders.errorMessage != null) ...[
              const SizedBox(height: 6),
              Text(
                orders.errorMessage!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ] else if (kitchen.errorMessage != null) ...[
              const SizedBox(height: 6),
              Text(
                kitchen.errorMessage!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ] else if (kitchen.noticeMessage != null) ...[
              const SizedBox(height: 6),
              Text(
                kitchen.noticeMessage!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 8),
            Expanded(
              child: order == null || order.items.isEmpty
                  ? const Center(child: Text('Tocca un prodotto per iniziare.'))
                  : ListView.separated(
                      itemCount: order.items.length,
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) => _OrderLine(
                        order: order,
                        item: order.items[index],
                        orders: orders,
                      ),
                    ),
            ),
            if (order != null && order.items.isNotEmpty) ...[
              const Divider(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'TOTALE',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  Text(
                    formatOrderMoney(
                      order.header.totalCents,
                      order.header.currency,
                    ),
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (hasKitchen && order.header.status == OrderStatus.open) ...[
                SizedBox(
                  height: 52,
                  child: FilledButton.tonalIcon(
                    key: const Key('operator-dispatch-kitchen'),
                    onPressed: canDispatch
                        ? () => kitchen.dispatchOrder(
                            locationId: location.id,
                            orderId: order.header.id,
                          )
                        : null,
                    icon: kitchen.busy
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.soup_kitchen_outlined),
                    label: Text(
                      kitchen.busy ? 'INVIO IN CORSO…' : 'INVIA IN CUCINA',
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              if (order.header.status == OrderStatus.open)
                _PaymentActions(
                  disabled: orders.busy || kitchen.busy,
                  onCash: () => _pay(context, order, 'cash'),
                  onCard: () => _pay(context, order, 'card'),
                )
              else if (order.header.status == OrderStatus.awaitingPayment)
                FilledButton.icon(
                  onPressed: () => showQuickPaymentSheet(context, order: order),
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('CONTINUA PAGAMENTO'),
                )
              else
                FilledButton.icon(
                  onPressed: orders.busy || kitchen.busy
                      ? null
                      : orders.discardCurrentView,
                  icon: const Icon(Icons.add_shopping_cart),
                  label: const Text('NUOVA VENDITA'),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _pay(
    BuildContext context,
    OrderDetail order,
    String method,
  ) async {
    final completed = await showQuickPaymentSheet(
      context,
      order: order,
      initialMethod: method,
    );
    if (completed) {
      orders.discardCurrentView();
    }
  }
}

class _PaymentActions extends StatelessWidget {
  const _PaymentActions({
    required this.disabled,
    required this.onCash,
    required this.onCard,
  });

  final bool disabled;
  final VoidCallback onCash;
  final VoidCallback onCard;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      Widget button({
        required Key key,
        required IconData icon,
        required String label,
        required VoidCallback onPressed,
      }) => SizedBox(
        height: 58,
        child: FilledButton.icon(
          key: key,
          onPressed: disabled ? null : onPressed,
          icon: Icon(icon),
          label: Text(label),
        ),
      );

      final cash = button(
        key: const Key('operator-cash'),
        icon: Icons.payments_outlined,
        label: 'CONTANTI',
        onPressed: onCash,
      );
      final card = button(
        key: const Key('operator-card'),
        icon: Icons.credit_card,
        label: 'CARTA',
        onPressed: onCard,
      );

      if (CashierLayoutPolicy.stackPrimaryActions(constraints.maxWidth)) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [cash, const SizedBox(height: 8), card],
        );
      }
      return Row(
        children: [
          Expanded(child: cash),
          const SizedBox(width: 10),
          Expanded(child: card),
        ],
      );
    },
  );
}

class _OrderLine extends StatelessWidget {
  const _OrderLine({
    required this.order,
    required this.item,
    required this.orders,
  });

  final OrderDetail order;
  final OrderItem item;
  final OrderController orders;

  bool get _stepQuantity =>
      order.header.status == OrderStatus.open &&
      item.quantityScale == 0 &&
      item.unitSnapshot == CatalogProductUnit.each.wireValue;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final details = InkWell(
        onTap: order.header.status == OrderStatus.open && !orders.busy
            ? () => showEditOrderItemDialog(context, orders, item)
            : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.displayName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                formatOrderMoney(item.finalGrossCents, order.header.currency),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      );
      final menu = order.header.status == OrderStatus.open
          ? PopupMenuButton<String>(
              tooltip: 'Modifica riga',
              onSelected: (value) async {
                if (value == 'edit') {
                  await showEditOrderItemDialog(context, orders, item);
                } else if (value == 'delete') {
                  await confirmDeleteOrderItem(context, orders, item);
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'edit', child: Text('Quantità o nota')),
                PopupMenuItem(value: 'delete', child: Text('Rimuovi')),
              ],
            )
          : const SizedBox.shrink();
      final quantity = _stepQuantity
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton.filledTonal(
                  tooltip: 'Uno in meno',
                  onPressed: orders.busy || item.quantityAmount <= 1
                      ? null
                      : () => orders.updateItem(
                          item: item,
                          quantityAmount: item.quantityAmount - 1,
                        ),
                  icon: const Icon(Icons.remove),
                ),
                SizedBox(
                  width: 42,
                  child: Text(
                    item.displayQuantity,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton.filled(
                  tooltip: 'Uno in più',
                  onPressed: orders.busy
                      ? null
                      : () => orders.updateItem(
                          item: item,
                          quantityAmount: item.quantityAmount + 1,
                        ),
                  icon: const Icon(Icons.add),
                ),
              ],
            )
          : const SizedBox.shrink();

      if (CashierLayoutPolicy.stackOrderLineControls(constraints.maxWidth)) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: details),
                  menu,
                ],
              ),
              if (_stepQuantity)
                Align(alignment: Alignment.centerRight, child: quantity),
            ],
          ),
        );
      }
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: details),
            if (_stepQuantity) quantity,
            menu,
          ],
        ),
      );
    },
  );
}

class _WorkflowBanner extends StatelessWidget {
  const _WorkflowBanner({
    required this.message,
    required this.attention,
    required this.onClose,
  });

  final String message;
  final bool attention;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Material(
    color: attention
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(12),
    child: ListTile(
      leading: Icon(
        attention ? Icons.warning_amber : Icons.check_circle_outline,
      ),
      title: Text(message),
      trailing: IconButton(onPressed: onClose, icon: const Icon(Icons.close)),
    ),
  );
}
