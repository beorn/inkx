/**
 * CLI wrapper raw-mode ownership — prompts must route raw mode through the
 * Modes owner, never `stdin.setRawMode` directly.
 *
 * The failure this pins: a prompt that force-disables raw mode at cleanup
 * (`stdin.setRawMode(false)` unconditionally) cooks the stream out from
 * under a still-active host owner on the same stdin. With owner routing,
 * the per-stream refcount makes the prompt's release a termios no-op while
 * any other owner holds raw.
 *
 * Audit anchor: 2026-06-10 repo audit H2 (setRawMode outside the owner
 * system) → audit-delta 2026-07 wave-7 slice.
 */
import { describe, expect, test } from "vitest"
import { EventEmitter } from "node:events"
import { createModes } from "@silvery/ag-term"
import { withTextInput } from "../src/ui/wrappers/with-text-input"

interface FakeStdin extends EventEmitter {
  isTTY: boolean
  isRaw: boolean
  rawCalls: boolean[]
  setRawMode(on: boolean): FakeStdin
  setEncoding(enc: string): FakeStdin
  resume(): FakeStdin
  pause(): FakeStdin
  ref(): FakeStdin
  unref(): FakeStdin
  read(): string | null
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
  fake.setEncoding = () => fake
  fake.resume = () => fake
  fake.pause = () => fake
  fake.ref = () => fake
  fake.unref = () => fake
  fake.read = () => null
  return fake
}

const asStdin = (fake: FakeStdin) => fake as unknown as NodeJS.ReadStream

/** Non-TTY sink — keeps the wrappers from writing cursor/ANSI chrome. */
const fakeStdout = { write: () => true, isTTY: false } as unknown as NodeJS.WriteStream

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("withTextInput raw-mode ownership", () => {
  test("solo prompt: raw on once, cooked once after submit", async () => {
    const fake = createFakeStdin()
    const result = withTextInput("Name:", {
      inputStream: asStdin(fake),
      stream: fakeStdout,
    })
    await tick()
    fake.emit("data", Buffer.from("hi\r"))
    await expect(result).resolves.toBe("hi")
    expect(fake.rawCalls).toEqual([true, false])
    expect(fake.isRaw).toBe(false)
  })

  test("two-tenant race pin: prompt cleanup must NOT cook a stream a host owner still holds", async () => {
    const fake = createFakeStdin()
    const host = createModes({ write: () => {}, stdin: asStdin(fake) })
    host.rawMode(true)
    expect(fake.rawCalls).toEqual([true])

    const result = withTextInput("Name:", {
      inputStream: asStdin(fake),
      stream: fakeStdout,
    })
    await tick()
    fake.emit("data", Buffer.from("ok\r"))
    await expect(result).resolves.toBe("ok")

    // The prompt finished — but the host still owns raw mode.
    expect(fake.isRaw).toBe(true)
    expect(fake.rawCalls).toEqual([true])

    host[Symbol.dispose]()
    expect(fake.isRaw).toBe(false)
    expect(fake.rawCalls).toEqual([true, false])
  })

  test("non-TTY input stream: termios never touched", async () => {
    const fake = createFakeStdin({ isTTY: false })
    const result = withTextInput("Name:", {
      inputStream: asStdin(fake),
      stream: fakeStdout,
    })
    await tick()
    fake.emit("data", Buffer.from("x\r"))
    await expect(result).resolves.toBe("x")
    expect(fake.rawCalls).toEqual([])
  })

  test("abort path (Ctrl+C) still releases the prompt's raw hold", async () => {
    const fake = createFakeStdin()
    const result = withTextInput("Name:", {
      inputStream: asStdin(fake),
      stream: fakeStdout,
    })
    await tick()
    fake.emit("data", Buffer.from("\x03"))
    await expect(result).rejects.toThrow("User aborted")
    expect(fake.rawCalls).toEqual([true, false])
  })
})
