/**
 * Durable stderr writes for exit-time diagnostics.
 *
 * `process.stderr.write` queues on the stream's internal buffer when stderr
 * is a TTY (and on some runtimes, a pipe). Diagnostics emitted near process
 * exit — the panic flush in cleanup(), a host app's resume-hint printer
 * inside `process.on("exit")` — risk two failure modes on that queue: a
 * later sync write can be emitted ahead of still-queued bytes (order
 * inversion), and bytes still queued when the process dies are dropped
 * (truncated tails). `writeSync(fd)` is the same durability idiom
 * `cleanup()` uses for terminal protocol bytes on stdout ("async write may
 * not flush before exit"): bytes are on the fd before the call returns, so
 * ordering is call order and nothing can be dropped at exit.
 *
 * Context (bead @km/silvercode/19767): the user-visible
 * `Resume with:ACP backend RSS watchdog tripped…` corruption was primarily a
 * CURSOR overprint — a redundant `?1049l` from a host emergency-reset exit
 * handler DECRC-jumped the cursor back over the already-printed diagnostic
 * (fixed host-side by disarming that net after graceful teardown). The
 * byte-level capture for that bug showed the diagnostic emitted complete and
 * in order; this module hardens the adjacent stream-queue risk so exit-time
 * diagnostics stay deterministic regardless of which writer runs last.
 *
 * We only take the sync path when stderr is fd-backed AND
 * `process.stderr.write` is still the native method — tests and output
 * guards intercept the method, and bypassing their capture would leak bytes
 * to the real terminal.
 */

import { writeSync } from "node:fs"

/** The unpatched `process.stderr.write`, captured at module load — before any
 * test mock or output guard swaps the method. */
const NATIVE_STDERR_WRITE = process.stderr.write

/** Injectable seams for tests. Production callers pass nothing. */
export interface WriteStderrDurablyDeps {
  stderr?: { fd?: number; write: (chunk: string) => boolean }
  nativeWrite?: unknown
  writeSyncFn?: typeof writeSync
}

/**
 * Write `text` to stderr so it survives process exit with deterministic
 * ordering relative to other sync writes (panic flush before resume hints).
 * Falls back to the stream method when stderr is intercepted or fd-less;
 * swallows only the final-resort failure (stderr gone on a hard crash path).
 */
export function writeStderrDurably(text: string, deps: WriteStderrDurablyDeps = {}): void {
  const stderr = deps.stderr ?? process.stderr
  const nativeWrite = deps.nativeWrite ?? NATIVE_STDERR_WRITE
  const writeSyncFn = deps.writeSyncFn ?? writeSync
  const pristine = stderr.write === nativeWrite && typeof stderr.fd === "number"
  if (pristine) {
    try {
      writeSyncFn(stderr.fd as number, text)
      return
    } catch {
      // fd rejected the sync write (closed, redirected oddly) — fall through
      // to the stream method below rather than dropping the diagnostic.
    }
  }
  try {
    stderr.write(text)
  } catch {
    // Best-effort — stderr may already be torn down on a hard crash path.
  }
}
