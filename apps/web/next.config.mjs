import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@devradar/db'],
  output: 'standalone',
  // Monorepo: trace workspace deps into the standalone bundle.
  experimental: {
    outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../../'),
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
