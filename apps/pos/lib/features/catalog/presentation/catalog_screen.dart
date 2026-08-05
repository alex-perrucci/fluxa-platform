import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../orders/presentation/order_composer.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/catalog_models.dart';
import 'catalog_controller.dart';

class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
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
        message: 'Completa il contesto operativo prima di aprire il catalogo.',
      );
    }

    _scheduleCatalogLoad(catalogController, location.id);
    _scheduleOrderBind(orderController, location.id);
    if (catalogController.locationId != location.id ||
        orderController.locationId != location.id) {
      return const FluxaLoadingView(label: 'Allineamento contesto operativo');
    }
    return CatalogView(
      controller: catalogController,
      orderController: orderController,
      location: location,
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

class CatalogView extends StatelessWidget {
  const CatalogView({
    required this.controller,
    required this.orderController,
    required this.location,
    super.key,
  });

  final CatalogController controller;
  final OrderController orderController;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) => AnimatedBuilder(
      animation: orderController,
      builder: (context, child) {
        final snapshot = controller.snapshot;
        if (controller.isLoading && snapshot == null) {
          return const FluxaLoadingView(label: 'Caricamento catalogo');
        }
        if (controller.status == CatalogLoadStatus.failure &&
            snapshot == null) {
          return _CatalogFailureView(
            message:
                controller.errorMessage ??
                'Impossibile recuperare il catalogo.',
            onRetry: controller.refresh,
          );
        }
        if (snapshot == null) {
          return const FluxaEmptyView(
            icon: Icons.inventory_2_outlined,
            title: 'Catalogo non ancora caricato',
            message:
                'Il catalogo della location verrà caricato automaticamente.',
          );
        }
        return _CatalogReadyView(
          controller: controller,
          orderController: orderController,
          location: location,
          snapshot: snapshot,
        );
      },
    ),
  );
}

class _CatalogReadyView extends StatelessWidget {
  const _CatalogReadyView({
    required this.controller,
    required this.orderController,
    required this.location,
    required this.snapshot,
  });

  final CatalogController controller;
  final OrderController orderController;
  final OperationalLocation location;
  final CatalogSnapshot snapshot;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(20),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final browser = _CatalogBrowser(
          controller: controller,
          orderController: orderController,
          location: location,
          snapshot: snapshot,
        );
        if (constraints.maxWidth >= 1120) {
          return Row(
            children: [
              Expanded(child: browser),
              const SizedBox(width: 16),
              SizedBox(
                width: 390,
                child: ActiveOrderPanel(
                  controller: orderController,
                  currency: snapshot.currency,
                ),
              ),
            ],
          );
        }
        return Column(
          children: [
            CompactOrderBar(
              controller: orderController,
              currency: snapshot.currency,
            ),
            Expanded(child: browser),
          ],
        );
      },
    ),
  );
}

class _CatalogBrowser extends StatelessWidget {
  const _CatalogBrowser({
    required this.controller,
    required this.orderController,
    required this.location,
    required this.snapshot,
  });

  final CatalogController controller;
  final OrderController orderController;
  final OperationalLocation location;
  final CatalogSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final products = controller.visibleProducts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _CatalogHeader(
          location: location,
          snapshot: snapshot,
          loading: controller.isLoading,
          onRefresh: controller.refresh,
        ),
        const SizedBox(height: 16),
        TextField(
          key: const Key('catalog-search-field'),
          autofocus: true,
          onChanged: controller.setSearchQuery,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Cerca nome, codice, SKU, barcode o variante',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        _CategorySelector(
          categories: controller.categories,
          selectedCategoryId: controller.selectedCategoryId,
          onSelected: controller.selectCategory,
        ),
        const SizedBox(height: 16),
        Expanded(
          child: products.isEmpty
              ? FluxaEmptyView(
                  icon: Icons.search_off,
                  title: controller.searchQuery.trim().isEmpty
                      ? 'Catalogo vuoto'
                      : 'Nessun prodotto trovato',
                  message: controller.searchQuery.trim().isEmpty
                      ? 'Non risultano prodotti attivi per questa location.'
                      : 'Prova con un altro nome, codice, SKU o barcode.',
                )
              : _ProductGrid(
                  products: products,
                  currency: snapshot.currency,
                  orderController: orderController,
                ),
        ),
      ],
    );
  }
}

