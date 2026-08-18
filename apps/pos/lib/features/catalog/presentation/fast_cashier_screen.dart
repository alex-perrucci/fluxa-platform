import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/manual_amount_keypad.dart';
import '../../orders/presentation/order_composer.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/catalog_models.dart';
import 'catalog_controller.dart';

class FastCashierScreen extends ConsumerStatefulWidget {
  const FastCashierScreen({super.key});

  @override
  ConsumerState<FastCashierScreen> createState() => _FastCashierScreenState();
}

class _FastCashierScreenState extends ConsumerState<FastCashierScreen> {
  String? _scheduledCatalogLocationId;
  String? _scheduledOrderLocationId;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final catalogController = ref.watch(catalogControllerProvider);
    final orderController = ref.watch(orderControllerProvider);
    final location = authController.state.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.storefront_outlined,
        title: 'Location non disponibile',
        message: 'Completa il contesto operativo prima di aprire la cassa.',
      );
    }

    _scheduleCatalogLoad(catalogController, location.id);
    _scheduleOrderBind(orderController, location.id);
    if (catalogController.locationId != location.id ||
        orderController.locationId != location.id) {
      return const FluxaLoadingView(label: 'Apertura cassa');
    }

    final snapshot = catalogController.snapshot;
    if (catalogController.isLoading && snapshot == null) {
      return const FluxaLoadingView(label: 'Caricamento catalogo');
    }
    if (catalogController.status == CatalogLoadStatus.failure &&
        snapshot == null) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Catalogo non disponibile',
        message: catalogController.errorMessage ?? 'Riprova tra poco.',
      );
    }
    if (snapshot == null) {
      return const FluxaEmptyView(
        icon: Icons.inventory_2_outlined,
        title: 'Catalogo vuoto',
        message: 'Nessun catalogo disponibile per questa postazione.',
      );
    }

    return _FastCashierView(
      catalogController: catalogController,
      orderController: orderController,
      location: location,
      snapshot: snapshot,
    );
  }

  void _scheduleCatalogLoad(CatalogController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledCatalogLocationId == locationId) {
      return;
    }
    _scheduledCatalogLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.ensureLoaded(locationId);
      } finally {
        if (mounted && _scheduledCatalogLocationId == locationId) {
          setState(() => _scheduledCatalogLocationId = null);
        }
      }
    });
  }

  void _scheduleOrderBind(OrderController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledOrderLocationId == locationId) {
      return;
    }
    _scheduledOrderLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledOrderLocationId == locationId) {
          setState(() => _scheduledOrderLocationId = null);
        }
      }
    });
  }
}

class _FastCashierView extends StatelessWidget {
  const _FastCashierView({
    required this.catalogController,
    required this.orderController,
    required this.location,
    required this.snapshot,
  });

  final CatalogController catalogController;
  final OrderController orderController;
  final OperationalLocation location;
  final CatalogSnapshot snapshot;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final catalog = _FastCatalog(
          catalogController: catalogController,
          orderController: orderController,
          location: location,
          snapshot: snapshot,
        );
        final order = _FastOrderPanel(
          controller: orderController,
          currency: snapshot.currency,
        );

        if (constraints.maxWidth >= 1050) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: catalog),
              const SizedBox(width: 16),
              SizedBox(width: 410, child: order),
            ],
          );
        }

        return Column(
          children: [
            SizedBox(height: 220, child: order),
            const SizedBox(height: 12),
            Expanded(child: catalog),
          ],
        );
      },
    ),
  );
}

class _FastCatalog extends StatelessWidget {
  const _FastCatalog({
    required this.catalogController,
    required this.orderController,
    required this.location,
    required this.snapshot,
  });

