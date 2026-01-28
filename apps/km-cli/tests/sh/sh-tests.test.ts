// Wrapper to register all sh/*.test.md files with Vitest
import { registerMdTests } from "@beorn/mdtest/vitest"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const testPattern = join(__dirname, "*.test.md")

await registerMdTests(testPattern)
