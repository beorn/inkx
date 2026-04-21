#!/usr/bin/env bun
/**
 * retrieve-memory — companion CLI for pointer-mode injection.
 *
 * Phase-3 pointer-mode envelope emits only title + path + date + tags
 * + 1-line summary, and tells the model: "Call retrieve_memory(id) for
 * full content." This binary is the implementation.
 *
 * Usage:
 *   bun tools/retrieve-memory.ts <id>        # fetch, print content to stdout
 *   bun tools/retrieve-memory.ts --json <id> # JSON-wrapped result
 *
 * Exit codes:
 *   0 — found, content printed
 *   1 — not found (registered fetchers all returned null)
 *   2 — bad invocation
 *
 * Wiring into MCP: tribe's MCP proxy can expose this as a tool —
 * see vendor/bearly/plugins/tribe/ for the pattern. Or call directly
 * from a `bun` subprocess when needed.
 */

import { retrieveMemory } from "../vendor/bearly/plugins/injection-envelope/src/index.ts"

function usage(): never {
  process.stderr.write(
    "usage: retrieve-memory [--json] <id>\n" +
      "       <id> may be: a pointer id issued by wrapInjectedContext, an\n" +
      "       absolute filesystem path, or anything `qmd get <id>` accepts.\n",
  )
  process.exit(2)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) usage()
  const jsonMode = args.includes("--json")
  const id = args.find((a) => !a.startsWith("--"))
  if (!id) usage()

  const result = await retrieveMemory(id)
  if (!result) {
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ found: false, id }) + "\n")
    } else {
      process.stderr.write(`retrieve-memory: no fetcher resolved "${id}"\n`)
    }
    process.exit(1)
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ found: true, ...result }) + "\n")
  } else {
    process.stdout.write(result.content)
    if (!result.content.endsWith("\n")) process.stdout.write("\n")
  }
}

if (import.meta.main) {
  void main()
}
