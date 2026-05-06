/**
 * Unit tests for `km open <id>` — universal "open in editor" verb.
 *
 * These tests pin the two pure helpers `pickEditor` and
 * `resolveNodeFilePath`, plus the spawn injection seam `runEditor`.
 * The action handler is a thin wrapper over them; covering them
 * covers the round-trip.
 *
 * No commander wiring or process.exit invocations are exercised
 * directly — those are integration concerns and would require
 * booting program.ts.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runGenerator } from "@km/core"
import { createRepo, type Repo } from "@km/storage"
import { pickEditor, resolveNodeFilePath, runEditor } from "../src/commands/open.ts"

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  scratch.length = 0
})

function freshRepo(): { dir: string; repo: Repo } {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-open-"))
  scratch.push(dir)
  const repo = runGenerator(createRepo(dir, { loadFiles: false }))
  return { dir, repo }
}

describe("pickEditor — env precedence", () => {
  test("KM_EDITOR wins over VISUAL and EDITOR", () => {
    expect(pickEditor({ KM_EDITOR: "code", VISUAL: "vim", EDITOR: "nano" })).toBe("code")
  })

  test("VISUAL wins over EDITOR when KM_EDITOR is unset", () => {
    expect(pickEditor({ VISUAL: "vim", EDITOR: "nano" })).toBe("vim")
  })

  test("EDITOR is used when KM_EDITOR + VISUAL are unset", () => {
    expect(pickEditor({ EDITOR: "nano" })).toBe("nano")
  })

  test("falls back to nano when nothing is set", () => {
    expect(pickEditor({})).toBe("nano")
  })

  test("treats whitespace-only env vars as unset", () => {
    expect(pickEditor({ KM_EDITOR: "   ", EDITOR: "vim" })).toBe("vim")
  })

  test("empty env var is treated as unset (POSIX convention)", () => {
    expect(pickEditor({ EDITOR: "" })).toBe("nano")
  })
})

describe("resolveNodeFilePath — fs_path → absolute", () => {
  test("resolves a node with a direct .md fs_path", () => {
    const { dir, repo } = freshRepo()
    // Create the file on disk first so existsSync passes.
    const rel = "@km/cli/foo.md"
    mkdirSync(join(dir, "@km/cli"), { recursive: true })
    writeFileSync(join(dir, rel), "# foo\n")

    const id = repo.addNode(null, { type: "p", content: "foo", fs_path: rel })
    const node = repo.getNode(id)
    expect(node).toBeTruthy()

    const abs = resolveNodeFilePath(repo, dir, node!)
    expect(abs).toBe(join(dir, rel))
  })

  test("appends .md suffix when fs_path drops it", () => {
    const { dir, repo } = freshRepo()
    const rel = "@km/cli/bar.md"
    mkdirSync(join(dir, "@km/cli"), { recursive: true })
    writeFileSync(join(dir, rel), "# bar\n")

    // Note: fs_path is stored without `.md` here — exercises the
    // fallback candidate ladder (try-as-is, then with `.md`).
    const id = repo.addNode(null, { type: "p", content: "bar", fs_path: "@km/cli/bar" })
    const node = repo.getNode(id)
    expect(node).toBeTruthy()

    const abs = resolveNodeFilePath(repo, dir, node!)
    expect(abs).toBe(join(dir, rel))
  })

  test("walks up to the nearest ancestor with an on-disk file", () => {
    const { dir, repo } = freshRepo()
    const rel = "@km/cli/parent.md"
    mkdirSync(join(dir, "@km/cli"), { recursive: true })
    writeFileSync(join(dir, rel), "# parent\n\n## child\n")

    const parentId = repo.addNode(null, { type: "p", content: "parent", fs_path: rel })
    // Child has no fs_path — embedded in parent's file.
    const childId = repo.addNode(parentId, { type: "p", content: "child" })
    const child = repo.getNode(childId)
    expect(child).toBeTruthy()

    const abs = resolveNodeFilePath(repo, dir, child!)
    expect(abs).toBe(join(dir, rel))
  })

  test("returns null when no ancestor has an on-disk file", () => {
    const { dir, repo } = freshRepo()
    // Node has fs_path but the file does NOT exist on disk — and no parent has one either.
    const id = repo.addNode(null, { type: "p", content: "ghost", fs_path: "@km/cli/missing.md" })
    const node = repo.getNode(id)
    expect(node).toBeTruthy()

    expect(resolveNodeFilePath(repo, dir, node!)).toBeNull()
  })

  test("handles absolute fs_path values without re-joining them", () => {
    const { dir, repo } = freshRepo()
    const rel = "@km/cli/abs.md"
    mkdirSync(join(dir, "@km/cli"), { recursive: true })
    const abs = join(dir, rel)
    writeFileSync(abs, "# abs\n")

    const id = repo.addNode(null, { type: "p", content: "abs", fs_path: abs })
    const node = repo.getNode(id)
    expect(node).toBeTruthy()

    expect(resolveNodeFilePath(repo, dir, node!)).toBe(abs)
  })
})

describe("runEditor — spawn injection seam", () => {
  test("forwards editor exit code", () => {
    const fakeSpawn = (() => {
      return { status: 0, stdout: null, stderr: null, signal: null, pid: 0, output: [] as string[] }
    }) as unknown as typeof import("node:child_process").spawnSync
    const { status, error } = runEditor("dummy", "/tmp/whatever.md", fakeSpawn)
    expect(error).toBeUndefined()
    expect(status).toBe(0)
  })

  test("propagates editor non-zero exit", () => {
    const fakeSpawn = (() => {
      return { status: 137, stdout: null, stderr: null, signal: null, pid: 0, output: [] as string[] }
    }) as unknown as typeof import("node:child_process").spawnSync
    const { status, error } = runEditor("dummy", "/tmp/whatever.md", fakeSpawn)
    expect(error).toBeUndefined()
    expect(status).toBe(137)
  })

  test("surfaces spawn error (e.g. ENOENT for missing editor)", () => {
    const enoent = new Error("spawn dummy ENOENT") as Error & { code?: string }
    enoent.code = "ENOENT"
    const fakeSpawn = (() => {
      return {
        status: null,
        stdout: null,
        stderr: null,
        signal: null,
        pid: 0,
        output: [] as string[],
        error: enoent,
      }
    }) as unknown as typeof import("node:child_process").spawnSync
    const { status, error } = runEditor("dummy", "/tmp/whatever.md", fakeSpawn)
    expect(error).toBe(enoent)
    expect(status).toBeNull()
  })

  test("invokes the editor with the file path as a single argument", () => {
    let captured: { cmd?: string; args?: readonly string[]; opts?: unknown } = {}
    const fakeSpawn = ((cmd: string, args: readonly string[], opts: unknown) => {
      captured = { cmd, args, opts }
      return { status: 0, stdout: null, stderr: null, signal: null, pid: 0, output: [] as string[] }
    }) as unknown as typeof import("node:child_process").spawnSync

    runEditor("vim", "/tmp/some/file.md", fakeSpawn)
    expect(captured.cmd).toBe("vim")
    expect(captured.args).toEqual(["/tmp/some/file.md"])
    // Inherits stdio so the editor takes over the terminal.
    expect((captured.opts as { stdio?: string }).stdio).toBe("inherit")
    // Never use a shell — protects against arg-splitting on filenames with spaces.
    expect((captured.opts as { shell?: boolean }).shell).toBe(false)
  })
})
