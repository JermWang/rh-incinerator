import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@incinerator/chain", "@incinerator/sponsor"],
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.blockscout.com" },
      { protocol: "https", hostname: "explorer.testnet.chain.robinhood.com" },
      { protocol: "https", hostname: "robinhoodchain.blockscout.com" },
      { protocol: "https", hostname: "**.ipfs.io" },
      { protocol: "https", hostname: "ipfs.io" },
    ],
  },
  async redirects() {
    // These pages were merged into the landing page and /transparency.
    return [
      { source: "/how-it-works", destination: "/", permanent: true },
      { source: "/security", destination: "/transparency", permanent: true },
      { source: "/sponsor", destination: "/transparency", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
