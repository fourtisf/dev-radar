import { prisma } from '@devradar/db';
import type { BackfillDb } from './backfillDev';
import type { Outcome, Verdict } from '../engine/types';

/** Prisma adapter for the backfill consumer's persistence interface. */
export const prismaBackfillDb: BackfillDb = {
  async getDev(wallet) {
    const dev = await prisma.dev.findUnique({ where: { wallet } });
    if (!dev) return null;
    return {
      wallet: dev.wallet,
      firstSeenAt: dev.firstSeenAt,
      backfilledAt: dev.backfilledAt,
      fundingType: dev.fundingType,
    };
  },
  async createDev(wallet, firstSeenAt) {
    await prisma.dev.upsert({
      where: { wallet },
      create: { wallet, firstSeenAt },
      update: {},
    });
  },
  async upsertToken(t) {
    await prisma.token.upsert({
      where: { mint: t.mint },
      create: { ...t, outcome: t.outcome as Outcome },
      update: {
        outcome: t.outcome as Outcome,
        peakMcapUsd: t.peakMcapUsd,
        lifespanS: t.lifespanS,
      },
    });
  },
  async getDevTokens(wallet) {
    const tokens = await prisma.token.findMany({ where: { devWallet: wallet } });
    return tokens.map((t) => ({
      outcome: t.outcome,
      peakMcapUsd: Number(t.peakMcapUsd),
      lifespanS: t.lifespanS,
    }));
  },
  async updateDev(wallet, data) {
    await prisma.dev.update({
      where: { wallet },
      data: { ...data, verdict: data.verdict as Verdict },
    });
  },
};
