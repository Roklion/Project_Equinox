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
          ],
          message: "Domain rules must remain independent of presentation, workflows, and persistence.",
        }],
      }],
    },
  },
  {
    files: ["src/{application,persistence}/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: presentationImports,
          message: "Application workflows and persistence must not depend on presentation.",
        }],
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
]);
