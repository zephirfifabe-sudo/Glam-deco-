import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP is intentionally permissive for Stripe.js / Checkout only.
// Extend the allowlist here if a new external script/frame is added -
// never with 'unsafe-inline'/'unsafe-eval' beyond what Next.js dev mode requires.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' https://js.stripe.com${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output keeps the production Docker image minimal - only the
  // traced dependencies are copied in (see Dockerfile).
  output: "standalone",
  images: {
    // next/image proxies remote images through the server - an open wildcard
    // hostname is an SSRF-adjacent risk, so this allowlist is deliberately
    // narrow. Add the real production storage/CDN hostname when it's chosen
    // (ADR-006) instead of widening this to "**".
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
      {
        protocol: "http",
        hostname: "minio",
        port: "9000",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
