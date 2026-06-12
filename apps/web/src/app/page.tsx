import { prisma, type Dev } from '@devradar/db';
import { dossierDto } from '@/lib/dossier';
import { LandingClient } from '@/components/landing/LandingClient';
import { profileFromDossier, STATIC_PROFILES, type LpProfile } from '@/components/landing/profiles';

/** ISR: hero flagship dossiers refresh every 5 minutes. */
export const revalidate = 300;

async function flagshipProfiles(): Promise<LpProfile[]> {
  try {
    const picks: (Dev | null)[] = await Promise.all([
      prisma.dev.findFirst({ where: { verdict: 'WINNER' }, orderBy: { bestAthUsd: 'desc' } }),
      prisma.dev.findFirst({ where: { verdict: 'RUGGER' }, orderBy: { launchCount: 'desc' } }),
      prisma.dev.findFirst({ where: { verdict: 'FRESH' }, orderBy: { firstSeenAt: 'desc' } }),
    ]);
    const profiles: LpProfile[] = [];
    for (const dev of picks) {
      if (!dev) continue;
      const tokens = await prisma.token.findMany({
        where: { devWallet: dev.wallet },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      profiles.push(profileFromDossier(dossierDto(dev, tokens)));
    }
    // The cycling card needs all three archetypes to read right —
    // fall back to the prototype's static profiles until the DB has them.
    return profiles.length === 3 ? profiles : STATIC_PROFILES;
  } catch {
    return STATIC_PROFILES; // DB down / first build — never break the landing
  }
}

export default async function LandingPage(): Promise<JSX.Element> {
  const profiles = await flagshipProfiles();
  return <LandingClient profiles={profiles} />;
}
