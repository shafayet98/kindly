import type { NextConfig } from "next";

// Every patient and clinician page depends on the signed-in session, so pages render
// per request; Cache Components is left off to keep auth and data access simple.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone (calls) and location (timezone setup) only for this site itself; nothing else.
  { key: "Permissions-Policy", value: "microphone=(self), geolocation=(self), camera=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Reads its timezone boundary data from disk at runtime, so it must not be bundled.
  serverExternalPackages: ["geo-tz"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
