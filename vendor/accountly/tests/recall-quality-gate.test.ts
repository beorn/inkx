/**
 * recall-quality-gate — end-to-end test for the index-time gate.
 *
 * Exercises the CLI by spawning a process with RECALL_SESSIONS_DIR +
 * RECALL_REJECTED_DIR pointed at a temp directory, plus a synthetic JSONL
 * containing stuck-loop content under a fake claude projects dir. Verifies
 * that the bad session lands in chats-rejected/ with a .reason sidecar
 * instead of chats/.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const RECALL_BIN = join(import.meta.dirname, "..", "src", "recall.ts")

let tmpRoot: string
let chatsDir: string
let rejectedDir: string
let claudeProjects: string
let projectDir: string

function writeStuckLoopJsonl(): string {
  const sessionId = "11111111-2222-3333-4444-555555555555"
  const ts = "2026-04-26T13:00:00.000Z"
  const line = (entry: object) => `${JSON.stringify(entry)}\n`
  let content = ""
  // First user message with the stuck-loop trigger.
  content += line({
    type: "user",
    sessionId,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: { role: "user", content: "do the vault reorg" },
  })
  // 40 verbatim assistant repeats — classic stuck-loop signature.
  for (let i = 0; i < 40; i++) {
    content += line({
      type: "assistant",
      sessionId,
      timestamp: ts,
      cwd: "/Users/test/project",
      message: { role: "assistant", content: "so back to the vault reorg!" },
    })
  }
  const path = join(projectDir, `${sessionId}.jsonl`)
  writeFileSync(path, content, "utf-8")
  return path
}

function writeCleanJsonl(): string {
  const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  const ts = "2026-04-26T14:00:00.000Z"
  const line = (entry: object) => `${JSON.stringify(entry)}\n`
  let content = ""
  content += line({
    type: "user",
    sessionId,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: { role: "user", content: "investigate the silvery rendering pipeline regression" },
  })
  content += line({
    type: "assistant",
    sessionId,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: {
      role: "assistant",
      content:
        "I'll investigate this regression. The silvery rendering pipeline has dirty flag tracking that should detect when sticky children need redrawing. Let me trace through the compose phase to find where the flag is being cleared prematurely. The fix is likely in compose.ts where we need to defer clearing until after sticky children have been recomposed.",
    },
  })
  content += line({
    type: "user",
    sessionId,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: { role: "user", content: "please write a STRICT test first" },
  })
  content += line({
    type: "assistant",
    sessionId,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: {
      role: "assistant",
      content:
        "The test is now at vendor/silvery/tests/pipeline/sticky-scroll.test.ts. It sets up a column with a sticky header, scrolls past the natural sticky position, and asserts that the sticky region remains visible after the scroll completes. Currently the test fails as expected with the message about sticky region cleared during scroll. After applying the fix in compose.ts, all 47 STRICT pipeline tests pass.",
    },
  })
  const path = join(projectDir, `${sessionId}.jsonl`)
  writeFileSync(path, content, "utf-8")
  return path
}

function runRecallExport(jsonlPath: string): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("bun", [RECALL_BIN, "export", jsonlPath], {
    env: {
      ...process.env,
      HOME: tmpRoot,
      RECALL_SESSIONS_DIR: chatsDir,
      RECALL_REJECTED_DIR: rejectedDir,
      // CLAUDE_PROJECTS_DIR isn't an env var in recall.ts — it's derived from
      // HOME — so HOME=tmpRoot already routes the security check to our
      // tmpRoot/.claude/projects/ tree.
    },
    encoding: "utf-8",
    timeout: 30_000,
  })
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "recall-qgate-"))
  chatsDir = join(tmpRoot, "chats")
  rejectedDir = join(tmpRoot, "chats-rejected")
  claudeProjects = join(tmpRoot, ".claude", "projects")
  projectDir = join(claudeProjects, "test-project")
  mkdirSync(projectDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function writeMixedSessionJsonl(): string {
  // Simulate the cross-session-concat upstream bug: a JSONL whose primary
  // sessionId is X, but contains entries from session Y interleaved. The
  // exporter must filter to X-only.
  const sessionA = "11111111-1111-1111-1111-111111111111"
  const sessionB = "22222222-2222-2222-2222-222222222222"
  const ts = "2026-04-26T15:00:00.000Z"
  const line = (entry: object) => `${JSON.stringify(entry)}\n`
  let content = ""
  // First entry establishes sessionA as the file's primary.
  content += line({
    type: "user",
    sessionId: sessionA,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: { role: "user", content: "investigate the silvery rendering pipeline regression" },
  })
  content += line({
    type: "assistant",
    sessionId: sessionA,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: {
      role: "assistant",
      content:
        "I'll investigate this regression. The silvery rendering pipeline has dirty flag tracking that should detect when sticky children need redrawing. Let me trace through the compose phase to find where the flag is being cleared prematurely.",
    },
  })
  // Cross-session contamination — must be dropped.
  content += line({
    type: "assistant",
    sessionId: sessionB,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: {
      role: "assistant",
      content: "DELEI'S LUNCHMONEY ARTHUR'S GMAIL — fragment from unrelated session that must NOT appear",
    },
  })
  content += line({
    type: "user",
    sessionId: sessionA,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: { role: "user", content: "please write a STRICT test first" },
  })
  content += line({
    type: "assistant",
    sessionId: sessionA,
    timestamp: ts,
    cwd: "/Users/test/project",
    message: {
      role: "assistant",
      content:
        "The test is at vendor/silvery/tests/pipeline/sticky-scroll.test.ts. After applying the fix in compose.ts, all 47 STRICT pipeline tests pass. The change is small — we move the clearDirtyFlags call to after composeStickyChildren instead of before.",
    },
  })
  const path = join(projectDir, `${sessionA}.jsonl`)
  writeFileSync(path, content, "utf-8")
  return path
}

describe("recall export — index-time quality gate", () => {
  test("stuck-loop session is rejected to chats-rejected/ with .reason sidecar", () => {
    const jsonlPath = writeStuckLoopJsonl()
    const r = runRecallExport(jsonlPath)
    expect(r.status).toBe(0)

    // No file in chats/
    const chatsContents = existsSync(chatsDir) ? readdirSync(chatsDir) : []
    expect(chatsContents.filter((f) => f.endsWith(".md"))).toHaveLength(0)

    // One file in chats-rejected/ with a sidecar
    expect(existsSync(rejectedDir)).toBe(true)
    const rejectedFiles = readdirSync(rejectedDir)
    const md = rejectedFiles.filter((f) => f.endsWith(".md"))
    const reasons = rejectedFiles.filter((f) => f.endsWith(".reason"))
    expect(md).toHaveLength(1)
    expect(reasons).toHaveLength(1)

    // Sidecar carries diagnostic JSON
    const sidecar = JSON.parse(readFileSync(join(rejectedDir, reasons[0]!), "utf-8")) as {
      reason: string
      sessionId: string
      signals: Record<string, number>
    }
    expect(sidecar.reason).toMatch(/^stuck-loop:/)
    expect(sidecar.sessionId).toBe("11111111-2222-3333-4444-555555555555")
    expect(typeof sidecar.signals.maxLineRepeat).toBe("number")

    // stderr surfaces the rejection so the user sees what happened
    expect(r.stderr).toMatch(/rejected.*stuck-loop/)
  })

  test("cross-session contamination is filtered (root cause fix in renderSessionMarkdown)", () => {
    const jsonlPath = writeMixedSessionJsonl()
    const r = runRecallExport(jsonlPath)
    expect(r.status).toBe(0)

    // Should land in chats/, not chats-rejected/, because filtering removes
    // the bad fragment before quality analysis.
    const chatsContents = existsSync(chatsDir) ? readdirSync(chatsDir) : []
    const md = chatsContents.filter((f) => f.endsWith(".md"))
    expect(md).toHaveLength(1)

    const exported = readFileSync(join(chatsDir, md[0]!), "utf-8")
    // The contamination from sessionB MUST NOT appear.
    expect(exported).not.toContain("DELEI'S LUNCHMONEY")
    expect(exported).not.toContain("fragment from unrelated session")
    // The legitimate sessionA content MUST still appear.
    expect(exported).toContain("silvery rendering pipeline")
    expect(exported).toContain("STRICT pipeline tests pass")
  })

  test("clean session lands in chats/ with no rejection sidecar", () => {
    const jsonlPath = writeCleanJsonl()
    const r = runRecallExport(jsonlPath)
    expect(r.status).toBe(0)

    const chatsContents = existsSync(chatsDir) ? readdirSync(chatsDir) : []
    expect(chatsContents.filter((f) => f.endsWith(".md"))).toHaveLength(1)

    const rejectedContents = existsSync(rejectedDir) ? readdirSync(rejectedDir) : []
    expect(rejectedContents).toHaveLength(0)

    expect(r.stderr).toMatch(/exported:/)
  })
})