  final CatalogController catalogController;
  final OrderController orderController;
  final OperationalLocation location;
  final CatalogSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final products = catalogController.visibleProducts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
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
                  Text('${location.name} · vendita rapida'),
                ],
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Altre operazioni',
              onSelected: (value) async {
                switch (value) {
                  case 'order-options':
                    await showNewOrderDialog(context, orderController);
                    return;
                  case 'manual':
                    await showManualAmountKeypad(
                      context,
                      controller: orderController,
                      currency: snapshot.currency,
                    );
                    return;
                  case 'hold':
                    await orderController.holdActiveOrder();
                    return;
                  case 'refresh':
                    await Future.wait([
                      catalogController.refresh(),
                      orderController.refreshOperationalState(),
                    ]);
                    return;
                }
              },
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: 'order-options',
                  child: ListTile(
                    leading: Icon(Icons.tune),
                    title: Text('Ordine con opzioni'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const PopupMenuItem(
                  value: 'manual',
                  child: ListTile(
                    leading: Icon(Icons.dialpad),
                    title: Text('Importo libero'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                if (orderController.activeOrder?.canHold == true)
                  const PopupMenuItem(
                    value: 'hold',
                    child: ListTile(
                      leading: Icon(Icons.pause_circle_outline),
                      title: Text('Metti ordine in attesa'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                const PopupMenuDivider(),
                const PopupMenuItem(
                  value: 'refresh',
                  child: ListTile(
                    leading: Icon(Icons.refresh),
                    title: Text('Aggiorna'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
              child: const Chip(
                avatar: Icon(Icons.more_horiz, size: 18),
                label: Text('Altro'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('fast-cashier-search'),
          onChanged: catalogController.setSearchQuery,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Cerca prodotto o barcode',
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        if (catalogController.categories.isNotEmpty) ...[
          const SizedBox(height: 10),
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: const Text('Tutti'),
                    selected: catalogController.selectedCategoryId == null,
                    onSelected: (_) => catalogController.selectCategory(null),
                  ),
                ),
                ...catalogController.categories.map(
                  (category) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(category.name),
                      selected:
                          catalogController.selectedCategoryId == category.id,
                      onSelected: (_) =>
                          catalogController.selectCategory(category.id),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        Expanded(
          child: products.isEmpty
              ? const FluxaEmptyView(
                  icon: Icons.search_off,
                  title: 'Nessun prodotto',
                  message: 'Prova un’altra ricerca o usa Importo libero.',
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final columns = switch (constraints.maxWidth) {
                      >= 1200 => 5,
                      >= 900 => 4,
                      >= 620 => 3,
                      >= 400 => 2,
                      _ => 1,
                    };
                    return GridView.builder(
                      key: const Key('fast-cashier-product-grid'),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: columns == 1 ? 2.8 : 1.35,
                      ),
                      itemCount: products.length,
                      itemBuilder: (context, index) => _FastProductTile(
                        product: products[index],
                        currency: snapshot.currency,
                        controller: orderController,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _FastProductTile extends StatelessWidget {
  const _FastProductTile({
    required this.product,
    required this.currency,
    required this.controller,
  });

  final CatalogProduct product;
  final String currency;
  final OrderController controller;

  bool get _canQuickAdd =>
      product.price != null &&
      product.variants.isEmpty &&
      product.unit == CatalogProductUnit.each &&
      product.quantityScale == 0;

  @override
  Widget build(BuildContext context) {
    final price = product.lowestPrice;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('fast-product-${product.id}'),
        onTap: controller.busy ? null : () => _add(context),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    product.name,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ),
              if (product.variants.isNotEmpty)
                Text(
                  '${product.variants.length} varianti',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 4),
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
    final active = controller.activeOrder;
    if (active != null && active.header.status != OrderStatus.open) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Apri una nuova vendita prima di aggiungere prodotti.'),
        ),
      );
      return;
    }

    if (_canQuickAdd) {
      if (active != null) {
        OrderItem? existing;
        for (final item in active.items) {
          if (item.productId == product.id &&
              item.variantId == null &&
              item.note == null &&
              item.quantityScale == 0) {
            existing = item;
            break;
          }
        }
        if (existing != null) {
          await controller.updateItem(
            item: existing,
            quantityAmount: existing.quantityAmount + 1,
          );
          return;
        }
      }

      if (!controller.hasCurrentOrder) {
        controller.startDraft(serviceMode: OrderServiceMode.counter);
      }
      await controller.addCatalogItem(product: product, quantityAmount: 1);
      return;
    }

    final createdTemporaryDraft = !controller.hasCurrentOrder;
    if (createdTemporaryDraft) {
      controller.startDraft(serviceMode: OrderServiceMode.counter);
    }
    await showAddProductDialog(context, controller, product, currency);
    if (createdTemporaryDraft &&
        controller.draft != null &&
        controller.activeOrder == null) {
      controller.discardCurrentView();
    }
  }
}

class _FastOrderPanel extends StatelessWidget {
  const _FastOrderPanel({required this.controller, required this.currency});

  final OrderController controller;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final draft = controller.draft;
    final order = controller.activeOrder;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order?.header.number ?? 'Vendita corrente',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                if (order != null || draft != null)
                  IconButton(
                    tooltip: 'Chiudi vendita corrente',
                    onPressed: controller.busy
                        ? null
                        : controller.discardCurrentView,
                    icon: const Icon(Icons.close),
                  ),
              ],
            ),
            if (controller.errorMessage != null)
              _InlineMessage(
                text: controller.errorMessage!,
                error: true,
                onClose: controller.clearMessages,
              )
            else if (controller.noticeMessage != null)
              _InlineMessage(
                text: controller.noticeMessage!,
                error: false,
                onClose: controller.clearMessages,
              ),
            const SizedBox(height: 8),
            Expanded(
              child: order == null
                  ? Center(
                      child: Text(
                        draft == null
                            ? 'Tocca un prodotto per iniziare.'
                            : 'Ordine ${draft.serviceMode.label}: scegli il primo prodotto.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    )
                  : order.items.isEmpty
                  ? const Center(
                      child: Text('Tocca un prodotto per aggiungerlo.'),
                    )
                  : ListView.separated(
                      itemCount: order.items.length,
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final item = order.items[index];
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(item.displayName),
                          subtitle: Text(
                            '${item.displayQuantity} × ${formatOrderMoney(item.unitPriceCents, order.header.currency)}',
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                formatOrderMoney(
                                  item.finalGrossCents,
                                  order.header.currency,
                                ),
                              ),
                              if (order.header.status == OrderStatus.open)
                                PopupMenuButton<String>(
                                  tooltip: 'Gestisci riga',
                                  onSelected: (value) async {
                                    if (value == 'edit') {
                                      await showEditOrderItemDialog(
                                        context,
                                        controller,
                                        item,
                                      );
                                    } else if (value == 'delete') {
                                      await confirmDeleteOrderItem(
                                        context,
                                        controller,
                                        item,
                                      );
                                    }
                                  },
                                  itemBuilder: (context) => const [
                                    PopupMenuItem(
                                      value: 'edit',
                                      child: Text('Modifica quantità / nota'),
                                    ),
                                    PopupMenuItem(
                                      value: 'delete',
                                      child: Text('Rimuovi'),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            if (order != null) ...[
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
              const SizedBox(height: 12),
              if (order.header.status == OrderStatus.open &&
                  order.items.isNotEmpty) ...[
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        key: const Key('fast-cashier-cash'),
                        onPressed: controller.busy
                            ? null
                            : () => context.push(
                                '/checkout/${order.header.id}?quick=cash',
                              ),
                        icon: const Icon(Icons.payments_outlined),
                        label: const Text('CONTANTI'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        key: const Key('fast-cashier-card'),
                        onPressed: controller.busy
                            ? null
                            : () => context.push(
                                '/checkout/${order.header.id}?quick=card',
                              ),
                        icon: const Icon(Icons.credit_card),
                        label: const Text('CARTA'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Center(
                  child: TextButton(
                    onPressed: controller.busy
                        ? null
                        : () => context.push('/checkout/${order.header.id}'),
                    child: const Text('Altro pagamento / importo parziale'),
                  ),
                ),
              ] else if (order.header.status == OrderStatus.awaitingPayment)
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: controller.busy
                        ? null
                        : () => context.push('/checkout/${order.header.id}'),
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text('Continua pagamento'),
                  ),
                )
              else if (order.header.status == OrderStatus.paid ||
                  order.header.status == OrderStatus.cancelled)
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: controller.busy
                        ? null
                        : controller.discardCurrentView,
                    icon: const Icon(Icons.add_shopping_cart),
                    label: const Text('Nuova vendita'),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({
    required this.text,
    required this.error,
    required this.onClose,
  });

  final String text;
  final bool error;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Material(
    color: error
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(8),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(text, maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: onClose,
            icon: const Icon(Icons.close, size: 18),
          ),
        ],
      ),
    ),
  );
}
