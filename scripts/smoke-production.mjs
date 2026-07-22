import process from 'node:process';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const baseInput =
  valueAfter('--base-url') || process.env.FLUXA_API_BASE_URL || '';
const allowHttp = process.argv.includes('--allow-http');
if (!baseInput) {
  console.error('Provide --base-url or FLUXA_API_BASE_URL.');
  process.exit(1);
}
const base = baseInput.replace(/\/+$/, '');
const parsed = new URL(base);
if (!allowHttp && parsed.protocol !== 'https:') {
  console.error('Production smoke tests require HTTPS.');
  process.exit(1);
}

async function check(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}${pathname}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    console.log(
      `${pathname}: OK`,
      typeof body === 'object' ? JSON.stringify(body) : body,
    );
  } finally {
    clearTimeout(timeout);
  }
}

await check('/health/live');
await check('/health/ready');
console.log('Fluxa production smoke test passed.');
