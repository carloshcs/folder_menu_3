/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /lucide-react/,
      sideEffects: false,
    });
    return config;
  },
};

module.exports = nextConfig;
