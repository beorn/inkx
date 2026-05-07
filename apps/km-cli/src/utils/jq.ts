/**
 * Shared JSON / jq emission for list-shaped CLI commands.
 *
 * Wave-of-work `@km/cli/json-jq-everywhere`: every list-shaped command
 * gains `--json` + `--jq <expr>`. `--jq` implies `--json` — passing
 * `--jq` without `--json` is treated as if both were set.
 *
 * jq is not bundled as a node dep — we shell out to `jq` from PATH.
 * Rationale (mirrors `commands/list.ts`):
 *   - jq is a standard sysadmin tool, available on macOS / Linux / nix
 *   - `node-jq` brings a wasm bridge with non-trivial startup cost
 *   - Keeping the dep surface minimal preserves `bun km` cold-start
 *
 * If `jq` isn't in PATH, we surface a clear install hint and exit 1.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

/**
 * Emit `data` as JSON, optionally piped through `jq <expr>`.
 *
 * - `jqExpr` undefined → pretty-prints JSON to stdout (no jq)
 * - `jqExpr` set → spawns `jq <expr>`, writes JSON to stdin, streams
 *   stdout, propagates exit code
 *
 * The function never returns when jq fails — it `process.exit`s with
 * jq's exit code (or 1 if jq itself isn't installed). This matches the
 * "act like a unix pipe" contract: a failed `jq` filter should not
 * silently fall through to a "successful" caller.
 */
export async function emitJson(data: unknown, jqExpr?: string): Promise<void> {
  const json = JSON.stringify(data, null, 2)
  if (!jqExpr) {
    console.log(json)
    return
  }

  try {
    const proc = Bun.spawn(["jq", jqExpr], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    void proc.stdin.write(json)
    await proc.stdin.end()
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      console.error(term.red(`jq exited ${exitCode}: ${stderr.trim()}`))
      process.exit(exitCode)
    }
    process.stdout.write(stdout)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      console.error(term.red("--jq requires `jq` in PATH. Install with `brew install jq` or `nix-install nixpkgs#jq`."))
    } else {
      console.error(term.red(`jq invocation failed: ${msg}`))
    }
    process.exit(1)
  }
}

/**
 * Normalize the `--json` / `--jq` flag pair: if `jq` is set, treat
 * `json` as set too.
 *
 * Returns the effective values. Use at the top of a command's action:
 *
 * ```ts
 * const { json, jq } = normalizeJsonJq(options)
 * if (json) {
 *   await emitJson(payload, jq)
 *   return
 * }
 * ```
 */
export function normalizeJsonJq(options: { json?: boolean; jq?: string }): { json: boolean; jq?: string } {
  const jq = options.jq && options.jq.length > 0 ? options.jq : undefined
  const json = options.json === true || jq !== undefined
  return { json, jq }
}
