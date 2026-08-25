import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/offline/offline_sale_controller.dart';
import '../../../core/offline/offline_sale_models.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/quantity_codec.dart';
import '../domain/catalog_models.dart';
import 'catalog_controller.dart';

class OfflineCashierScreen extends ConsumerStatefulWidget {
  const OfflineCashierScreen({super.key});

  @override
  ConsumerState<OfflineCashierScreen> createState() =>
      _OfflineCashierScreenState();
}

class _OfflineCashierScreenState extends ConsumerState<OfflineCashierScreen> {
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final catalog = ref.watch(catalogControllerProvider);
    final sale = ref.watch(offlineSaleControllerProvider);
    final sync = ref.watch(offlineSyncControllerProvider);
    final location = auth.deviceAssignment?.location;
    final snapshot = catalog.snapshot;

    if (location == null || snapshot == null) {
      return const FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Offline non disponibile',
        message: 'Serve almeno un catalogo salvato per questa sede.',
      );
    }

    _scheduleBind(location.id, snapshot.currency, sale);
    if (sale.locationId != location.id || !sale.loaded) {
      return const FluxaLoadingView(label: 'Apertura cassa offline');
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _OfflineBanner(
            pendingCount: sync.pendingCount,
            syncing: sync.syncing,
            onReconnect: () => _retryOnline(catalog),
          ),
          const SizedBox(height: 12),
          if (sale.errorMessage != null) ...[
            _MessageCard(
              message: sale.errorMessage!,
              error: true,
              onClose: sale.clearMessages,
            ),
            const SizedBox(height: 10),
          ] else if (sale.noticeMessage != null) ...[
            _MessageCard(
              message: sale.noticeMessage!,
              error: false,
              onClose: sale.clearMessages,
            ),
            const SizedBox(height: 10),
          ],
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final catalogPane = _OfflineCatalogPane(
                  snapshot: snapshot,
                  catalog: catalog,
                  sale: sale,
                );
                final cart = _OfflineCartPane(
                  sale: sale,
                  currency: snapshot.currency,
                  onCash: () => _completeCashSale(sale, snapshot.currency),
                );
                if (constraints.maxWidth >= 980) {
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: catalogPane),
                      const SizedBox(width: 14),
                      SizedBox(width: 410, child: cart),
                    ],
                  );
                }
                return Column(
                  children: [
                    SizedBox(height: 280, child: cart),
                    const SizedBox(height: 10),
                    Expanded(child: catalogPane),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _scheduleBind(
    String locationId,
    String currency,
    OfflineSaleController sale,
  ) {
    if (sale.locationId == locationId || _scheduledLocationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await sale.bindLocation(locationId: locationId, currency: currency);
      } finally {
        if (mounted && _scheduledLocationId == locationId) {
          setState(() => _scheduledLocationId = null);
        }
      }
    });
  }

  Future<void> _retryOnline(CatalogController catalog) async {
    await catalog.refresh();
    if (!mounted) return;
    if (!catalog.offlineMode) {
      await ref.read(offlineSyncControllerProvider).syncDue();
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Connessione non ancora disponibile.')),
    );
  }

  Future<void> _completeCashSale(
    OfflineSaleController sale,
    String currency,
  ) async {
    final due = sale.totalCents;
    if (due <= 0) return;
    final tendered = await _showCashDialog(
      context,
      dueCents: due,
      currency: currency,
    );
    if (tendered == null || !mounted) return;

    final result = await sale.completeCashSale(tendered);
    if (result == null || !mounted) return;
    await ref.read(offlineSyncControllerProvider).refresh();
    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.cloud_done_outlined),
        title: const Text('Vendita salvata offline'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Totale: ${formatCatalogMoney(result.totalCents, currency)}'),
            Text(
              'Ricevuto: ${formatCatalogMoney(result.tenderedCents, currency)}',
            ),
            Text(
              'Resto: ${formatCatalogMoney(result.changeCents, currency)}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            const Text(
              'L’incasso è già registrato sul dispositivo: non ripeterlo. '
              'Ordine, pagamento e fiscalizzazione verranno riallineati appena torna la connessione.',
            ),
          ],
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('NUOVA VENDITA'),
          ),
        ],
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({
    required this.pendingCount,
    required this.syncing,
    required this.onReconnect,
  });

  final int pendingCount;
  final bool syncing;
  final Future<void> Function() onReconnect;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.tertiaryContainer,
    borderRadius: BorderRadius.circular(14),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'MODALITÀ OFFLINE',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  'Catalogo locale attivo · vendite consentite solo in contanti',
                ),
              ],
            ),
          ),
          if (pendingCount > 0)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Chip(label: Text('$pendingCount da sincronizzare')),
            ),
          FilledButton.tonalIcon(
            onPressed: syncing ? null : onReconnect,
            icon: syncing
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            label: const Text('Riprova rete'),
          ),
        ],
      ),
    ),
  );
}

