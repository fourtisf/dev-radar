import { prisma, type Prisma } from '@devradar/db';
import type { ChainClient } from '../chain/types';
import { detectBundle } from '../engine/bundle';
import { traceFunding, type KnownSets } from '../engine/funding';
import { countSnipers, sniperLevel } from '../engine/snipers';
import { alertsQueue, type LaunchAnalysisJob } from '../lib/queues';
import { refreshDev } from './refreshDev';

/** KnownAddress rows + flagged dev wallets → label maps for the BFS. */
export async function loadKnownSets(): Promise<KnownSets> {
  const [rows, flaggedDevs] = await Promise.all([
    prisma.knownAddress.findMany(),
    prisma.dev.findMany({ where: { flagged: true }, select: { wallet: true } }),
  ]);
  const cex = new Map<string, string>();
  const mixer = new Map<string, string>();
  const flagged = new Map<string, string>();
  for (const r of rows) {
    if (r.type === 'cex') cex.set(r.address, r.label);
    else if (r.type === 'mixer') mixer.set(r.address, r.label);
    else if (r.type === 'flagged') flagged.set(r.address, r.label);
  }
  for (const d of flaggedDevs) flagged.set(d.wallet, 'Flagged deployer cluster');
  return { cex, mixer, flagged };
}

/**
 * `launch-analysis` consumer (handoff 7.4–7.6): bundle detection,
 * sniper level, funding trace → persist → recompute DR Score →
 * NOTIFY 'dossier-update' (via refreshDev).
 */
export async function analyzeLaunch(job: LaunchAnalysisJob, chain: ChainClient): Promise<void> {
  const [buys, totalSupply, known] = await Promise.all([
    chain.getLaunchBuys(job.mint, job.slot),
    chain.getTokenSupply(job.mint),
    loadKnownSets(),
  ]);

  const fundingParents = await chain.getFundingParents([...new Set(buys.map((b) => b.wallet))]);
  const bundle = detectBundle({ deployer: job.deployer, buys, totalSupply, fundingParents });
  const snipers = sniperLevel(countSnipers(buys, job.deployer, bundle.clusterWallets));

  const funding = await traceFunding(
    job.deployer,
    { getIncomingSolTransfers: (w) => chain.getIncomingSolTransfers(w) },
    known,
  );

  await prisma.token.update({
    where: { mint: job.mint },
    data: { bundlePct: bundle.bundlePct, sniperLvl: snipers },
  });
  await prisma.dev.update({
    where: { wallet: job.deployer },
    data: {
      fundingType: funding.fundingType,
      fundingPath:
        funding.path.length > 0
          ? (funding.path as unknown as Prisma.InputJsonValue)
          : undefined,
    },
  });

  await refreshDev(job.deployer);

  // Rug-link flag: anyone who traced this dev recently gets pinged
  // (Operator+ filtering happens in the alert dispatcher).
  if (funding.fundingType === 'LINKED_FLAGGED') {
    const token = await prisma.token.findUnique({ where: { mint: job.mint } });
    const dev = await prisma.dev.findUnique({ where: { wallet: job.deployer } });
    if (token && dev) {
      await alertsQueue.add('rug-link', {
        kind: 'rug-link',
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        ca: token.mint,
        devWallet: dev.wallet,
        verdict: dev.verdict,
        launchCount: dev.launchCount,
        rugCount: dev.rugCount,
        bestAthUsd: Number(dev.bestAthUsd),
        bundlePct: Number(token.bundlePct),
        sniperLvl: token.sniperLvl,
        drScore: token.drScore,
      });
    }
  }
}
