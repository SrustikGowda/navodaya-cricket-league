import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/theme/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: "/2026", permanent: false },
      { source: "/2026/admin", destination: "/admin", permanent: false },
      { source: "/2026/admin/:path*", destination: "/admin/:path*", permanent: false },
    ];
  },
  output: "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "qrcode"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
};

export default nextConfig;
