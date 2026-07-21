import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';

class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: LoginForm(
                    busy: auth.busy,
                    errorMessage: auth.errorMessage,
                    onSubmit: ref.read(authControllerProvider).login,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
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
        Text('Fluxa', style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 8),
        Text(
          'Accedi al punto cassa',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 28),
        TextFormField(
          key: const Key('emailField'),
          controller: _email,
          enabled: !widget.busy,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.username],
          decoration: const InputDecoration(labelText: 'Email'),
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
      ],
    ),
  );

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await widget.onSubmit(_email.text.trim(), _password.text);
  }
}
