import { createEslintConfig } from "./packages/km-infra/eslint/index.ts"

export default createEslintConfig({
  tsconfigRootDir: import.meta.dirname,
})
