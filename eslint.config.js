import tseslint from "typescript-eslint"
import pluginPromise from "eslint-plugin-promise"

export default [
  ...tseslint.configs.recommendedTypeChecked,
  pluginPromise.configs["flat/recommended"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Type Safety - enforce strict typing
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",

      // Async/Await & Promise Safety (type-checked rules)
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],

      // Promise best practices (core ESLint)
      "no-async-promise-executor": "error",
      "no-promise-executor-return": "error",
      "prefer-promise-reject-errors": "error",

      // Promise plugin rules (eslint-plugin-promise)
      "promise/no-nesting": "warn",
      "promise/no-callback-in-promise": "warn",
      "promise/prefer-await-to-then": "warn",
      "promise/prefer-await-to-callbacks": "warn",

      // Code Quality
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-deprecated": "warn",
      curly: ["error", "multi-line"]
    }
  },
  {
    // Relax rules for test files and scripts
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/tests/**/*.ts",
      "scripts/**/*.ts"
    ],
    rules: {
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
      "promise/param-names": "off"
    }
  },
  {
    // Disable type-checked rules for JS config files
    files: ["*.js", "*.mjs", "*.cjs"],
    ...tseslint.configs.disableTypeChecked
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "*.lcov",
      "*.log",
      ".env",
      ".env.*",
      "*.min.js",
      "*.bundle.js",
      ".DS_Store"
    ]
  }
]
