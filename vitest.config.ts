import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // next-auth importe "next/server" sans extension .js — on fixe la résolution
      "next/server": resolve("./node_modules/next/dist/server/web/exports/index.js"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    server: {
      deps: {
        // Forcer l'inlining de next-auth pour corriger les imports CJS/ESM
        inline: ["next-auth", "@auth/core"],
      },
    },
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["src/lib/prisma.ts", "src/lib/auth.ts"],
    },
  },
});
