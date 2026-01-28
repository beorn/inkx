// Wrapper to register all sh/*.test.md files with Bun test
import { registerMdTests } from "../../../../vendor/beorn-mdtest/src/integrations/bun.js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const testPattern = join(__dirname, "*.test.md")

await registerMdTests(testPattern)
