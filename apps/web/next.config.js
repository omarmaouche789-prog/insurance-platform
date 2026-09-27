const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const apiPort = process.env.API_PORT ?? "4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${apiPort}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
