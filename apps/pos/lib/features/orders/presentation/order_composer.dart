import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../catalog/domain/catalog_models.dart';
import '../domain/order_models.dart';
import '../domain/quantity_codec.dart';
import 'order_controller.dart';

class ActiveOrderPanel extends StatelessWidget {
  const ActiveOrderPanel({
    required this.controller,
    required this.currency,
    super.key,
  });

  final OrderController controller;
  final String currency;

  @override
  Widget build(BuildContext context) => Card(
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
                  'Ordine corrente',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (controller.hasCurrentOrder)
                IconButton(
                  tooltip: 'Chiudi vista ordine',
                  onPressed: controller.busy
                      ? null
                      : controller.discardCurrentView,
                  icon: const Icon(Icons.close),
                ),
            ],
          ),
          if (controller.errorMessage != null)
            _InlineMessage(
              message: controller.errorMessage!,
              error: true,
              onDismiss: controller.clearMessages,
            )
          else if (controller.noticeMessage != null)
            _InlineMessage(
              message: controller.noticeMessage!,
              error: false,
              onDismiss: controller.clearMessages,
            ),
          const SizedBox(height: 8),
          Expanded(child: _OrderPanelBody(controller: controller)),
          const SizedBox(height: 12),
          if (!controller.hasCurrentOrder)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('new-order-button'),
                onPressed: controller.busy
                    ? null
                    : () async => showNewOrderDialog(context, controller),
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Nuovo ordine'),
              ),
            )
          else if (controller.activeOrder?.header.status ==
              OrderStatus.open) ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('checkout-order-button'),
                onPressed:
                    controller.busy ||
                        controller.activeOrder?.items.isEmpty != false
                    ? null
                    : () => context.push(
                        '/checkout/${controller.activeOrder!.header.id}',
                      ),
                icon: const Icon(Icons.point_of_sale),
                label: const Text('Vai al pagamento'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                key: const Key('hold-order-button'),
                onPressed:
                    controller.busy || controller.activeOrder?.canHold != true
                    ? null
                    : controller.holdActiveOrder,
                icon: const Icon(Icons.pause_circle_outline),
                label: const Text('Metti in attesa'),
              ),
            ),
          ] else if (controller.activeOrder?.header.status ==
              OrderStatus.awaitingPayment)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('resume-checkout-button'),
                onPressed: controller.busy
                    ? null
                    : () => context.push(
                        '/checkout/${controller.activeOrder!.header.id}',
                      ),
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Continua pagamento'),
              ),
            ),
        ],
      ),
    ),
  );
}

class CompactOrderBar extends StatelessWidget {
  const CompactOrderBar({
    required this.controller,
    required this.currency,
    super.key,
  });

  final OrderController controller;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final order = controller.activeOrder;
    final draft = controller.draft;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            const Icon(Icons.shopping_cart_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    order?.header.number ??
                        (draft == null ? 'Nessun ordine' : 'Bozza locale'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    order == null
                        ? draft == null
                              ? 'Crea un ordine per iniziare la vendita.'
                              : '${draft.serviceMode.label} · aggiungi un prodotto'
                        : '${order.items.length} righe · '
                              '${formatOrderMoney(order.header.totalCents, order.header.currency)}',
                  ),
                ],
              ),
            ),
            if (!controller.hasCurrentOrder)
              FilledButton.icon(
                onPressed: controller.busy
                    ? null
                    : () async => showNewOrderDialog(context, controller),
                icon: const Icon(Icons.add),
                label: const Text('Nuovo'),
              )
            else if (order?.header.status == OrderStatus.open) ...[
              IconButton.filledTonal(
                tooltip: 'Metti in attesa',
                onPressed: controller.busy || order?.canHold != true
                    ? null
                    : controller.holdActiveOrder,
                icon: const Icon(Icons.pause),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                key: const Key('compact-checkout-button'),
                onPressed: controller.busy || order?.items.isEmpty != false
                    ? null
                    : () => context.push('/checkout/${order!.header.id}'),
                icon: const Icon(Icons.point_of_sale),
                label: const Text('Incassa'),
              ),
            ] else if (order?.header.status == OrderStatus.awaitingPayment)
              FilledButton.icon(
                onPressed: controller.busy
                    ? null
                    : () => context.push('/checkout/${order!.header.id}'),
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Pagamento'),
              ),
          ],
        ),
      ),
    );
  }
}

class _OrderPanelBody extends StatelessWidget {
  const _OrderPanelBody({required this.controller});

  final OrderController controller;

