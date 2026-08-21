/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp is used server-side to convert WebP mock-ups into PNG for pdf-lib
  experimental: {
    serverComponentsExternalPackages: ["sharp"]
  }
};

module.exports = nextConfig;