class _OfflineCatalogPane extends StatelessWidget {
  const _OfflineCatalogPane({
    required this.snapshot,
    required this.catalog,
    required this.sale,
  });

  final CatalogSnapshot snapshot;
  final CatalogController catalog;
  final OfflineSaleController sale;

  @override
  Widget build(BuildContext context) {
    final products = catalog.visibleProducts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Cassa', style: Theme.of(context).textTheme.headlineMedium),
        const Text(
          'Tocca un prodotto: il carrello viene salvato sul dispositivo.',
        ),
        const SizedBox(height: 10),
        TextField(
          key: const Key('offline-cashier-search'),
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
                  message: 'Cambia ricerca o categoria.',
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
                      itemBuilder: (context, index) => _OfflineProductButton(
                        snapshot: snapshot,
                        product: products[index],
                        sale: sale,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _OfflineProductButton extends StatelessWidget {
  const _OfflineProductButton({
    required this.snapshot,
    required this.product,
    required this.sale,
  });

  final CatalogSnapshot snapshot;
  final CatalogProduct product;
  final OfflineSaleController sale;

  bool get _quick =>
      product.price != null &&
      product.variants.isEmpty &&
      product.unit == CatalogProductUnit.each &&
      product.quantityScale == 0;

  @override
  Widget build(BuildContext context) {
    final price = product.lowestPrice;
    final quantity = sale.items
        .where((line) => line.productId == product.id)
        .fold<int>(0, (sum, line) => sum + line.quantityAmount);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('offline-product-${product.id}'),
        onTap: sale.busy || price == null ? null : () => _add(context),
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
                  if (quantity > 0 && product.quantityScale == 0)
                    Chip(label: Text('×$quantity')),
                ],
              ),
              const Spacer(),
              Text(
                price == null
                    ? 'Prezzo non disponibile'
                    : '${product.price == null ? 'Da ' : ''}${formatCatalogMoney(price.amountCents, snapshot.currency)}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _add(BuildContext context) async {
    if (_quick) {
      await sale.addProduct(
        snapshot: snapshot,
        product: product,
        quantityAmount: 1,
      );
      return;
    }

    final selection = await _showProductOptions(context, product);
    if (selection == null || !context.mounted) return;
    await sale.addProduct(
      snapshot: snapshot,
      product: product,
      variant: selection.variant,
      quantityAmount: selection.quantityAmount,
    );
  }
}

class _OfflineCartPane extends StatelessWidget {
  const _OfflineCartPane({
    required this.sale,
    required this.currency,
    required this.onCash,
  });

  final OfflineSaleController sale;
  final String currency;
  final Future<void> Function() onCash;

  @override
  Widget build(BuildContext context) => Card(
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
                  'Vendita offline',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (sale.items.isNotEmpty)
                TextButton(
                  onPressed: sale.busy ? null : sale.discardDraft,
                  child: const Text('SVUOTA'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: sale.items.isEmpty
                ? const Center(
                    child: Text(
                      'Tocca un prodotto per iniziare.\nIl carrello sopravvive anche a un riavvio.',
                      textAlign: TextAlign.center,
                    ),
                  )
                : ListView.separated(
                    itemCount: sale.items.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) => _OfflineCartLine(
                      line: sale.items[index],
                      sale: sale,
                      currency: currency,
                    ),
                  ),
          ),
          if (sale.items.isNotEmpty) ...[
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
                  formatCatalogMoney(sale.totalCents, currency),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 58,
              child: FilledButton.icon(
                key: const Key('offline-cash-payment'),
                onPressed: sale.busy ? null : onCash,
                icon: const Icon(Icons.payments_outlined),
                label: const Text('CONTANTI'),
              ),
            ),
            const SizedBox(height: 8),
            Tooltip(
              message:
                  'La carta richiede un esito verificabile dal terminale online.',
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: null,
                  icon: const Icon(Icons.credit_card),
                  label: const Text('CARTA · RICHIEDE RETE'),
                ),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class _OfflineCartLine extends StatelessWidget {
  const _OfflineCartLine({
    required this.line,
    required this.sale,
    required this.currency,
  });

  final OfflineSaleLine line;
  final OfflineSaleController sale;
  final String currency;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(line.displayName),
              Text(
                '${QuantityCodec.format(line.quantityAmount, line.quantityScale)} · '
                '${formatCatalogMoney(line.grossCents, currency)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        if (line.quantityScale == 0) ...[
          IconButton.filledTonal(
            tooltip: 'Uno in meno',
            onPressed: sale.busy || line.quantityAmount <= 1
                ? null
                : () => sale.updateQuantity(line, line.quantityAmount - 1),
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 38,
            child: Text('${line.quantityAmount}', textAlign: TextAlign.center),
          ),
          IconButton.filledTonal(
            tooltip: 'Uno in più',
            onPressed: sale.busy
                ? null
                : () => sale.updateQuantity(line, line.quantityAmount + 1),
            icon: const Icon(Icons.add),
          ),
        ],
        IconButton(
          tooltip: 'Rimuovi',
          onPressed: sale.busy ? null : () => sale.removeLine(line),
          icon: const Icon(Icons.delete_outline),
        ),
      ],
    ),
  );
}

class _ProductSelection {
  const _ProductSelection({
    required this.variant,
    required this.quantityAmount,
  });

  final CatalogVariant? variant;
  final int quantityAmount;
}

Future<_ProductSelection?> _showProductOptions(
  BuildContext context,
  CatalogProduct product,
) async {
  String selectedKey = product.price != null
      ? '__base__'
      : product.variants.firstOrNull?.id ?? '';
  var quantityRaw = '1';
  String? error;

  return showDialog<_ProductSelection>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) {
        CatalogVariant? selectedVariant;
        if (selectedKey != '__base__') {
          for (final variant in product.variants) {
            if (variant.id == selectedKey) {
              selectedVariant = variant;
              break;
            }
          }
        }
        final selectedPrice = selectedVariant?.price ?? product.price;
        return AlertDialog(
          title: Text(product.name),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (product.variants.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  initialValue: selectedKey.isEmpty ? null : selectedKey,
                  decoration: const InputDecoration(
                    labelText: 'Variante',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    if (product.price != null)
                      const DropdownMenuItem(
                        value: '__base__',
                        child: Text('Standard'),
                      ),
                    ...product.variants
                        .where((variant) => variant.price != null)
                        .map(
                          (variant) => DropdownMenuItem(
                            value: variant.id,
                            child: Text(variant.name),
                          ),
                        ),
                  ],
                  onChanged: (value) =>
                      setState(() => selectedKey = value ?? ''),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: TextEditingController(text: quantityRaw)
                  ..selection = TextSelection.collapsed(
                    offset: quantityRaw.length,
                  ),
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: 'Quantità',
                  suffixText: product.unit.label,
                  errorText: error,
                  border: const OutlineInputBorder(),
                ),
                onChanged: (value) => quantityRaw = value,
              ),
              if (selectedPrice == null) ...[
                const SizedBox(height: 8),
                const Text(
                  'Questa selezione non ha un prezzo offline disponibile.',
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: selectedPrice == null
                  ? null
                  : () {
                      try {
                        final quantity = QuantityCodec.parse(
                          quantityRaw,
                          product.quantityScale,
                        );
                        Navigator.pop(
                          dialogContext,
                          _ProductSelection(
                            variant: selectedVariant,
                            quantityAmount: quantity,
                          ),
                        );
                      } on FormatException catch (exception) {
                        setState(() => error = exception.message);
                      }
                    },
              child: const Text('Aggiungi'),
            ),
          ],
        );
      },
    ),
  );
}

