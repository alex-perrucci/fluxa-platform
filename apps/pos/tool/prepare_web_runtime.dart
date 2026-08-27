import 'dart:io';

const _assets = <WebRuntimeAsset>[
  WebRuntimeAsset(
    fileName: 'sqlite3.wasm',
    url:
        'https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-2.9.4/sqlite3.wasm',
    sha256: '922a76b182b6af69b030c8e2fdd3283ecc8e827248b20e4b1f3f3db170b52117',
  ),
  WebRuntimeAsset(
    fileName: 'drift_worker.js',
    url:
        'https://github.com/simolus3/drift/releases/download/drift-2.29.0/drift_worker.js',
    sha256: '0c2906a30531ca1f535fdfe1bb26cab04ca9c9dc5c12551def9d9f68767183be',
  ),
];

Future<void> main() async {
  final webDirectory = Directory('web');
  if (!await webDirectory.exists()) {
    stderr.writeln(
      'Run this command from apps/pos. The web/ directory was not found.',
    );
    exitCode = 64;
    return;
  }

  final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
  try {
    for (final asset in _assets) {
      await _ensureAsset(client, webDirectory, asset);
    }
    stdout.writeln('Drift web runtime is ready.');
  } finally {
    client.close(force: true);
  }
}

Future<void> _ensureAsset(
  HttpClient client,
  Directory webDirectory,
  WebRuntimeAsset asset,
) async {
  final targetPath =
      '${webDirectory.path}${Platform.pathSeparator}${asset.fileName}';
  final target = File(targetPath);

  if (await target.exists()) {
    final digest = await _sha256(target);
    if (digest == asset.sha256) {
      stdout.writeln('${asset.fileName}: already verified.');
      return;
    }
    stdout.writeln('${asset.fileName}: checksum mismatch, refreshing asset.');
  }

  final temp = File('${target.path}.download');
  if (await temp.exists()) {
    await temp.delete();
  }

  try {
    final request = await client.getUrl(Uri.parse(asset.url));
    request.headers.set(
      HttpHeaders.userAgentHeader,
      'Fluxa-POS-Web-Runtime/1.0',
    );
    final response = await request.close();
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException(
        'HTTP ${response.statusCode} while downloading ${asset.fileName}',
        uri: Uri.parse(asset.url),
      );
    }

    final sink = temp.openWrite();
    try {
      await response.pipe(sink);
    } finally {
      await sink.close();
    }

    if (asset.fileName.endsWith('.wasm')) {
      final bytes = await temp.openRead(0, 4).fold<List<int>>(
        <int>[],
        (buffer, chunk) => buffer..addAll(chunk),
      );
      const wasmMagic = <int>[0x00, 0x61, 0x73, 0x6d];
      if (bytes.length != 4 || !_sameBytes(bytes, wasmMagic)) {
        throw StateError('${asset.fileName} is not a valid WebAssembly module.');
      }
    }

    final digest = await _sha256(temp);
    if (digest != asset.sha256) {
      throw StateError(
        '${asset.fileName} checksum mismatch. Expected ${asset.sha256}, got $digest.',
      );
    }

    if (await target.exists()) {
      await target.delete();
    }
    await temp.rename(target.path);
    stdout.writeln('${asset.fileName}: downloaded and verified.');
  } catch (_) {
    if (await temp.exists()) {
      await temp.delete();
    }
    rethrow;
  }
}

Future<String> _sha256(File file) async {
  if (Platform.isWindows) {
    final result = await Process.run('certutil', [
      '-hashfile',
      file.path,
      'SHA256',
    ]);
    if (result.exitCode != 0) {
      throw ProcessException(
        'certutil',
        ['-hashfile', file.path, 'SHA256'],
        result.stderr.toString(),
        result.exitCode,
      );
    }
    final matches = RegExp(
      r'\b[0-9a-fA-F]{64}\b',
    ).allMatches(result.stdout.toString());
    if (matches.isEmpty) {
      throw StateError('Unable to parse SHA-256 from certutil output.');
    }
    return matches.first.group(0)!.toLowerCase();
  }

  final executable = Platform.isMacOS ? 'shasum' : 'sha256sum';
  final arguments = Platform.isMacOS
      ? ['-a', '256', file.path]
      : [file.path];
  final result = await Process.run(executable, arguments);
  if (result.exitCode != 0) {
    throw ProcessException(
      executable,
      arguments,
      result.stderr.toString(),
      result.exitCode,
    );
  }
  final digest = result.stdout.toString().trim().split(RegExp(r'\s+')).first;
  if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(digest)) {
    throw StateError('Unable to parse SHA-256 from $executable output.');
  }
  return digest.toLowerCase();
}

bool _sameBytes(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  for (var index = 0; index < left.length; index++) {
    if (left[index] != right[index]) return false;
  }
  return true;
}

class WebRuntimeAsset {
  const WebRuntimeAsset({
    required this.fileName,
    required this.url,
    required this.sha256,
  });

  final String fileName;
  final String url;
  final String sha256;
}
