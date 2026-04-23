/**
 * Round-trip test for .claude/lib/isolate.sh — the APFS cp -c clone mechanism
 * that powers `isolation: "worktree"` for concurrent Claude Code agents.
 *
 * Scenario:
 *   1. Build a superproject with a submodule.
 *   2. Run isolate.sh to clone it.
 *   3. Modify the clone's submodule.
 *   4. Verify the source's submodule is untouched.
 *   5. Commit in the clone's submodule — HEADs must diverge.
 *
 * Marked .slow because it shells out and does real filesystem work.
 *
 * Tracking bead: km-infra.worktree-isolation-apfs.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { $ } from "bun"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const ISOLATE = join(HERE, "..", ".claude", "lib", "isolate.sh")

async function initRepo(path: string): Promise<void> {
  mkdirSync(path, { recursive: true })
  await $`cd ${path} && git init -q -b main && git config user.email t@t && git config user.name t`.quiet()
}

async function commitAll(path: string, message: string): Promise<void> {
  await $`cd ${path} && git add -A && git commit -qm ${message}`.quiet()
}

let sandbox: string

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "isolate-iso-"))
})

afterEach(() => {
  if (sandbox && existsSync(sandbox)) {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

describe("isolate.sh — cp -c submodule isolation", () => {
  test("clone modifications don't leak to source; submodule HEADs diverge", async () => {
    const subRepo = join(sandbox, "sub")
    const mainRepo = join(sandbox, "main")
    const clone = join(sandbox, "clone")

    // Upstream submodule
    await initRepo(subRepo)
    writeFileSync(join(subRepo, "file.txt"), "original\n")
    await commitAll(subRepo, "sub-init")

    // Superproject + submodule
    await initRepo(mainRepo)
    writeFileSync(join(mainRepo, "README.md"), "main\n")
    await commitAll(mainRepo, "main-init")
    await $`cd ${mainRepo} && git -c protocol.file.allow=always submodule add ${subRepo} vendor/sub`.quiet()
    await commitAll(mainRepo, "add-sub")

    const mainSubFile = join(mainRepo, "vendor/sub/file.txt")
    expect(readFileSync(mainSubFile, "utf8")).toBe("original\n")

    // Clone
    await $`bash ${ISOLATE} ${mainRepo} ${clone}`.quiet()

    const cloneSubFile = join(clone, "vendor/sub/file.txt")
    expect(existsSync(cloneSubFile)).toBe(true)
    expect(readFileSync(cloneSubFile, "utf8")).toBe("original\n")

    // Mutate the clone's submodule
    writeFileSync(cloneSubFile, "modified-in-clone\n")
    expect(readFileSync(cloneSubFile, "utf8")).toBe("modified-in-clone\n")

    // Source's submodule must be untouched — the isolation invariant
    expect(readFileSync(mainSubFile, "utf8")).toBe("original\n")

    // Commit in the clone's submodule — HEAD must diverge from source
    const cloneSubDir = dirname(cloneSubFile)
    await $`cd ${cloneSubDir} && git add -A && git -c user.email=t@t -c user.name=t commit -qm clone-change`.quiet()

    const cloneHead = (await $`cd ${cloneSubDir} && git rev-parse HEAD`.quiet()).stdout.toString().trim()
    const sourceHead = (
      await $`cd ${join(mainRepo, "vendor/sub")} && git rev-parse HEAD`.quiet()
    ).stdout.toString().trim()

    expect(cloneHead).not.toBe(sourceHead)
    expect(cloneHead).toHaveLength(40)
    expect(sourceHead).toHaveLength(40)
  }, 60_000)

  test("clone starts clean — source's uncommitted WIP is wiped to HEAD", async () => {
    const source = join(sandbox, "main")
    const clone = join(sandbox, "clone")

    await initRepo(source)
    writeFileSync(join(source, "tracked.txt"), "committed\n")
    await commitAll(source, "init")

    // Simulate user WIP in the source BEFORE cloning
    writeFileSync(join(source, "tracked.txt"), "DIRTY-wip\n")
    writeFileSync(join(source, "staged.txt"), "staged-new\n")
    await $`cd ${source} && git add staged.txt`.quiet()
    writeFileSync(join(source, "untracked.txt"), "untracked-new\n")
    // Simulate a nested agent clone in the source's .claude/worktrees/
    mkdirSync(join(source, ".claude/worktrees/agent-prev"), { recursive: true })
    writeFileSync(join(source, ".claude/worktrees/agent-prev/marker"), "cascade\n")

    await $`bash ${ISOLATE} ${source} ${clone}`.quiet()

    // Tracked modification — should be reset to HEAD content
    expect(readFileSync(join(clone, "tracked.txt"), "utf8")).toBe("committed\n")
    // Staged new file — should be gone (git reset --hard + clean)
    expect(existsSync(join(clone, "staged.txt"))).toBe(false)
    // Untracked file — should be gone (git clean)
    expect(existsSync(join(clone, "untracked.txt"))).toBe(false)
    // Cascade — no nested worktrees carried over
    expect(existsSync(join(clone, ".claude/worktrees/agent-prev"))).toBe(false)

    // Source still has its WIP (clone didn't mutate it)
    expect(readFileSync(join(source, "tracked.txt"), "utf8")).toBe("DIRTY-wip\n")
    expect(existsSync(join(source, ".claude/worktrees/agent-prev/marker"))).toBe(true)
  }, 60_000)

  test("refuses to overwrite existing target", async () => {
    const source = join(sandbox, "src")
    const target = join(sandbox, "existing")
    await initRepo(source)
    mkdirSync(target)

    const proc = Bun.spawnSync(["bash", ISOLATE, source, target])
    expect(proc.exitCode).not.toBe(0)
    expect(proc.stderr.toString()).toContain("target already exists")
  })

  test("refuses missing source", async () => {
    const source = join(sandbox, "nonexistent")
    const target = join(sandbox, "clone")

    const proc = Bun.spawnSync(["bash", ISOLATE, source, target])
    expect(proc.exitCode).not.toBe(0)
    expect(proc.stderr.toString()).toContain("source does not exist")
  })
})