Future<int?> _showCashDialog(
  BuildContext context, {
  required int dueCents,
  required String currency,
}) async {
  var raw = '';
  String? error;
  final roundedFive = ((dueCents + 499) ~/ 500) * 500;
  final suggestions = <int>{
    dueCents,
    if (roundedFive > dueCents) roundedFive,
    ...[1000, 2000, 5000, 10000, 20000].where((value) => value > dueCents),
  }.toList()..sort();

  return showDialog<int>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Incasso contanti offline'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              formatCatalogMoney(dueCents, currency),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: suggestions
                  .take(4)
                  .map(
                    (value) => FilledButton.tonal(
                      onPressed: () => Navigator.pop(dialogContext, value),
                      child: Text(formatCatalogMoney(value, currency)),
                    ),
                  )
                  .toList(growable: false),
            ),
            const SizedBox(height: 14),
            TextField(
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Altro importo ricevuto',
                prefixIcon: const Icon(Icons.euro),
                errorText: error,
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) => raw = value,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(raw.trim().replaceAll(',', '.'));
              final cents = value == null ? null : (value * 100).round();
              if (cents == null || cents < dueCents) {
                setState(() => error = 'Importo non valido o insufficiente.');
                return;
              }
              Navigator.pop(dialogContext, cents);
            },
            child: const Text('Conferma'),
          ),
        ],
      ),
    ),
  );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.error,
    required this.onClose,
  });

  final String message;
  final bool error;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Material(
    color: error
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(12),
    child: ListTile(
      leading: Icon(error ? Icons.warning_amber : Icons.info_outline),
      title: Text(message),
      trailing: IconButton(onPressed: onClose, icon: const Icon(Icons.close)),
    ),
  );
}
