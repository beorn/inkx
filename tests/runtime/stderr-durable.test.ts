/**
 * writeStderrDurably — bead @km/silvercode/19767.
 *
 * The interleaving failure this guards against: a fatal-diagnostic stream
 * write (`process.stderr.write` from flushPanicReports) queues on the TTY
 * stream; a host app's resume-hint write inside `process.on("exit")` jumps
 * that queue, so the user sees `Resume with:ACP backend RSS watchdog
 * tripped…` — hint and diagnostic byte-braided, with the queued tail dropped
 * at exit. A `2>file` redirect of the same run is clean, proving emission
 * ORDER was already correct; only the stream-queue flush was not.
 *
 * Contract:
 *   1. Pristine fd-backed stderr → synchronous `writeSync(fd)`; complete
 *      bytes, FIFO with all other sync writes, immune to exit-time drops.
 *   2. Intercepted stderr (test mock, output guard) → route through the
 *      patched `.write` so captures keep working and no bytes leak to the
 *      real terminal.
 *   3. `writeSync` failure falls back to the stream write — the diagnostic
 *      is never silently dropped while a writer still exists.
 */

import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { describe, expect, test } from "vitest"
import { writeStderrDurably } from "../../packages/ag-term/src/runtime/stderr-durable"

function fakeStderr(): {
  stderr: { fd?: number; write: (chunk: string) => boolean }
  chunks: string[]
} {
  const chunks: string[] = []
  const stderr = {
    fd: 2 as number | undefined,
    write(chunk: string): boolean {
      chunks.push(chunk)
      return true
    },
  }
  return { stderr, chunks }
}

describe("writeStderrDurably", () => {
  test("pristine fd-backed stderr writes synchronously via writeSync", () => {
    const { stderr, chunks } = fakeStderr()
    const syncWrites: Array<{ fd: number; text: string }> = []
    writeStderrDurably("fatal diagnostic block", {
      stderr,
      nativeWrite: stderr.write, // pristine: write === native
      writeSyncFn: ((fd: number, text: string) => {
        syncWrites.push({ fd, text })
        return text.length
      }) as never,
    })
    expect(syncWrites).toEqual([{ fd: 2, text: "fatal diagnostic block" }])
    expect(chunks).toEqual([]) // stream method not used — bytes are already out
  })

  test("intercepted stderr routes through the patched write (capture preserved)", () => {
    const { stderr, chunks } = fakeStderr()
    const native = () => true // different function — stderr.write is a patch
    const syncWrites: string[] = []
    writeStderrDurably("captured diagnostic", {
      stderr,
      nativeWrite: native,
      writeSyncFn: ((_fd: number, text: string) => {
        syncWrites.push(text)
        return text.length
      }) as never,
    })
    expect(chunks).toEqual(["captured diagnostic"])
    expect(syncWrites).toEqual([]) // writeSync must NOT bypass the interceptor
  })

  test("fd-less stderr falls back to the stream write", () => {
    const { stderr, chunks } = fakeStderr()
    stderr.fd = undefined
    writeStderrDurably("no-fd diagnostic", { stderr, nativeWrite: stderr.write })
    expect(chunks).toEqual(["no-fd diagnostic"])
  })

  test("writeSync failure falls back to the stream write — never silently dropped", () => {
    const { stderr, chunks } = fakeStderr()
    writeStderrDurably("resilient diagnostic", {
      stderr,
      nativeWrite: stderr.write,
      writeSyncFn: (() => {
        throw new Error("EBADF")
      }) as never,
    })
    expect(chunks).toEqual(["resilient diagnostic"])
  })

  test("pristine path emits complete bytes to a real fd", () => {
    const path = `${tmpdir()}/silvery-stderr-durable-${process.pid}.txt`
    const fd = openSync(path, "w")
    try {
      const { stderr } = fakeStderr()
      stderr.fd = fd
      const payload = `\nsilvercode: ACP backend RSS watchdog tripped for claude\n  session: session 1\n`
      writeStderrDurably(payload, { stderr, nativeWrite: stderr.write })
      expect(readFileSync(path, "utf8")).toBe(payload)
    } finally {
      closeSync(fd)
      unlinkSync(path)
    }
  })
})