class _CatalogHeader extends StatelessWidget {
  const _CatalogHeader({
    required this.location,
    required this.snapshot,
    required this.loading,
    required this.onRefresh,
  });

  final OperationalLocation location;
  final CatalogSnapshot snapshot;
  final bool loading;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Cassa', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 4),
            Text(
              '${location.name} · ${snapshot.products.length} prodotti · '
              '${snapshot.currency}',
            ),
          ],
        ),
      ),
      IconButton.filledTonal(
        key: const Key('catalog-refresh-button'),
        tooltip: 'Aggiorna catalogo',
        onPressed: loading ? null : onRefresh,
        icon: loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.refresh),
      ),
    ],
  );
}

class _CategorySelector extends StatelessWidget {
  const _CategorySelector({
    required this.categories,
    required this.selectedCategoryId,
    required this.onSelected,
  });

  final List<CatalogCategory> categories;
  final String? selectedCategoryId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 44,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: FilterChip(
            key: const Key('catalog-category-all'),
            label: const Text('Tutti'),
            selected: selectedCategoryId == null,
            onSelected: (_) => onSelected(null),
          ),
        ),
        ...categories.map(
          (category) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              key: Key('catalog-category-${category.id}'),
              label: Text('${category.name} (${category.products.length})'),
              selected: selectedCategoryId == category.id,
              onSelected: (_) => onSelected(category.id),
            ),
          ),
        ),
      ],
    ),
  );
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid({
    required this.products,
    required this.currency,
    required this.orderController,
  });

  final List<CatalogProduct> products;
  final String currency;
  final OrderController orderController;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = switch (constraints.maxWidth) {
        >= 1400 => 5,
        >= 1100 => 4,
        >= 760 => 3,
        >= 520 => 2,
        _ => 1,
      };
      return GridView.builder(
        key: const Key('catalog-product-grid'),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: columns == 1 ? 2.45 : 0.82,
        ),
        itemCount: products.length,
        itemBuilder: (context, index) => _ProductCard(
          product: products[index],
          currency: currency,
          orderController: orderController,
        ),
      );
    },
  );
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.currency,
    required this.orderController,
  });

  final CatalogProduct product;
  final String currency;
  final OrderController orderController;

  @override
  Widget build(BuildContext context) {
    final lowestPrice = product.lowestPrice;
    final priceLabel = lowestPrice == null
        ? 'Prezzo non disponibile'
        : '${product.price == null ? 'Da ' : ''}'
              '${formatCatalogMoney(lowestPrice.amountCents, currency)}';
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('catalog-product-${product.id}'),
        onTap: () async =>
            showAddProductDialog(context, orderController, product, currency),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _ProductImage(imageUrl: product.imageUrl)),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    product.code,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    priceLabel,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (product.variants.isNotEmpty)
                    Text('${product.variants.length} varianti'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    if (url == null) {
      return const ColoredBox(
        color: Color(0x11000000),
        child: Center(child: Icon(Icons.inventory_2_outlined, size: 46)),
      );
    }
    return Image.network(
      url,
      width: double.infinity,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => const ColoredBox(
        color: Color(0x11000000),
        child: Center(child: Icon(Icons.broken_image_outlined, size: 46)),
      ),
    );
  }
}

class _CatalogFailureView extends StatelessWidget {
  const _CatalogFailureView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 460),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 54),
            const SizedBox(height: 16),
            Text(
              'Catalogo non disponibile',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              key: const Key('catalog-retry-button'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Riprova'),
            ),
          ],
        ),
      ),
    ),
  );
}
