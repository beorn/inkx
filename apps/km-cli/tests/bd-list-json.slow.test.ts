/**
 * `km bd list --status X --json` JSON integrity — list-json-malformed.
 *
 * Before: piping a large JSON list to a downstream consumer (jq, less,
 * head -c) truncated the producer mid-string. `console.log` on Bun
 * returned before the multi-MB payload reached the pipe; once the
 * action callback returned and the script exited, the kernel discarded
 * the unflushed bytes. Downstream parsed `Unfinished string at EOF`.
 *
 * The fix routes JSON output through a Writable-stream-aware helper
 * that awaits the write callback before letting the action return.
 */

import { describe, test, expect } from "vitest"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { spawn } from "child_process"
import { Database } from "bun:sqlite"
import { runGenerator } from "@km/core"
import { createRepo } from "@km/storage"
import { Bead } from "@km/beads"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = join(__dirname, "..", "src", "index.ts")

/**
 * Seed a fresh repo with N real beads via the same factory the CLI
 * uses. Returns the repo dir. We close the repo before the CLI spawns
 * — the SQLite WAL flushes on `repo.close()`.
 */
function seedRepoWithBeads(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-list-json-"))
  mkdirSync(join(dir, ".km"), { recursive: true })
  writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n  roots:\n    - "@km"\n`)
  // Seed an entry file so the repo has a markdown anchor.
  writeFileSync(join(dir, "inbox.md"), "# Inbox\n\n")
  using repo = runGenerator(createRepo(dir, { loadFiles: true }))
  for (let i = 0; i < count; i++) {
    const filler = "filler content to push payload size past the pipe-buffer threshold ".repeat(8)
    const { node, children } = Bead.create(repo, `Bead ${i} — ${filler}`, {
      type: "task",
      priority: "P2",
      prefix: "km",
      customId: `scope/bead-${i}`,
      description: `Body paragraph for bead ${i}. ${filler}`,
    })
    const id = repo.addNode(null, node)
    for (const child of children) repo.addNode(id, child)
  }
  return dir
}

function seedRepoWithReadyScopeRows(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-ready-agent-"))
  mkdirSync(join(dir, ".km"), { recursive: true })
  mkdirSync(join(dir, "@agent"), { recursive: true })
  mkdirSync(join(dir, "@km"), { recursive: true })
  writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n  roots:\n    - "@km"\n    - "@agent"\n`)
  writeFileSync(join(dir, "inbox.md"), "# Inbox\n\n")
  writeFileSync(
    join(dir, "@agent", "3.md"),
    `---\nid: "@agent/3"\ncreated_at: 2026-01-01T00:00:00.000Z\n---\n\n# [ ] Agent slot work #P1 @issue\n`,
  )
  writeFileSync(
    join(dir, "@km", "default-work.md"),
    `---\nid: "@km/default-work"\ncreated_at: 2026-01-01T00:00:00.000Z\n---\n\n# [ ] Default km work #P1 @issue\n`,
  )

  using repo = runGenerator(createRepo(dir, { loadFiles: true }))
  void repo

  using db = new Database(join(dir, ".km", "state.db"))
  for (const row of [
    { content: "Agent slot work", fsPath: "@agent/3.md" },
    { content: "Default km work", fsPath: "@km/default-work.md" },
  ]) {
    db.run(
      `UPDATE nodes
       SET item = 1,
           list_marker = '-',
           task_marker = '[ ]',
           task_status = 'todo',
           content = ?
       WHERE fs_path = ?`,
      [row.content, row.fsPath],
    )
  }
  return dir
}

/** Spawn `km bd list --status open --json` and pipe stdout into jq. */
async function runListPipedToJq(repoDir: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const km = spawn("bun", [CLI_PATH, "bd", "list", "--status", "open", "--json"], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })
    const jq = spawn("jq", [". | length"], { stdio: ["pipe", "pipe", "pipe"] })

    // Manual pipe: km.stdout → jq.stdin. If writeJsonOut regresses (no
    // callback drain), the truncated payload reaches jq mid-token and
    // trips its parser with "Unfinished string at EOF".
    km.stdout!.pipe(jq.stdin!)

    let stdout = ""
    let stderr = ""
    jq.stdout.on("data", (b: Buffer) => (stdout += b.toString()))
    jq.stderr.on("data", (b: Buffer) => (stderr += b.toString()))
    km.stderr.on("data", (b: Buffer) => (stderr += b.toString()))

    jq.on("close", (code: number | null) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 })
    })
  })
}

