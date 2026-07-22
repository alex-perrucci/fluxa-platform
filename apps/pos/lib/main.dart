import 'package:flutter/foundation.dart';

import 'bootstrap.dart';
import 'core/config/app_config.dart';

Future<void> main() => bootstrap(
  fallbackEnvironment: kReleaseMode
      ? FluxaEnvironment.production
      : FluxaEnvironment.development,
);
