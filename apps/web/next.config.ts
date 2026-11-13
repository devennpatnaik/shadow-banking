import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  transpilePackages: [
    '@shadow-banking/core',
    '@shadow-banking/strategy',
    '@shadow-banking/risk',
    '@shadow-banking/controller',
    '@shadow-banking/execution',
    '@shadow-banking/accounting',
    '@shadow-banking/opportunity',
    '@shadow-banking/simulator',
  ],
  outputFileTracingIncludes: {
    '*': ['./migrations/**/*', './data/**/*'],
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
