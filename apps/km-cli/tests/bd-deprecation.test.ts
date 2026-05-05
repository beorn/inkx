/**
 * Pure-planner unit tests for bd's once-per-session deprecation nudge.
 *
 * The deprecation module owns: print-once gating, TTY/JSON suppression,
 * KM_QUIET_DEPRECATION env-var honour. Tests pin the suppression rules
 * without booting the silvery import chain.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: bd is an alias for `km task`.
 * The shim still owns lifecycle semantics (close/drop with --reason,
 * path-form materialization) that `km task` doesn't yet carry — so bd
 * isn't a pure argv translator, but the *intent* is to deprecate. The
 * nudge tells users where the surface is moving.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { _resetBdDeprecationForTests, printBdDeprecationOnce } from "../src/commands/bd-deprecation.ts"

let writes: string[] = []
let originalIsTTY: boolean | undefined
let originalArgv: string[]
let originalEnv: string | undefined

beforeEach(() => {
  writes = []
  vi.spyOn(process.stderr, "write").mockImplementation(((data: string | Buffer) => {
    writes.push(typeof data === "string" ? data : data.toString())
    return true
  }) as never)
  originalIsTTY = process.stderr.isTTY
  originalArgv = process.argv
  originalEnv = process.env.KM_QUIET_DEPRECATION
  process.stderr.isTTY = true
  process.argv = ["bun", "km-cli", "bd", "ready"]
  delete process.env.KM_QUIET_DEPRECATION
  _resetBdDeprecationForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY, writable: true, configurable: true })
  process.argv = originalArgv
  if (originalEnv === undefined) delete process.env.KM_QUIET_DEPRECATION
  else process.env.KM_QUIET_DEPRECATION = originalEnv
})

describe("printBdDeprecationOnce", () => {
  test("prints once on first call, suppresses on subsequent calls", () => {
    printBdDeprecationOnce()
    expect(writes.length).toBe(1)
    expect(writes[0]).toContain("`bd` is an alias for `km task`")
    expect(writes[0]).toContain("v2")

    printBdDeprecationOnce()
    printBdDeprecationOnce()
    // Still only the first emission.
    expect(writes.length).toBe(1)
  })

  test("suppressed when KM_QUIET_DEPRECATION=1", () => {
    process.env.KM_QUIET_DEPRECATION = "1"
    printBdDeprecationOnce()
    expect(writes.length).toBe(0)
  })

  test("suppressed when stderr is not a tty", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, writable: true, configurable: true })
    printBdDeprecationOnce()
    expect(writes.length).toBe(0)
  })

  test("suppressed when --json appears in argv", () => {
    process.argv = ["bun", "km-cli", "bd", "ready", "--json"]
    printBdDeprecationOnce()
    expect(writes.length).toBe(0)
  })

  test("nudge contains the silence-toggle hint", () => {
    printBdDeprecationOnce()
    expect(writes[0]).toContain("KM_QUIET_DEPRECATION=1 to silence")
  })

  test("nudge writes to stderr (not stdout) — JSON consumers stay clean", () => {
    // Spy on stdout to confirm nothing leaks.
    const stdoutWrites: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation(((data: string | Buffer) => {
      stdoutWrites.push(typeof data === "string" ? data : data.toString())
      return true
    }) as never)

    printBdDeprecationOnce()
    expect(writes.length).toBe(1)
    expect(stdoutWrites.length).toBe(0)
  })
})
