import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bez automatycznego AGENTS.md/CLAUDE.md przy `next dev`.
  agentRules: false,
  experimental: {
    // Zgłoszenie: do 4 zdjęć × 10 MB + pola formularza.
    serverActions: { bodySizeLimit: "45mb" },
    // proxy.ts obejmuje "/" — bez tego ciało żądania byłoby buforowane (i obcinane) do 10 MB.
    proxyClientMaxBodySize: "45mb",
  },
};

export default nextConfig;