  @override
  Widget build(BuildContext context) {
    final draft = controller.draft;
    final order = controller.activeOrder;
    if (draft != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.edit_note, size: 52),
            const SizedBox(height: 12),
            Text('Bozza ${draft.serviceMode.label}'),
            if (draft.customerNote != null) Text(draft.customerNote!),
            const SizedBox(height: 8),
            const Text(
              'La bozza verrà creata sul backend quando aggiungerai il primo prodotto.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }
    if (order == null) {
      return const Center(
        child: Text(
          'Crea una nuova bozza oppure riprendi un ordine dalla sezione Ordini.',
          textAlign: TextAlign.center,
        ),
      );
    }
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
                    order.header.number,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    '${order.header.serviceMode.label} · v${order.header.version}',
                  ),
                ],
              ),
            ),
            Chip(label: Text(order.header.status.label)),
          ],
        ),
        const Divider(),
        Expanded(
          child: order.items.isEmpty
              ? const Center(
                  child: Text(
                    'Ordine vuoto. Seleziona un prodotto dal catalogo.',
                    textAlign: TextAlign.center,
                  ),
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
                        '${item.displayQuantity} × '
                        '${formatOrderMoney(item.unitPriceCents, order.header.currency)}',
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
                          if (order.header.status == OrderStatus.open) ...[
                            IconButton(
                              tooltip: 'Modifica riga',
                              onPressed: controller.busy
                                  ? null
                                  : () async => showEditOrderItemDialog(
                                      context,
                                      controller,
                                      item,
                                    ),
                              icon: const Icon(Icons.edit_outlined),
                            ),
                            IconButton(
                              tooltip: 'Elimina riga',
                              onPressed: controller.busy
                                  ? null
                                  : () async => confirmDeleteOrderItem(
                                      context,
                                      controller,
                                      item,
                                    ),
                              icon: const Icon(Icons.delete_outline),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),
        const Divider(),
        _TotalRow(
          label: 'Subtotale',
          value: formatOrderMoney(
            order.header.subtotalCents,
            order.header.currency,
          ),
        ),
        if (order.header.discountCents > 0)
          _TotalRow(
            label: 'Sconti',
            value:
                '-${formatOrderMoney(order.header.discountCents, order.header.currency)}',
          ),
        _TotalRow(
          label: 'Totale',
          value: formatOrderMoney(
            order.header.totalCents,
            order.header.currency,
          ),
          emphasized: true,
        ),
      ],
    );
  }
}

Future<void> showNewOrderDialog(
  BuildContext context,
  OrderController controller,
) async {
  var mode = OrderServiceMode.counter;
  final noteController = TextEditingController();
  try {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Nuovo ordine'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<OrderServiceMode>(
                  key: const Key('order-service-mode-field'),
                  value: mode,
                  decoration: const InputDecoration(
                    labelText: 'Modalità di servizio',
                    border: OutlineInputBorder(),
                  ),
                  items: OrderServiceMode.values
                      .map(
                        (value) => DropdownMenuItem(
                          value: value,
                          child: Text(value.label),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => mode = value);
                    }
                  },
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('order-customer-note-field'),
                  controller: noteController,
                  maxLength: 1000,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Nota cliente (facoltativa)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              key: const Key('confirm-new-order-button'),
              onPressed: () {
                controller.startDraft(
                  serviceMode: mode,
                  customerNote: noteController.text,
                );
                Navigator.pop(dialogContext);
              },
              child: const Text('Crea bozza'),
            ),
          ],
        ),
      ),
    );
  } finally {
    noteController.dispose();
  }
}

