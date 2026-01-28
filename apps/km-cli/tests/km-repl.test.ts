// Wrapper to register km-repl.test.md with Vitest
import { registerMdTests } from "@beorn/mdtest/vitest"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const testFile = join(__dirname, "km-repl.test.md")

await registerMdTests([testFile])
