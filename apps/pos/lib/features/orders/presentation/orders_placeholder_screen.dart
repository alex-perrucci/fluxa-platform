import 'package:flutter/material.dart';

import '../../../core/widgets/async_states.dart';

class OrdersPlaceholderScreen extends StatelessWidget {
  const OrdersPlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) => const FluxaEmptyView(
    icon: Icons.receipt_long_outlined,
    title: 'Ordini',
    message:
        'La navigazione è pronta. Catalogo e creazione ordine arriveranno nei blocchi successivi.',
  );
}
