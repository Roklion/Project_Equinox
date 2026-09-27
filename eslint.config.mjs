import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const presentationImports = ["@/app/**", "@/components/**", "**/app/**", "**/components/**"];

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            ...presentationImports,
            "@/application/**", "**/application/**",
            "@/persistence/**", "**/persistence/**",
            "next", "next/**", "react", "react-dom", "react-dom/**",
            "pg", "pg/**", "drizzle-orm", "drizzle-orm/**",
          ],
          message: "Domain rules must remain independent of presentation, workflows, and persistence.",
        }],
      }],
    },
  },
  {
    files: ["src/persistence/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: presentationImports,
          message: "Application workflows and persistence must not depend on presentation.",
        }],
      }],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [...presentationImports, "@/persistence/**", "**/persistence/**", "pg", "pg/**", "drizzle-orm", "drizzle-orm/**"],
          message: "Application services use repository ports, not database adapters or SQL types.",
        }],
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
]);
