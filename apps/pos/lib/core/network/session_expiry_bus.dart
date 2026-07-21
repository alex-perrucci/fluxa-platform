import 'dart:async';

class SessionExpiryBus {
  final _controller = StreamController<void>.broadcast();

  Stream<void> get stream => _controller.stream;
  void publish() => _controller.add(null);
  Future<void> dispose() => _controller.close();
}
