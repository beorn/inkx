// Wrapper to register agent.test.md with Vitest
import { registerMdTests } from "@beorn/mdtest/vitest"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const testFile = join(__dirname, "agent.test.md")

await registerMdTests([testFile])
