import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { AgentEvent, SessionId } from "../src/events.ts"
import { createFileEventLog, createMemoryEventLog } from "../src/event-log.ts"

const SID = "test-session" as SessionId

function initEvent(sid: SessionId = SID): AgentEvent {
  return {
    kind: "session-init",
    sessionId: sid,
    cwd: "/work",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: ["Bash"],
    mcp_servers: [],
    ts: 1,
  }
}

function statusEvent(msg: string, sid: SessionId = SID): AgentEvent {
  return { kind: "status", sessionId: sid, status: msg, ts: 1 }
}

function readLines(path: string): string[] {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
}

describe("event-log — file backend", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "event-log-"))
  })
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  test("basic append writes valid JSONL", () => {
    const log = createFileEventLog(dir)
    log.append(initEvent())
    for (let i = 0; i < 5; i++) log.append(statusEvent(`msg-${i}`))
    log.close()

    const path = join(dir, `${SID}.jsonl`)
    const lines = readLines(path)
    expect(lines).toHaveLength(6)
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed[0]).toMatchObject({ kind: "session-init", sessionId: SID })
    expect(parsed[5]).toMatchObject({ kind: "status", status: "msg-4" })
  })

  test("legacy signature (dir, sessionId) still works", () => {
    const log = createFileEventLog(dir, SID)
    log.append(statusEvent("hi"))
    expect(readLines(join(dir, `${SID}.jsonl`))).toHaveLength(1)
    expect(log.sessionId()).toBe(SID)
  })

  test("rotation: once the file hits maxBytes, .jsonl.1 appears and live restarts", () => {
    const log = createFileEventLog(dir, { sessionId: SID, maxBytes: 256, keepGenerations: 3 })
    // Each status event serialized is roughly ~80 bytes; write enough to cross 256B several times.
    for (let i = 0; i < 20; i++) log.append(statusEvent(`event-${i}-xxxxxxxxxxxxxxxx`))
    log.close()

    const live = join(dir, `${SID}.jsonl`)
    const gen1 = join(dir, `${SID}.jsonl.1`)
    expect(existsSync(live)).toBe(true)
    expect(existsSync(gen1)).toBe(true)

    // Live file should be under the cap after its most recent rotation (i.e. we
    // didn't somehow keep appending indefinitely).
    const liveBytes = readFileSync(live, "utf8").length
    expect(liveBytes).toBeLessThan(256 + 200) // a small slack — last append can cross slightly.
  })

  test("trim: keepGenerations=2 means at most .jsonl, .jsonl.1, .jsonl.2 exist", () => {
    const log = createFileEventLog(dir, { sessionId: SID, maxBytes: 128, keepGenerations: 2 })
    // Lots of events to force many rotations.
    for (let i = 0; i < 60; i++) log.append(statusEvent(`pad-${i}-yyyyyyyyyyyyyyyyyyyyyyyy`))
    log.close()

    const names = readdirSync(dir).filter((n) => n.startsWith(`${SID}.jsonl`))
    expect(names.sort()).toEqual([`${SID}.jsonl`, `${SID}.jsonl.1`, `${SID}.jsonl.2`])
    expect(existsSync(join(dir, `${SID}.jsonl.3`))).toBe(false)
  })

  test("size() returns correct totals across live + generations", () => {
    const log = createFileEventLog(dir, { sessionId: SID, maxBytes: 200, keepGenerations: 3 })
    log.append(initEvent())
    for (let i = 0; i < 15; i++) log.append(statusEvent(`sized-${i}-zzzzzzzzzzzzzzzz`))

    const s = log.size()
    expect(s.current).toBeGreaterThan(0)
    expect(s.generations).toBeGreaterThanOrEqual(1)
    expect(s.totalBytes).toBeGreaterThanOrEqual(s.current)

    // totalBytes must equal disk reality.
    const files = readdirSync(dir).filter((n) => n.startsWith(`${SID}.jsonl`))
    let onDisk = 0
    for (const n of files) onDisk += readFileSync(join(dir, n)).byteLength
    expect(s.totalBytes).toBe(onDisk)
    log.close()
  })

  test("no events lost across multiple rotations (when generations fit)", () => {
    // With keepGenerations large enough to hold every rotation, concatenation of
    // live + all generations must contain every event ever written.
    // maxBytes=400 fits ~4 events per file; 16 events → 4 files total → 3 rotations.
    const log = createFileEventLog(dir, { sessionId: SID, maxBytes: 400, keepGenerations: 10 })
    const N = 16
    for (let i = 0; i < N; i++) log.append(statusEvent(`seq-${i.toString().padStart(3, "0")}-padpadpadpad`))
    log.close()

    // Walk generations from oldest → newest → live; concat in chronological order.
    const ordered: string[] = []
    for (let g = 10; g >= 1; g--) {
      const p = join(dir, `${SID}.jsonl.${g}`)
      if (existsSync(p)) ordered.push(...readLines(p))
    }
    ordered.push(...readLines(join(dir, `${SID}.jsonl`)))

    const seqs = ordered
      .map((l) => JSON.parse(l) as { kind: string; status?: string })
      .filter((e) => e.kind === "status")
      .map((e) => e.status as string)

    expect(seqs).toHaveLength(N)
    for (let i = 0; i < N; i++) {
      expect(seqs).toContain(`seq-${i.toString().padStart(3, "0")}-padpadpadpad`)
    }
    // Sanity: at least one rotation actually happened.
    expect(existsSync(join(dir, `${SID}.jsonl.1`))).toBe(true)
  })
})

describe("event-log — memory backend", () => {
  test("createMemoryEventLog still works unchanged", () => {
    const log = createMemoryEventLog()
    log.append(initEvent())
    log.append(statusEvent("hi"))
    expect(log.events()).toHaveLength(2)
    expect(log.sessionId()).toBe(SID)
    // size() is a no-op zero for memory — contract check.
    expect(log.size()).toEqual({ current: 0, generations: 0, totalBytes: 0 })
  })
})
