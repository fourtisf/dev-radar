import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://devradar.org'),
  title: 'DevRadar — Deployer Intelligence for Solana',
  description:
    'Every dev has a record. DevRadar compiles it in under two seconds — launches, rugs, bundles, funding — before your entry.',
  openGraph: {
    title: 'DevRadar — Deployer Intelligence for Solana',
    description:
      'Every deployer wallet carries a record — launches, rugs, bundles, funding. Compiled into one dossier in under two seconds.',
    url: '/',
    siteName: 'DevRadar',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'DevRadar — Deployer Intelligence for Solana',
    description: 'Know the dev before you ape.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <head>
        {/* Fonts exactly as the prototype: Clash Display + Switzer via
            Fontshare (no next/font support), Geist Mono via Google. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600&f[]=switzer@400,500,600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
