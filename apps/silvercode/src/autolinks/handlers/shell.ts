/**
 * `shell:` handler — runs a user-defined command and returns sanitized stdout.
 *
 * This handler does NOT decode the URI; the `command` spec is carried via
 * `ctx.command` (passed through from the rule's structured `command: {exec, args}`).
 * Each `command.args[i]` has the literal `${resolves_to}` substituted with
 * `decodeURIComponent(uri.host || uri.pathname)` AT TOKEN LEVEL — never
 * concatenated into a shell string.
 *
 * Security model (the schema removes the injection surface; this function
 * keeps the runtime narrow):
 *   - `command.exec` is the program (bare name resolved via PATH, or absolute).
 *   - Stdin is closed (`input: ""`).
 *   - 5-second wall-clock timeout. Process is killed if it overruns.
 *     `killSignal: "SIGKILL"` ensures the child can't ignore the timeout.
 *   - Env is minimized: only `PATH`, `HOME`, `LANG` are inherited; `TERM`
 *     is forced to `dumb` so commands don't emit ANSI by default.
 *   - Stdout is capped at SHELL_PREVIEW_OUTPUT_CAP_BYTES — anything past
 *     that is truncated.
 *   - Output passes through `sanitizeShellOutput` which strips ANSI escape
 *     sequences (CSI, OSC, DCS), C0 control characters, and DEL — defense
 *     against terminal-injection in popover render.
 *   - stderr is ignored (we already log to debug).
 */

import { spawnSync } from "node:child_process"
import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"
import { sanitizeShellOutput, SHELL_PREVIEW_OUTPUT_CAP_BYTES, SHELL_PREVIEW_TIMEOUT_MS } from "../shell-utils.ts"

export const shellHandler: Handler = {
  scheme: "shell",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    const t = (ctx.now ?? Date.now)()
    const command = ctx.command
    if (!command) {
      return { result: { kind: "error", message: "shell preview missing command spec", resolvedAt: t } }
    }
    if (!command.exec || command.exec.length === 0) {
      return { result: { kind: "error", message: "shell preview missing exec", resolvedAt: t } }
    }

    // Decode the resolves_to value from the URI. For `shell:<value>` URIs
    // built by `parseResolvesTo`, the value lives in `host` or `pathname`
    // depending on what the user wrote.
    const resolvesTo = decodeShellResolvesTo(uri)

    // Per-arg literal substitution — single template variable, no
    // String.prototype.replace surprises ($&, $1, etc.).
    const argv = command.args.map((arg) => arg.split("${resolves_to}").join(resolvesTo))

    // Minimal env. TERM=dumb tells well-behaved tools to skip color codes.
    // Output sanitizer is the safety net for tools that ignore TERM.
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      HOME: process.env["HOME"] ?? "/",
      LANG: process.env["LANG"] ?? "C",
      TERM: "dumb",
    }

    const proc = spawnSync(command.exec, argv, {
      encoding: "utf-8",
      timeout: SHELL_PREVIEW_TIMEOUT_MS,
      killSignal: "SIGKILL",
      input: "",
      env,
      // Cap captured output up-front so a runaway command doesn't allocate
      // gigabytes before timing out. We then trim further to the byte cap.
      maxBuffer: SHELL_PREVIEW_OUTPUT_CAP_BYTES * 4,
    })

    if (proc.error) {
      // ETIMEDOUT shows up here when the timeout fires.
      const msg = String(proc.error)
      if (proc.signal === "SIGTERM" || proc.signal === "SIGKILL" || /ETIMEDOUT/i.test(msg)) {
        return {
          result: {
            kind: "error",
            message: `shell preview timed out after ${SHELL_PREVIEW_TIMEOUT_MS}ms`,
            resolvedAt: t,
          },
        }
      }
      return { result: { kind: "error", message: `shell: ${msg}`, resolvedAt: t } }
    }
    if (proc.signal === "SIGTERM" || proc.signal === "SIGKILL") {
      return {
        result: {
          kind: "error",
          message: `shell preview timed out after ${SHELL_PREVIEW_TIMEOUT_MS}ms`,
          resolvedAt: t,
        },
      }
    }
    if (proc.status !== 0) {
      return {
        result: { kind: "error", message: `shell exited ${proc.status ?? "?"}`, resolvedAt: t },
      }
    }

    const stdout = proc.stdout ?? ""
    const sanitized = sanitizeShellOutput(stdout)
    const body = capOutput(sanitized)
    return { result: { kind: "ok", body, format: "text", resolvedAt: t } }
  },
}

/**
 * Decode the `resolves_to` value from a `shell:` URI built by `parseResolvesTo`.
 *
 * `parseResolvesTo` only produces `shell:` URIs when the user typed an
 * explicit `shell://...` form (uncommon — the typical shell rule has a
 * `resolves_to` like `/Users/...` and a `preview: shell` directive). For
 * compatibility with the existing schema, we read the URI's host (when set)
 * or pathname; both are URL-decoded.
 */
function decodeShellResolvesTo(uri: URL): string {
  if (uri.host.length > 0) return decodeURIComponent(uri.host)
  const p = uri.pathname
  const stripped = p.startsWith("/") ? p.slice(1) : p
  return decodeURIComponent(stripped)
}

/**
 * Cap stdout to the configured byte cap, appending a marker if the output
 * was longer. Operates on bytes via Buffer to avoid splitting a multi-byte
 * UTF-8 codepoint visibly inside the popover.
 */
function capOutput(raw: string): string {
  const buf = Buffer.from(raw, "utf-8")
  if (buf.length <= SHELL_PREVIEW_OUTPUT_CAP_BYTES) return raw.trimEnd()
  const truncated = buf.subarray(0, SHELL_PREVIEW_OUTPUT_CAP_BYTES).toString("utf-8")
  return `${truncated.trimEnd()}\n[truncated — output exceeded ${SHELL_PREVIEW_OUTPUT_CAP_BYTES}B]`
}
