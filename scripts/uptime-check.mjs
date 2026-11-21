import { createHash } from 'node:crypto';

/**
 * Production uptime probe (run by .github/workflows/uptime.yml).
 *
 * It replaces the need for a separate Upptime repository: the same GitHub Actions runner that
 * would ping the site also opens and closes an issue, so the owner is told when the shop is down
 * instead of a customer discovering it.
 *
 * Configuration (repository variable, not a secret):
 *   UPTIME_BASE_URL     e.g. https://panchabindu.com   (default below)
 *
 * Exit code 0 = healthy, 1 = unhealthy. A 401/403 is reported as "protected" and does not page,
 * because Vercel deployment protection answers that way for preview URLs.
 */

const BASE_URL = (process.env.UPTIME_BASE_URL || 'https://panchabindu.com').replace(/\/+$/, '');
const TIMEOUT_MS = 12_000;

const CHECKS = [
  { name: 'home', path: '/', expect: 'html' },
  { name: 'health', path: '/api/healthz', expect: 'json' },
  { name: 'diagnostics', path: '/api/diagnostics', expect: 'json' },
];

// Error pages are multi-line HTML; the GitHub issue body and the step summary both expect one
// clean line, so tags are stripped and whitespace collapsed.
function snippet(body) {
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 140) || 'empty response body';
}

async function probe(check) {
  const url = `${BASE_URL}${check.path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'panchabindu-uptime/1.0', 'cache-control': 'no-cache' },
    });
    const elapsed = Date.now() - started;
    const body = await response.text();
    const digest = createHash('sha256').update(body).digest('hex').slice(0, 12);

    if (response.status === 401 || response.status === 403) {
      return { ...check, url, status: response.status, elapsed, state: 'protected', digest };
    }
    if (!response.ok) {
      return { ...check, url, status: response.status, elapsed, state: 'down', digest, note: snippet(body) };
    }
    if (check.expect === 'json') {
      try {
        JSON.parse(body);
      } catch {
        return { ...check, url, status: response.status, elapsed, state: 'down', digest, note: 'response was not JSON' };
      }
    }
    return { ...check, url, status: response.status, elapsed, state: 'up', digest };
  } catch (error) {
    return {
      ...check,
      url,
      status: 0,
      elapsed: Date.now() - started,
      state: 'down',
      note: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

const results = await Promise.all(CHECKS.map(probe));

for (const result of results) {
  const badge = result.state === 'up' ? '✅' : result.state === 'protected' ? '🔒' : '❌';
  console.log(`${badge} ${result.name.padEnd(12)} ${String(result.status).padStart(3)} ${String(result.elapsed).padStart(6)}ms  ${result.url}${result.note ? `  (${result.note})` : ''}`);
}

const down = results.filter((result) => result.state === 'down');
const lines = [
  `### Uptime check — ${new Date().toISOString()}`,
  '',
  `Base URL: \`${BASE_URL}\``,
  '',
  '| Check | Status | Latency | Result |',
  '| --- | --- | --- | --- |',
  ...results.map((result) => `| ${result.name} | ${result.status || '—'} | ${result.elapsed} ms | ${result.state}${result.note ? ` (${result.note})` : ''} |`),
];

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(summaryPath, `${lines.join('\n')}\n`);
}

const readable = results.map((result) => `${result.name}=${result.state}${result.status ? `(${result.status})` : ''}`).join(', ');

// Machine-readable output for the workflow steps that open/close the tracking issue.
if (process.env.GITHUB_OUTPUT) {
  const { appendFile } = await import('node:fs/promises');
  const failing = down.map((result) => `${result.name} → ${result.status || 'no response'}${result.note ? ` (${result.note})` : ''}`).join('\n');
  await appendFile(process.env.GITHUB_OUTPUT, `healthy=${down.length === 0}\nbase_url=${BASE_URL}\nreport=${readable}\nfailing<<EOF\n${failing}\nEOF\n`);
}

if (down.length > 0) {
  console.error(`\nUnhealthy: ${down.map((result) => result.name).join(', ')}`);
  process.exit(1);
}
console.log('\nAll checks healthy.');
