// ESLint 9 flat config kvalitātes vārtam (`npm run lint`). Augstas-signāla bāze:
// JS recommended + typescript-eslint recommended visam TS kodam, plus React Hooks
// noteikumi web aplikācijai (rules-of-hooks + exhaustive-deps — tver stale-closure /
// useEffect atkarību kļūdas). Tipa-pārbaudes (type-aware) lint nav ieslēgts, lai
// vārts ir ātrs un nedublē `tsc` (typecheck jau ir atsevišķs vārts).
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Būves artefakti, ģenerēti faili un ne-avota mapes.
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "apps/web/public/**",
      "apps/web/next-env.d.ts",
      "test-results/**",
      ".playwright-mcp/**",
      // Lokāli, gitignored aģentu/rīku katalogi — var saturēt dinamiski ģenerētus
      // failus (piem. `.remember/tmp/*.ts`), kas citādi lauztu lint vārtu lokāli.
      ".remember/**",
      ".claude/**",
      "logs/**",
      "**/*.cjs"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      // TypeScript jau noķer nedefinētus identifikatorus; `no-undef` ar tipiem dod
      // viltus pozitīvus, tāpēc to izslēdz (typescript-eslint ieteikums).
      "no-undef": "off",
      // `_`-prefikss ir apzināts "neizmantots" signāls (piem. obligāts pozicionāls arguments).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      // Atļauj `interface X extends Base {}` (apzināts diskriminēto komandu/eventu
      // tipu paterns); joprojām aizliedz patiesi tukšu `{}` tipu.
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }]
    }
  },
  {
    // Web (React) — Hooks noteikumi.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
);
