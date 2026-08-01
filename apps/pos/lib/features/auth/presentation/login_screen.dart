import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/theme/fluxa_theme.dart';
import '../../../core/widgets/fluxa_brand.dart';

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 900;
            final form = Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(30),
                      child: LoginForm(
                        busy: auth.busy,
                        errorMessage: auth.errorMessage,
                        onSubmit: ref.read(authControllerProvider).login,
                      ),
                    ),
                  ),
                ),
              ),
            );

            if (!wide) {
              return form;
            }

            return Row(
              children: [
                Expanded(
                  flex: 5,
                  child: Container(
                    height: double.infinity,
                    padding: const EdgeInsets.all(48),
                    decoration: const BoxDecoration(color: FluxaPalette.ink),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const FluxaBrandLockup(reversed: true),
                        const Spacer(),
                        Text(
                          'Il tuo locale.\nTutto sotto controllo.',
                          style: Theme.of(context).textTheme.displaySmall
                              ?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -1.7,
                                height: 1.02,
                              ),
                        ),
                        const SizedBox(height: 20),
                        const SizedBox(
                          width: 520,
                          child: Text(
                            'Ordini, tavoli, cucina, pagamenti, stampa e fiscale nello stesso flusso operativo.',
                            style: TextStyle(
                              color: Colors.white60,
                              fontSize: 17,
                              height: 1.6,
                            ),
                          ),
                        ),
                        const SizedBox(height: 34),
                        const Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            _LoginFeature(
                              icon: Icons.point_of_sale,
                              label: 'Cassa',
                            ),
                            _LoginFeature(
                              icon: Icons.table_restaurant,
                              label: 'Tavoli',
                            ),
                            _LoginFeature(
                              icon: Icons.soup_kitchen,
                              label: 'Cucina',
                            ),
                            _LoginFeature(
                              icon: Icons.receipt_long,
                              label: 'Fiscale',
                            ),
                          ],
                        ),
                        const Spacer(),
                        const Text(
                          'FLUXA · MINIMAL CUT',
                          style: TextStyle(
                            color: FluxaPalette.gold,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 2.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(flex: 4, child: form),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _LoginFeature extends StatelessWidget {
  const _LoginFeature({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
    decoration: BoxDecoration(
      border: Border.all(color: const Color(0xFF34353A)),
      borderRadius: BorderRadius.circular(10),
      color: const Color(0xFF1A1B1F),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18, color: FluxaPalette.gold),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class LoginForm extends StatefulWidget {
  const LoginForm({
    required this.onSubmit,
    super.key,
    this.busy = false,
    this.errorMessage,
  });

  final Future<void> Function(String email, String password) onSubmit;
  final bool busy;
  final String? errorMessage;

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _formKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(
          alignment: Alignment.centerLeft,
          child: FluxaBrandLockup(compact: true),
        ),
        const SizedBox(height: 30),
        Text('Bentornato.', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 8),
        Text(
          'Accedi al punto cassa del tuo locale.',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: FluxaPalette.muted),
        ),
        const SizedBox(height: 28),
        TextFormField(
          key: const Key('emailField'),
          controller: _email,
          enabled: !widget.busy,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.username],
          decoration: const InputDecoration(
            labelText: 'Email',
            prefixIcon: Icon(Icons.mail_outline),
          ),
          validator: (value) {
            final text = value?.trim() ?? '';
            return text.contains('@')
                ? null
                : 'Inserisci un indirizzo email valido.';
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          key: const Key('passwordField'),
          controller: _password,
          enabled: !widget.busy,
          obscureText: _obscure,
          autofillHints: const [AutofillHints.password],
          decoration: InputDecoration(
            labelText: 'Password',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              onPressed: () => setState(() => _obscure = !_obscure),
              icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
            ),
          ),
          validator: (value) => (value?.length ?? 0) >= 8
              ? null
              : 'La password deve contenere almeno 8 caratteri.',
          onFieldSubmitted: (_) => _submit(),
        ),
        if (widget.errorMessage != null) ...[
          const SizedBox(height: 16),
          Text(
            widget.errorMessage!,
            key: const Key('loginError'),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          key: const Key('loginButton'),
          onPressed: widget.busy ? null : _submit,
          icon: widget.busy
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.login),
          label: const Text('Accedi'),
        ),
        const SizedBox(height: 15),
        const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.shield_outlined, size: 16, color: FluxaPalette.goldDark),
            SizedBox(width: 7),
            Text(
              'Sessione protetta e isolamento del locale',
              style: TextStyle(color: FluxaPalette.muted, fontSize: 12),
            ),
          ],
        ),
      ],
    ),
  );

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.onSubmit(_email.text.trim(), _password.text);
  }
}
