import type { NextConfig } from "next";

// Every patient and clinician page depends on the signed-in session, so pages render
// per request; Cache Components is left off to keep auth and data access simple.
const nextConfig: NextConfig = {
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
