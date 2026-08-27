import 'dart:io';

const _userAgent = 'Fluxa-POS-Web-Runtime/1.0';
const _sqliteUrl =
    'https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-2.9.4/sqlite3.wasm';
const _sqliteSha =
    '922a76b182b6af69b030c8e2fdd3283ecc8e827248b20e4b1f3f3db170b52117';
const _workerUrl =
    'https://github.com/simolus3/drift/releases/download/drift-2.29.0/drift_worker.js';
const _workerSha =
    '0c2906a30531ca1f535fdfe1bb26cab04ca9c9dc5c12551def9d9f68767183be';

const _assets = <WebRuntimeAsset>[
  WebRuntimeAsset(
    fileName: 'sqlite3.wasm',
    url: _sqliteUrl,
    sha256: _sqliteSha,
  ),
  WebRuntimeAsset(
    fileName: 'drift_worker.js',
    url: _workerUrl,
    sha256: _workerSha,
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

  final client = HttpClient();
  client.connectionTimeout = const Duration(seconds: 20);
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
  final separator = Platform.pathSeparator;
  final targetPath = '${webDirectory.path}$separator${asset.fileName}';
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
    final uri = Uri.parse(asset.url);
    final request = await client.getUrl(uri);
    request.headers.set(HttpHeaders.userAgentHeader, _userAgent);
    final response = await request.close();
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException(
        'HTTP ${response.statusCode} while downloading ${asset.fileName}',
        uri: uri,
      );
    }

    final sink = temp.openWrite();
    await response.pipe(sink);

    if (asset.fileName.endsWith('.wasm')) {
      await _verifyWasmHeader(temp, asset.fileName);
    }

    final digest = await _sha256(temp);
    if (digest != asset.sha256) {
      throw StateError(
        '${asset.fileName} checksum mismatch. '
        'Expected ${asset.sha256}, got $digest.',
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

Future<void> _verifyWasmHeader(File file, String fileName) async {
  final handle = await file.open();
  try {
    final bytes = await handle.read(4);
    const wasmMagic = <int>[0x00, 0x61, 0x73, 0x6d];
    if (!_sameBytes(bytes, wasmMagic)) {
      throw StateError('$fileName is not a valid WebAssembly module.');
    }
  } finally {
    await handle.close();
  }
}

Future<String> _sha256(File file) async {
  if (Platform.isWindows) {
    final arguments = ['-hashfile', file.path, 'SHA256'];
    final result = await Process.run('certutil', arguments);
    _checkProcess(result, 'certutil', arguments);

    final output = result.stdout.toString();
    final matches = RegExp(r'\b[0-9a-fA-F]{64}\b').allMatches(output);
    if (matches.isEmpty) {
      throw StateError('Unable to parse SHA-256 from certutil output.');
    }
    return matches.first.group(0)!.toLowerCase();
  }

  final executable = Platform.isMacOS ? 'shasum' : 'sha256sum';
  final arguments = <String>[];
  if (Platform.isMacOS) {
    arguments.addAll(['-a', '256']);
  }
  arguments.add(file.path);

  final result = await Process.run(executable, arguments);
  _checkProcess(result, executable, arguments);

  final output = result.stdout.toString().trim();
  final digest = output.split(RegExp(r'\s+')).first;
  if (!RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(digest)) {
    throw StateError('Unable to parse SHA-256 from $executable output.');
  }
  return digest.toLowerCase();
}

void _checkProcess(
  ProcessResult result,
  String executable,
  List<String> arguments,
) {
  if (result.exitCode == 0) {
    return;
  }
  throw ProcessException(
    executable,
    arguments,
    result.stderr.toString(),
    result.exitCode,
  );
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
