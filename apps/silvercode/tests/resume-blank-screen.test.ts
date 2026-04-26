/**
 * --resume: defensive replay — never throws, always lets App mount.
 *
 * Symptom: `silvercode --resume <bad-id>` produced a completely blank
 * terminal — no welcome card, no command box, no error message. Process
 * stayed alive but ignored keypresses.
 *
 * Root cause: `replaySessionFromDisk` threw on missing JSONL. The throw
 * happened inside `spawnSession()` BEFORE `factory()` was called, so
 * `session` was never created and `notifySessions()` never fired. The
 * controller swallowed the rejection via `void spawnSession().catch(...)`
 * — App.tsx's `sessions` array stayed empty, PaneGrid had nothing to
 * render, the screen rendered blank. Bead:
 * `km-silvercode.resume-blank-screen`.
 *
 * Fix: replaySessionFromDisk now NEVER throws. Missing file, unreadable
 * file, or replay error all surface as a store `error` event so the
 * user sees an actionable message in the card chrome — but the App
 * still mounts and the user can still type.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import type { SessionId } from "@km/agent-harness"
import { createSessionStore } from "@km/agent-harness"
import { afterAll, describe, expect, test } from "vitest"
import { claudeProjDir, replaySessionFromDisk } from "../src/resume.ts"

const TEST_CWD_BASE = join(tmpdir(), `silvercode-resume-blank-${Date.now()}`)
const createdProjDirs: string[] = []

afterAll(() => {
  for (const dir of createdProjDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }
})

function projDirFor(cwd: string): string {
  const dir = join(homedir(), ".claude", "projects", claudeProjDir(cwd))
  createdProjDirs.push(dir)
  return dir
}

function writeJsonl(cwd: string, sessionId: string, content: string): void {
  const dir = projDirFor(cwd)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.jsonl`), content)
}

describe("replaySessionFromDisk: defensive contract (never throws)", () => {
  test("missing JSONL → no throw; emits a structured error event into the store", () => {
    const cwd = `${TEST_CWD_BASE}-missing`
    const sessionId = "00000000-does-not-exist" as SessionId

    const store = createSessionStore()
    expect(() => replaySessionFromDisk(store, cwd, sessionId)).not.toThrow()

    // The store now has an actionable error message the UI can render —
    // the user sees something instead of a blank screen.
    const state = store.state.get()
    expect(state.lastError).toBeTruthy()
    expect(state.lastError).toContain("--resume")
    expect(state.lastError).toContain(sessionId)
    // Status is still "idle" — a missing JSONL doesn't disable input
    // (the live session is still spawn-able; the user just doesn't get
    // historical turns backfilled).
    expect(state.status).toBe("idle")
    // No messages were appended (empty transcript).
    expect(state.messages).toHaveLength(0)
  })

  test("empty JSONL file → no throw; status stays idle; no synthetic turn-end emitted", () => {
    const cwd = `${TEST_CWD_BASE}-empty`
    const sessionId = "00000000-empty" as SessionId
    writeJsonl(cwd, sessionId, "")

    const store = createSessionStore()
    expect(() => replaySessionFromDisk(store, cwd, sessionId)).not.toThrow()

    const state = store.state.get()
    expect(state.status).toBe("idle")
    expect(state.messages).toHaveLength(0)
    // No error — empty file is a valid (if useless) state, not a failure.
    expect(state.lastError).toBeNull()
  })

  test("corrupt JSON lines → no throw; parser-level errors land in the store but app continues", () => {
    const cwd = `${TEST_CWD_BASE}-corrupt`
    const sessionId = "00000000-corrupt" as SessionId
    // Mix valid + invalid lines. Invalid ones should surface as parser
    // error events (kind: "error") which the store stores in lastError.
    const lines = [
      "{not valid json",
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hello" },
        sessionId,
      }),
      "another bad line",
    ]
    writeJsonl(cwd, sessionId, `${lines.join("\n")}\n`)

    const store = createSessionStore()
    expect(() => replaySessionFromDisk(store, cwd, sessionId)).not.toThrow()

    const state = store.state.get()
    // The valid user line was consumed — at least one message appeared.
    expect(state.messages.length).toBeGreaterThan(0)
    // Parser surfaced a `parse error: ...` via store.apply({ kind: "error" })
    // which the session-store records in lastError.
    expect(state.lastError).toContain("parse error")
  })

  test("system-only transcript → no synthetic turn-end (avoids phantom empty bubble)", () => {
    const cwd = `${TEST_CWD_BASE}-system-only`
    const sessionId = "00000000-system-only" as SessionId
    // Only a session-init line — no user/assistant content. The previous
    // synthetic-turn-end logic would have fabricated a `resume-replay-end-*`
    // turn id and appended an empty assistant bubble. The fixed version
    // requires at least one user/assistant message before settling.
    const lines = [
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: sessionId,
        cwd,
        model: "claude-sonnet-4-6",
        permissionMode: "default",
      }),
    ]
    writeJsonl(cwd, sessionId, `${lines.join("\n")}\n`)

    const store = createSessionStore()
    replaySessionFromDisk(store, cwd, sessionId)

    const state = store.state.get()
    // Session-init flips status to idle (handled by session-store).
    expect(state.status).toBe("idle")
    // No phantom assistant bubble.
    expect(state.messages).toHaveLength(0)
  })
})
