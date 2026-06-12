'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MeDto } from './types';

const LOGGED_OUT: MeDto = { authenticated: false, tier: 'SCOUT' };

export function useMe(): { me: MeDto; refresh: () => Promise<MeDto> } {
  const [me, setMe] = useState<MeDto>(LOGGED_OUT);

  const refresh = useCallback(async (): Promise<MeDto> => {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return LOGGED_OUT;
      const data = (await res.json()) as MeDto;
      setMe(data);
      return data;
    } catch {
      return LOGGED_OUT;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { me, refresh };
}
