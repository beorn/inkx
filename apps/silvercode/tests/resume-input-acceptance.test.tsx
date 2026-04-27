/**
 * --resume input acceptance — silvercode resume hangs and the command box
 * doesn't accept input.
 *
 * Root cause:
 *   replaySessionFromDisk feeds JSONL events into SessionStore. JSONL
 *   contains `assistant` / `user` / `tool_result` entries — but NOT the
 *   `result` event that emits `session-end`, and NOT the `message_delta`
 *   that emits `turn-end`. The session-store applies tool-result → status
 *   = "thinking" and assistant-message → no status change. After replay,
 *   status is stuck at "thinking" or "tool-running".
 *
 *   Then controller.send() checks status — non-idle → message goes into
 *   queue buffer. tryFlush() only fires on turn-end events. Without a
 *   live turn ever finishing, the queue never drains and the user's
 *   typed messages disappear into a black hole.
 *
 * Fix: replaySessionFromDisk forces status back to "idle" at the end. The
 * historical transcript represents prior turns that have already finished.
 * The live subprocess will emit fresh turn-start/turn-end events when the
 * user types something.
 *
 * Bead: km-silvercode.resume-hangs-no-input
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import type { SessionId } from "@km/agent-harness"
import { createSessionStore } from "@km/agent-harness"
import { afterAll, describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { claudeProjDir, replaySessionFromDisk } from "../src/resume.ts"
import { createFakeSession } from "../src/test/fake-session.ts"

const SESSION = `00000000-resume-test-${process.pid}` as SessionId

// Use a randomised cwd path so the projdir hash is unique to this test run
// — we can't redirect homedir() (Node caches it), so we write into the real
// ~/.claude/projects/ but in a uniquely-named subdir that nothing else uses.
const TEST_CWD_BASE = join(tmpdir(), `silvercode-resume-test-${Date.now()}`)

// Cleanup tracking: collect every projdir we wrote to so afterAll can wipe it.
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

/**
 * Write a fake JSONL transcript that ends mid-turn — the last events are a
 * tool_result and an assistant text block. This mirrors the shape of a real
 * Claude Code on-disk transcript: there is no `result` event because that
 * only fires when claude exits; an active session's transcript ALWAYS ends
 * mid-flow (the last message is whatever was last persisted).
 */
function writeFakeTranscript(cwd: string, sessionId: string): void {
  const dir = join(homedir(), ".claude", "projects", claudeProjDir(cwd))
  mkdirSync(dir, { recursive: true })
  createdProjDirs.push(dir)
  const lines = [
    // Initial user message
    JSON.stringify({
      type: "user",
      uuid: "u1",
      message: { role: "user", content: "hello" },
      sessionId,
    }),
    // Assistant tool use
    JSON.stringify({
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tool-1", name: "Read", input: { path: "/tmp/x" } }],
      },
      sessionId,
    }),
    // Tool result — sets status to "thinking" in session-store. This is
    // the trap: tool-result is the LAST status-changing event in many
    // real transcripts because the next assistant message with the
    // analysis is `assistant text` (which doesn't change status).
    JSON.stringify({
      type: "user",
      uuid: "u2",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }] },
      sessionId,
    }),
    // Final assistant text — does NOT change status (assistant-message
    // handler only updates blocks, not status).
    JSON.stringify({
      type: "assistant",
      message: {
        id: "msg-2",
        role: "assistant",
        content: [{ type: "text", text: "Done." }],
      },
      sessionId,
    }),
  ]
  writeFileSync(join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`)
}

describe("--resume: input is accepted (status flips back to idle after replay)", () => {
  test("replaySessionFromDisk leaves status === 'idle' even when transcript ends mid-turn", () => {
    const cwd = `${TEST_CWD_BASE}-1`
    writeFakeTranscript(cwd, SESSION)

    const store = createSessionStore()
    replaySessionFromDisk(store, cwd, SESSION)

    // The transcript replays successfully — messages are populated.
    const state = store.state.get()
    expect(state.messages.length).toBeGreaterThan(0)

    // Critical invariant: after replay, status MUST be "idle". The
    // historical transcript represents prior turns that have already
    // finished from the user's perspective. A non-idle status here causes
    // controller.send() to buffer all input forever (the live turn-end
    // that would flush the queue never arrives).
    expect(state.status).toBe("idle")
  })

  test("controller.send goes through to the session immediately after a resume replay", async () => {
    const cwd = `${TEST_CWD_BASE}-2`
    writeFakeTranscript(cwd, SESSION)

    const fake = createFakeSession({ sessionId: SESSION })
    const controller = createSilvercodeController({
      cwd,
      bare: true,
      // resume: triggers replaySessionFromDisk inside spawnSession.
      resume: SESSION,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("test")

    // After resume replay, the user types something. The send() must
    // reach the agent immediately — it must not get stuck in the queue
    // because of a stale "thinking" status from the replayed transcript.
    controller.send(handle.id, "what's up?")

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("what's up?")
    expect(controller.queuedText(handle.id)).toBe("")

    controller.closeAll()
  })
})