Future<void> showAddProductDialog(
  BuildContext context,
  OrderController controller,
  CatalogProduct product,
  String currency,
) async {
  final options = <_ProductOption>[
    if (product.price != null)
      _ProductOption(
        keyValue: 'BASE',
        variant: null,
        label: 'Base',
        price: product.price!,
      ),
    ...product.variants
        .where((variant) => variant.price != null || product.price != null)
        .map(
          (variant) => _ProductOption(
            keyValue: variant.id,
            variant: variant,
            label: variant.name,
            price: variant.price ?? product.price!,
          ),
        ),
  ];
  if (options.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Prezzo non disponibile per questo prodotto.'),
      ),
    );
    return;
  }
  var selectedKey = options.first.keyValue;
  final quantityController = TextEditingController(text: '1');
  final noteController = TextEditingController();
  String? validationMessage;
  try {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setState) {
          final selected = options.firstWhere(
            (option) => option.keyValue == selectedKey,
          );
          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                24,
                0,
                24,
                24 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  Text('${product.code} · ${product.unit.label}'),
                  if (product.description != null) ...[
                    const SizedBox(height: 12),
                    Text(product.description!),
                  ],
                  const SizedBox(height: 20),
                  if (options.length > 1)
                    DropdownButtonFormField<String>(
                      key: const Key('order-product-option-field'),
                      value: selectedKey,
                      decoration: const InputDecoration(
                        labelText: 'Formato o variante',
                        border: OutlineInputBorder(),
                      ),
                      items: options
                          .map(
                            (option) => DropdownMenuItem(
                              value: option.keyValue,
                              child: Text(
                                '${option.label} · '
                                '${formatOrderMoney(option.price.amountCents, currency)}',
                              ),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => selectedKey = value);
                        }
                      },
                    )
                  else
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(selected.label),
                      trailing: Text(
                        formatOrderMoney(selected.price.amountCents, currency),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const Key('order-item-quantity-field'),
                    controller: quantityController,
                    keyboardType: TextInputType.numberWithOptions(
                      decimal: product.quantityScale > 0,
                    ),
                    decoration: InputDecoration(
                      labelText: product.quantityScale == 0
                          ? 'Quantità'
                          : 'Quantità (${product.quantityScale} decimali max)',
                      border: const OutlineInputBorder(),
                      errorText: validationMessage,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    key: const Key('order-item-note-field'),
                    controller: noteController,
                    maxLength: 500,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Nota riga (facoltativa)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (!controller.canAddItems)
                    const Text(
                      'Crea prima un nuovo ordine oppure riprendine uno in attesa.',
                    ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      key: const Key('confirm-add-order-item-button'),
                      onPressed: !controller.canAddItems || controller.busy
                          ? null
                          : () async {
                              try {
                                final quantity = QuantityCodec.parse(
                                  quantityController.text,
                                  product.quantityScale,
                                );
                                setState(() => validationMessage = null);
                                final added = await controller.addCatalogItem(
                                  product: product,
                                  variant: selected.variant,
                                  quantityAmount: quantity,
                                  note: noteController.text,
                                );
                                if (added && sheetContext.mounted) {
                                  Navigator.pop(sheetContext);
                                } else if (sheetContext.mounted) {
                                  setState(
                                    () => validationMessage =
                                        controller.errorMessage,
                                  );
                                }
                              } on FormatException catch (error) {
                                setState(
                                  () => validationMessage = error.message,
                                );
                              }
                            },
                      icon: const Icon(Icons.add_shopping_cart),
                      label: Text(
                        'Aggiungi · '
                        '${formatOrderMoney(selected.price.amountCents, currency)}',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  } finally {
    quantityController.dispose();
    noteController.dispose();
  }
}

Future<void> showEditOrderItemDialog(
  BuildContext context,
  OrderController controller,
  OrderItem item,
) async {
  final quantityController = TextEditingController(
    text: QuantityCodec.format(item.quantityAmount, item.quantityScale),
  );
  final noteController = TextEditingController(text: item.note ?? '');
  String? validationMessage;
  try {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(item.displayName),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  key: const Key('edit-order-item-quantity-field'),
                  controller: quantityController,
                  keyboardType: TextInputType.numberWithOptions(
                    decimal: item.quantityScale > 0,
                  ),
                  decoration: InputDecoration(
                    labelText: 'Quantità',
                    border: const OutlineInputBorder(),
                    errorText: validationMessage,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('edit-order-item-note-field'),
                  controller: noteController,
                  maxLength: 500,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Nota riga',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: controller.busy
                  ? null
                  : () async {
                      try {
                        final quantity = QuantityCodec.parse(
                          quantityController.text,
                          item.quantityScale,
                        );
                        final updated = await controller.updateItem(
                          item: item,
                          quantityAmount: quantity,
                          note: noteController.text,
                        );
                        if (updated && dialogContext.mounted) {
                          Navigator.pop(dialogContext);
                        } else if (dialogContext.mounted) {
                          setState(
                            () => validationMessage = controller.errorMessage,
                          );
                        }
                      } on FormatException catch (error) {
                        setState(() => validationMessage = error.message);
                      }
                    },
              child: const Text('Salva'),
            ),
          ],
        ),
      ),
    );
  } finally {
    quantityController.dispose();
    noteController.dispose();
  }
}

Future<void> confirmDeleteOrderItem(
  BuildContext context,
  OrderController controller,
  OrderItem item,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Elimina riga'),
      content: Text('Rimuovere ${item.displayName} dall’ordine?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('No'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Elimina'),
        ),
      ],
    ),
  );
  if (confirmed == true) {
    await controller.deleteItem(item);
  }
}

class _ProductOption {
  const _ProductOption({
    required this.keyValue,
    required this.variant,
    required this.label,
    required this.price,
  });

  final String keyValue;
  final CatalogVariant? variant;
  final String label;
  final CatalogPrice price;
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final style = emphasized
        ? Theme.of(context).textTheme.titleLarge
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({
    required this.message,
    required this.error,
    required this.onDismiss,
  });

  final String message;
  final bool error;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        Icon(error ? Icons.error_outline : Icons.check_circle_outline),
        const SizedBox(width: 8),
        Expanded(child: Text(message)),
        IconButton(
          tooltip: 'Chiudi',
          onPressed: onDismiss,
          icon: const Icon(Icons.close, size: 18),
        ),
      ],
    ),
  );
}
