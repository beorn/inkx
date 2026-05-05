/**
 * `bd` deprecation notice — print once per process invocation.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: bd is an alias for `km task`.
 * The shim still owns lifecycle semantics that `km task` doesn't yet
 * carry (close/drop with --reason, the path-form materialization, …)
 * — those land in Wave 3/4 — so bd can't be a pure argv translator
 * yet, but the *intent* is to deprecate it. Print a nudge so users know
 * the surface is moving.
 *
 * Suppression rules:
 *   - Stdout-only: written to stderr so JSON callers and pipes don't
 *     break.
 *   - Once-per-process: a module-level flag prevents repeated emission
 *     when bd subcommand chains call into other bd subcommands.
 *   - Off in tests / non-TTY: env `KM_QUIET_DEPRECATION=1` or stderr
 *     not a tty silences the notice. The integration tests invoke
 *     `bd` repeatedly and don't want the noise; honest interactive
 *     use is a tty.
 *   - Off when JSON output is requested: detected by a quick scan of
 *     `process.argv` for `--json`. Avoids polluting tooling.
 */

let printed = false

export function printBdDeprecationOnce(): void {
  if (printed) return
  printed = true

  // Quiet in tests / scripted contexts.
  if (process.env.KM_QUIET_DEPRECATION === "1") return
  if (!process.stderr.isTTY) return
  if (process.argv.includes("--json")) return

  process.stderr.write(
    "Note: `bd` is an alias for `km task`. This shim will be removed in v2.\n" +
      "      Set KM_QUIET_DEPRECATION=1 to silence.\n",
  )
}

/** Test-only reset hook. */
export function _resetBdDeprecationForTests(): void {
  printed = false
}
