import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@nivo/sankey", "@nivo/treemap", "@nivo/bar", "@nivo/pie", "@nivo/line"],

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
