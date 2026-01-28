// Wrapper to register agent.test.md with Bun test
import { registerMdTests } from "../vendor/beorn-mdtest/src/integrations/bun.js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const testFile = join(__dirname, "agent.test.md")

await registerMdTests([testFile])