describe("bd list --json piped to jq stays well-formed", () => {
  test("vault with 2000 beads emits parseable JSON through a pipe", async () => {
    const dir = seedRepoWithBeads(2000)
    const res = await runListPipedToJq(dir)
    expect(res.stderr).not.toMatch(/Unfinished string at EOF/)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(/^\d+$/)
    expect(Number.parseInt(res.stdout, 10)).toBeGreaterThan(0)
  }, 120_000)
})

/**
 * `bd ready` / `bd info` empty-default hint — ready-helpful-empty-message.
 * When the configured `beads.roots[0]` doesn't actually contain beads
 * (default fallback is `["beads"]` which is missing in fresh repos),
 * the bare commands silently returned 0. The fix surfaces a hint
 * pointing at `--all`, `@<board>`, and `bd config`.
 */
async function runKm(repoDir: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const km = spawn("bun", [CLI_PATH, ...args], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    })
    let stdout = ""
    let stderr = ""
    km.stdout!.on("data", (b: Buffer) => (stdout += b.toString()))
    km.stderr!.on("data", (b: Buffer) => (stderr += b.toString()))
    km.on("close", (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
}

describe("bd empty-default hint", () => {
  test("bare bd ready prints a helpful hint when default board is empty", async () => {
    // Empty repo with default config — beads.roots[0] = "beads" (missing).
    const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-empty-"))
    mkdirSync(join(dir, ".km"), { recursive: true })
    writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n`)
    writeFileSync(join(dir, "inbox.md"), "# Inbox\n\n")

    const res = await runKm(dir, ["bd", "ready"])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain("No ready issues found")
    expect(res.stdout).toContain("No issues in default board")
    expect(res.stdout).toContain('beads.roots[0] = "beads"')
    expect(res.stdout).toContain("km bd ready @km")
    expect(res.stdout).toContain("km bd ready --all")
    expect(res.stdout).toContain("km bd config get beads.roots")
  }, 60_000)

  test("bd ready @km suppresses the hint (explicit board override)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-empty2-"))
    mkdirSync(join(dir, ".km"), { recursive: true })
    writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n`)
    writeFileSync(join(dir, "inbox.md"), "# Inbox\n\n")

    const res = await runKm(dir, ["bd", "ready", "@km"])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain("No ready issues found")
    expect(res.stdout).not.toContain("No issues in default board")
  }, 60_000)

  test("bd ready @agent/ scopes to the agent board prefix", async () => {
    const dir = seedRepoWithReadyScopeRows()
    using db = new Database(join(dir, ".km", "state.db"), { readonly: true })
    const rows = db
      .query<{ fs_path: string; task_status: string | null; content: string }, []>(
        `SELECT fs_path, task_status, content
         FROM nodes
         WHERE fs_path IN ('@agent/3.md', '@km/default-work.md')
         ORDER BY fs_path`,
      )
      .all()
    expect(rows).toEqual([
      { fs_path: "@agent/3.md", task_status: "todo", content: "Agent slot work" },
      { fs_path: "@km/default-work.md", task_status: "todo", content: "Default km work" },
    ])

    const res = await runKm(dir, ["bd", "ready", "@agent/"])
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain("Agent slot work")
    expect(res.stdout).not.toContain("@km/default-work")
    expect(res.stdout).not.toContain("Default km work")
  }, 60_000)

  test("bd query with unknown attribute prints helpful error, not SQLiteError", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kmtest-bd-query-"))
    mkdirSync(join(dir, ".km"), { recursive: true })
    writeFileSync(join(dir, ".km", "config.yaml"), `beads:\n  prefix: km\n`)
    writeFileSync(join(dir, "inbox.md"), "# Inbox\n\n")

    const res = await runKm(dir, ["bd", "query", "scope=open"])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).not.toContain("SQLiteError")
    expect(res.stderr).not.toMatch(/at prepare/)
    expect(res.stderr).toContain("Unknown attribute: 'scope'")
    expect(res.stderr).toContain("Valid attributes")
    expect(res.stderr).toContain("status (= task_status)")
  }, 60_000)
})
