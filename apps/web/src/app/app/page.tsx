import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TerminalClient } from '@/components/terminal/TerminalClient';

export const metadata: Metadata = {
  title: 'DevRadar — Terminal',
  description: 'Live pump.fun deploys with deployer dossiers, DR Scores and funding traces.',
};

export default function TerminalPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <TerminalClient />
    </Suspense>
  );
}
