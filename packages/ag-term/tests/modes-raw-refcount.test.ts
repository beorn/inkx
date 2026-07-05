/**
 * Raw-mode refcount contract — multiple Modes owners on ONE stdin compose.
 *
 * Termios raw mode is process-global per stream. When a transient owner
 * (CLI prompt) overlaps a long-lived owner (host session), the transient
 * owner's dispose must NOT drop the stream back to cooked mode while the
 * host still holds it — that is the 2026-04-22 wasRaw race, one level up
 * (owner-vs-owner instead of tenant-vs-tenant). The owner arbitrates with a
 * per-stream reference count: only the 0→1 acquire and the 1→0 release
 * touch termios.
 *
 * Audit anchor: 2026-06-10 repo audit H2 → audit-delta 2026-07 wave-7 slice.
 */
import { describe, expect, test } from "vitest"
import { EventEmitter } from "node:events"
import { createModes } from "../src/runtime/devices/modes"

interface FakeStdin extends EventEmitter {
  isTTY: boolean
  isRaw: boolean
  rawCalls: boolean[]
  setRawMode(on: boolean): FakeStdin
}

function createFakeStdin(opts: { isTTY?: boolean } = {}): FakeStdin {
  const fake = new EventEmitter() as FakeStdin
  fake.isTTY = opts.isTTY ?? true
  fake.isRaw = false
  fake.rawCalls = []
  fake.setRawMode = (on: boolean) => {
    fake.rawCalls.push(on)
    fake.isRaw = on
    return fake
  }
  return fake
}

const asStdin = (fake: FakeStdin) => fake as unknown as NodeJS.ReadStream

const noopWrite = () => {}

describe("modes raw-mode refcount", () => {
  test("two owners on one stdin: inner release keeps raw; last release restores cooked", () => {
    const fake = createFakeStdin()
    const host = createModes({ write: noopWrite, stdin: asStdin(fake) })
    const prompt = createModes({ write: noopWrite, stdin: asStdin(fake) })

    host.rawMode(true)
    expect(fake.rawCalls).toEqual([true])

    // Overlapping acquire — already raw, no extra termios traffic.
    prompt.rawMode(true)
    expect(fake.rawCalls).toEqual([true])

    // Transient owner leaves first — host still holds, stream stays raw.
    prompt[Symbol.dispose]()
    expect(fake.isRaw).toBe(true)
    expect(fake.rawCalls).toEqual([true])

    // Last owner out restores cooked mode exactly once.
    host[Symbol.dispose]()
    expect(fake.isRaw).toBe(false)
    expect(fake.rawCalls).toEqual([true, false])
  })

  test("reverse teardown order: host releases first, prompt release restores", () => {
    const fake = createFakeStdin()
    const host = createModes({ write: noopWrite, stdin: asStdin(fake) })
    const prompt = createModes({ write: noopWrite, stdin: asStdin(fake) })

    host.rawMode(true)
    prompt.rawMode(true)
    host[Symbol.dispose]()
    expect(fake.isRaw).toBe(true)
    prompt[Symbol.dispose]()
    expect(fake.isRaw).toBe(false)
    expect(fake.rawCalls).toEqual([true, false])
  })

  test("single owner keeps the simple contract: on once, off once", () => {
    const fake = createFakeStdin()
    const modes = createModes({ write: noopWrite, stdin: asStdin(fake) })
    modes.rawMode(true)
    modes.rawMode(false)
    expect(fake.rawCalls).toEqual([true, false])
  })

  test("dispose is idempotent — second dispose emits no extra termios call", () => {
    const fake = createFakeStdin()
    const modes = createModes({ write: noopWrite, stdin: asStdin(fake) })
    modes.rawMode(true)
    modes[Symbol.dispose]()
    modes[Symbol.dispose]()
    expect(fake.rawCalls).toEqual([true, false])
  })

  test("enable() scope handle restores through the refcount", () => {
    const fake = createFakeStdin()
    const host = createModes({ write: noopWrite, stdin: asStdin(fake) })
    const prompt = createModes({ write: noopWrite, stdin: asStdin(fake) })

    host.rawMode(true)
    const handle = prompt.enable("rawMode")
    handle[Symbol.dispose]()
    // Host still holds — the scoped enable must not cook the stream.
    expect(fake.isRaw).toBe(true)
    host[Symbol.dispose]()
    expect(fake.isRaw).toBe(false)
  })

  test("non-TTY stream: refcount tracks but termios is never touched", () => {
    const fake = createFakeStdin({ isTTY: false })
    const modes = createModes({ write: noopWrite, stdin: asStdin(fake) })
    modes.rawMode(true)
    modes[Symbol.dispose]()
    expect(fake.rawCalls).toEqual([])
  })
})
