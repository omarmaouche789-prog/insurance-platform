const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// Where /api/* is proxied: the Render service URL in production
// (API_BASE_URL=https://<service>.onrender.com), the local API in dev.
const apiBaseUrl = (process.env.API_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? "4000"}`).replace(/\/+$/, "");

if (process.env.VERCEL_ENV === "production" && !process.env.API_BASE_URL) {
  throw new Error("API_BASE_URL must be set for production builds (the Render API URL).");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
