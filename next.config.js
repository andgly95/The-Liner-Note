/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Native module: must be required at runtime, not bundled by webpack.
  experimental: { serverComponentsExternalPackages: ['better-sqlite3'] },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.discogs.com',
      },
      {
        protocol: 'https',
        hostname: 'st.discogs.com',
      },
      { protocol: 'https', hostname: 'coverartarchive.org' },
      { protocol: 'https', hostname: '**.archive.org' },
    ],
  },
};

module.exports = nextConfig;
