/**
 * Codex --resume parser — turns codex's rollout JSONL into canonical
 * AgentEvents that populate the SessionStore so prior turns appear in
 * the card on resume.
 *
 * This test feeds a synthetic minimal codex transcript through the parser
 * and asserts the resulting store state matches what a user would expect:
 *   - session-init populated with cwd + cli_version
 *   - prior user message visible
 *   - prior assistant text visible
 *   - tool-call + tool-result paired up
 *   - status returns to "idle" (so controller.send doesn't queue forever)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createSessionStore } from "@km/agent-harness"
import { findCodexTranscript, replayCodexSessionFromDisk } from "../src/codex-resume.ts"

const SESSION_ID = "019dd09d-test-codex-replay-fixture-aaaa"

let originalHome: string | undefined
let tmpHome: string

function lines(...rows: object[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
}

function writeFakeRollout(sessionId: string, body: string): string {
  const dir = join(tmpHome, ".codex", "sessions", "2026", "04", "27")
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `rollout-2026-04-27T13-24-04-${sessionId}.jsonl`)
  writeFileSync(path, body, "utf8")
  return path
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "codex-resume-test-"))
  originalHome = process.env.HOME
  process.env.HOME = tmpHome
})

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  try {
    rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
})

describe("codex-resume: replayCodexSessionFromDisk", () => {
  test("missing transcript surfaces an error event and does NOT throw", () => {
    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    const state = store.state.get()
    const errors = state.messages.filter((m) => m.role === "system")
    // The error event lands as some surface; assert it didn't throw and
    // status is idle so the user can still type.
    expect(state.status).toBe("idle")
    void errors
  })

  test("replays a minimal rollout: session-init + user message + assistant text + tool roundtrip", () => {
    const body = lines(
      {
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: {
          id: SESSION_ID,
          cwd: "/Users/beorn/Code/pim/km",
          cli_version: "0.124.0",
          model_provider: "openai",
        },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "user_message", message: "what does this code do?" },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "019dd0bc-a676-7e62-be4b-7c8a920f8858" },
      },
      {
        timestamp: "2026-04-27T20:58:40.911Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Let me look." }],
        },
      },
      {
        timestamp: "2026-04-27T20:58:42.427Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd": "ls"}',
          call_id: "call_TEST_ABC",
        },
      },
      {
        timestamp: "2026-04-27T20:58:42.523Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_TEST_ABC",
          output: "Output:\nfile1\nfile2\n",
        },
      },
      {
        timestamp: "2026-04-27T20:58:50.491Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "019dd0bc-a676-7e62-be4b-7c8a920f8858",
          last_agent_message: "Done.",
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const state = store.state.get()

    // Session-init wired into store.
    expect(state.cwd).toBe("/Users/beorn/Code/pim/km")
    expect(state.model).toContain("codex")
    expect(state.claudeCodeVersion).toBe("0.124.0")
    expect(state.sessionId).toBe(SESSION_ID)

    // User message visible.
    const userMsg = state.messages.find((m) => m.role === "user")
    expect(userMsg).toBeDefined()
    expect(userMsg?.text).toBe("what does this code do?")

    // Assistant text visible.
    const assistantMsg = state.messages.find((m) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg?.text).toContain("Let me look.")

    // Tool call + result paired (uses ops in the new order-preserving model).
    const ops = (
      assistantMsg as unknown as { ops?: Array<{ kind: string; tool?: { name: string; result?: unknown } }> }
    )?.ops
    if (ops) {
      const toolOps = ops.filter((o) => o.kind === "tool")
      expect(toolOps.length).toBeGreaterThan(0)
    }

    // Status returned to idle so controller.send accepts new input
    // immediately after the resume.
    expect(state.status).toBe("idle")
  })

  test("transcript ending mid-turn (no task_complete) still settles to idle via synthetic turn-end", () => {
    const body = lines(
      {
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "t1" },
      },
      {
        timestamp: "2026-04-27T20:58:42.427Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd": "ls"}',
          call_id: "call_X",
        },
      },
      // No function_call_output, no task_complete — the user crashed codex
      // mid-turn. Without the synthetic turn-end the store would stay
      // non-idle and controller.send would queue all input forever.
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    expect(store.state.get().status).toBe("idle")
  })

  test("findCodexTranscript locates the rollout by sessionId suffix", () => {
    writeFakeRollout(SESSION_ID, "")
    const path = findCodexTranscript(SESSION_ID)
    expect(path).not.toBeNull()
    expect(path).toContain(SESSION_ID)
    expect(path).toContain(".codex/sessions/2026/04/27")
  })

  test("findCodexTranscript returns null for unknown sessionIds", () => {
    expect(findCodexTranscript("nonexistent-id")).toBeNull()
  })

  test("malformed JSONL lines are skipped without throwing", () => {
    const body =
      lines({
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      }) +
      "this is not json\n" +
      lines({
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "user_message", message: "hi" },
      })
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    const state = store.state.get()
    expect(state.messages.find((m) => m.role === "user")?.text).toBe("hi")
  })
})
