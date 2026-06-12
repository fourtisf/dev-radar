import type { DevDto } from './types';

export interface FundSegment {
  text: string;
  gold?: boolean;
}

/**
 * Renders Dev.fundingType + fundingPath into the prototype's funding
 * line ("FUNDING → <gold>Binance 8</gold> hot wallet · …").
 */
export function fundingSegments(dev: Pick<DevDto, 'fundingType' | 'fundingPath'>): FundSegment[] {
  const path = dev.fundingPath ?? [];
  const last = path[path.length - 1];
  const label = last?.label ?? null;
  const hops = last?.hop ?? path.length;

  switch (dev.fundingType) {
    case 'CEX_CLEAN':
      return [
        { text: label ?? 'CEX', gold: true },
        { text: ' hot wallet · clean lineage · no mixer pattern' },
      ];
    case 'MIXER':
      return [
        { text: 'instant-swap chain · ' },
        { text: 'mixer pattern', gold: true },
        { text: ' detected' },
      ];
    case 'LINKED_FLAGGED':
      return [
        { text: 'wallet chain · ' },
        { text: `${Math.max(hops, 1)} hop${hops === 1 ? '' : 's'}`, gold: true },
        { text: ` from flagged ${label ?? 'rugger cluster'}` },
      ];
    default:
      return [{ text: 'inflow origin ' }, { text: 'unverified', gold: true }];
  }
}
