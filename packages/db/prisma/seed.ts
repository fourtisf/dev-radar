/**
 * Seeds KnownAddress from prisma/seed/known_addresses.csv.
 *
 * The CSV is the maintained source of truth for CEX hot wallets,
 * instant-swap/mixer services and flagged cluster seeds. The shipped
 * rows are placeholders — replace with the top ~50 entries from a
 * public labels dataset before production (see handoff Section 6).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseCsv(text: string): { address: string; label: string; type: string }[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const [header, ...rows] = lines;
  if (header !== 'address,label,type') {
    throw new Error(`Unexpected CSV header: ${header}`);
  }
  return rows.map((line) => {
    const [address, label, type] = line.split(',').map((c) => c.trim());
    if (!address || !label || !type) throw new Error(`Bad CSV row: ${line}`);
    if (!['cex', 'mixer', 'flagged'].includes(type)) throw new Error(`Bad type in row: ${line}`);
    return { address, label, type };
  });
}

async function main(): Promise<void> {
  const csvPath = join(dirname(fileURLToPath(import.meta.url)), 'seed', 'known_addresses.csv');
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  for (const row of rows) {
    await prisma.knownAddress.upsert({
      where: { address: row.address },
      create: row,
      update: { label: row.label, type: row.type },
    });
  }
  console.log(`Seeded ${rows.length} known addresses.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
