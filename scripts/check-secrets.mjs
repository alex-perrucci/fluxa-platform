import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const forbiddenNames = [
  /(^|\/)\.env$/i,
  /(^|\/)key\.properties$/i,
  /\.(jks|keystore|p12|pfx|pem|key)$/i,
  /service[-_]?account.*\.json$/i,
];
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;

export function findSecretProblems(files, readFile) {
  const problems = [];
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    const isExample = /(?:\.example|example\.)/i.test(
      path.basename(normalized),
    );
    if (normalized === 'scripts/check-secrets.mjs') continue;
    if (
      !isExample &&
      forbiddenNames.some((pattern) => pattern.test(normalized))
    ) {
      problems.push(
        `${normalized}: forbidden secret-bearing filename is tracked`,
      );
      continue;
    }
    const data = readFile(file);
    if (!data || data.includes('\0')) continue;
    if (privateKeyPattern.test(data)) {
      problems.push(`${normalized}: private key material is tracked`);
    }
  }
  return problems;
}

function selfTest() {
  assert.deepEqual(
    findSecretProblems(['.env', 'safe.txt'], (file) =>
      file === 'safe.txt' ? 'hello' : 'TOKEN=value',
    ),
    ['.env: forbidden secret-bearing filename is tracked'],
  );
  assert.equal(
    findSecretProblems(
      ['key.properties.example'],
      () => 'storePassword=<VALUE>',
    ).length,
    0,
  );
  assert.equal(
    findSecretProblems(['notes.txt'], () => '-----BEGIN PRIVATE KEY-----')
      .length,
    1,
  );
  console.log('Secret scanner self-test passed.');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const root = process.cwd();
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  );
  const files = output.split('\0').filter(Boolean);
  const problems = findSecretProblems(files, (file) => {
    const absolute = path.join(root, file);
    const stat = fs.statSync(absolute);
    if (stat.size > 2 * 1024 * 1024) return '';
    return fs.readFileSync(absolute, 'utf8');
  });
  if (problems.length > 0) {
    console.error(
      'Potential secrets detected:\n' +
        problems.map((p) => `- ${p}`).join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log(`Secret scan passed for ${files.length} tracked files.`);
  }
}
