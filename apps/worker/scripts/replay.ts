/**
 * Local dev helper: POSTs the recorded sample payloads in fixtures/ to
 * the running worker's webhook endpoint, simulating Helius deliveries.
 *
 *   pnpm replay                 # all create fixtures once
 *   pnpm replay -- --loop       # keep replaying every few seconds
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = process.env.WORKER_PORT ?? '8787';
const secret = process.env.HELIUS_WEBHOOK_SECRET ?? '';
const url = `http://localhost:${port}/webhook/helius`;
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const loop = process.argv.includes('--loop');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function freshen(payload: unknown[], salt: string): unknown[] {
  // Re-mint on every loop pass so repeated replays insert new tokens.
  return payload.map((tx) => {
    const t = structuredClone(tx) as Record<string, unknown>;
    t['timestamp'] = Math.floor(Date.now() / 1000);
    t['signature'] = `${String(t['signature']).slice(0, 60)}${salt}`;
    const transfers = t['tokenTransfers'] as { mint: string }[] | undefined;
    if (salt && transfers?.[0]) {
      transfers[0].mint = `${transfers[0].mint.slice(0, 36)}${salt.padStart(8, '0')}`;
    }
    return t;
  });
}

async function post(file: string, salt: string): Promise<void> {
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8')) as unknown[];
  const body = JSON.stringify(freshen(raw, salt));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: secret },
    body,
  });
  const text = await res.text();
  console.log(`POST ${file} → ${res.status} ${text}`);
  if (res.status === 401) {
    console.error('Hint: set HELIUS_WEBHOOK_SECRET in .env (worker and replay must match).');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const files = readdirSync(fixturesDir).filter((f) => f.startsWith('create-'));
  let pass = 0;
  do {
    for (const f of files) {
      await post(f, pass === 0 ? '' : `r${pass}${f.replace(/\D/g, '')}`);
      await sleep(800);
    }
    pass++;
    if (loop) await sleep(4000);
  } while (loop);
  console.log('Replay complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
