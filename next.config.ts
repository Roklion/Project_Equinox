import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep repository-owned agent guidance stable when starting the dev server.
  agentRules: false,
};

export default nextConfig;
