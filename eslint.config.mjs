import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Business logic in server/domain must never import Prisma directly -
      // enforced here rather than only by convention (ARCHITECTURE.md).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Only server/repositories/** may import @prisma/client directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/repositories/**", "prisma/**", "src/lib/db/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
