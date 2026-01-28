/**
 * ESLint configuration factory for km monorepo.
 *
 * Usage:
 *   import { createEslintConfig } from "@km/infra/eslint"
 *   export default createEslintConfig({ tsconfigRootDir: import.meta.dirname })
 */

import tseslint from "typescript-eslint"
// @ts-expect-error - no type declarations available
import pluginPromise from "eslint-plugin-promise"
import type { Linter } from "eslint"

export interface EslintConfigOptions {
  /**
   * Required: Directory containing tsconfig.json for type-aware linting.
   * Usually: import.meta.dirname
   */
  tsconfigRootDir: string

  /**
   * Additional file patterns to ignore
   */
  ignores?: string[]

  /**
   * Additional test file patterns (for relaxed rules)
   */
  testPatterns?: string[]

  /**
   * Additional script file patterns (for relaxed rules)
   */
  scriptPatterns?: string[]
}

// Bun/Node globals that ESLint projectService doesn't resolve from @types/bun
const bunGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  global: "readonly",
  Bun: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
} as const

// Type safety rules
const typeSafetyRules: Linter.RulesRecord = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "warn",
  "@typescript-eslint/no-unsafe-member-access": "warn",
  "@typescript-eslint/no-unsafe-call": "warn",
  "@typescript-eslint/no-unsafe-return": "warn",
  "@typescript-eslint/no-unsafe-argument": "warn",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/no-unnecessary-type-assertion": "off",
}

// Async/Promise rules
const asyncRules: Linter.RulesRecord = {
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/require-await": "warn",
  "@typescript-eslint/return-await": ["error", "in-try-catch"],
  "no-async-promise-executor": "error",
  "no-promise-executor-return": "error",
  "prefer-promise-reject-errors": "error",
  "promise/no-nesting": "warn",
  "promise/no-callback-in-promise": "warn",
  "promise/prefer-await-to-then": "warn",
  "promise/prefer-await-to-callbacks": "warn",
}

// Code quality rules
const codeQualityRules: Linter.RulesRecord = {
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-deprecated": "warn",
  curly: ["error", "multi-line"],
  "@typescript-eslint/no-require-imports": "error",
}

// Relaxed rules for test files
const relaxedTestRules: Linter.RulesRecord = {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-floating-promises": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/await-thenable": "off",
  "@typescript-eslint/unbound-method": "off",
  "@typescript-eslint/return-await": "off",
  "@typescript-eslint/no-base-to-string": "off",
  "no-promise-executor-return": "off",
  "promise/no-nesting": "off",
  "promise/no-callback-in-promise": "off",
  "promise/prefer-await-to-then": "off",
  "promise/prefer-await-to-callbacks": "off",
  "promise/catch-or-return": "off",
  "promise/always-return": "off",
  "promise/param-names": "off",
}

/**
 * Creates an ESLint flat config array with TypeScript and Promise support.
 *
 * Features:
 * - typescript-eslint with type-aware linting
 * - eslint-plugin-promise for async best practices
 * - Relaxed rules for test and script files
 * - Bun/Node global definitions
 */
export function createEslintConfig(
  options: EslintConfigOptions,
): Linter.Config[] {
  const {
    tsconfigRootDir,
    ignores = [],
    testPatterns = [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/tests/**/*.ts",
      "scripts/**/*.ts",
    ],
    scriptPatterns = [],
  } = options

  const allRelaxedPatterns = [...testPatterns, ...scriptPatterns]

  return [
    // Global ignores
    {
      ignores: [
        "website/**",
        "vendor/**",
        ".claude/**",
        "test-results/**",
        ...ignores,
      ],
    },

    // TypeScript recommended rules with type checking
    ...tseslint.configs.recommendedTypeChecked,

    // Promise plugin
    pluginPromise.configs["flat/recommended"],

    // Parser options and globals
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
        globals: bunGlobals,
      },
    },

    // Main rules for TypeScript files
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        ...typeSafetyRules,
        ...asyncRules,
        ...codeQualityRules,
      },
    },

    // Relaxed rules for test and script files
    {
      files: allRelaxedPatterns,
      rules: relaxedTestRules,
    },

    // Disable type-checked rules for JS config files
    {
      files: ["*.js", "*.mjs", "*.cjs"],
      ...tseslint.configs.disableTypeChecked,
    },

    // Standard ignores
    {
      ignores: [
        "node_modules/",
        "**/node_modules/",
        "dist/",
        "**/dist/",
        "build/",
        "coverage/",
        "*.lcov",
        "*.log",
        ".env",
        ".env.*",
        "*.min.js",
        "*.bundle.js",
        ".DS_Store",
        "archive/",
        "apps/km-cli/src/tui/experiments/",
        "vendor/opentui/issues/",
      ],
    },
  ] as Linter.Config[]
}

// Re-exports for convenience
export { tseslint, pluginPromise }
