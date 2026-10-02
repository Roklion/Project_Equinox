import type { NextConfig } from "next";

const devHostname = process.env.EQUINOX_DEV_HOSTNAME?.trim();

const nextConfig: NextConfig = {
  // Keep repository-owned agent guidance stable when starting the dev server.
  agentRules: false,
  allowedDevOrigins: devHostname ? [devHostname] : [],
};

export default nextConfig;
