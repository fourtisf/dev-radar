/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@devradar/db'],
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
