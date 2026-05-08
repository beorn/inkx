/**
 * Read-only command invariants — bead `@km/storage/sync-architecture/read-only-command-invariants` (P0 #bug).
 *
 * Acceptance: read-style commands must not rewrite source markdown via rule
 * materialization or fs-writer side effects.
 *
 * Snapshot all .md file (hash + mtime) before and after each read-only command,
 * assert no source file changed.
 */

import { afterEach, describe, expect, test } from "vitest"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { glob } from "node:fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = join(__dirname, "..", "src", "index.ts")

const scratch: string[] = []

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()!
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

interface FileSnap {
  path: string
  hash: string
  mtimeMs: number
  size: number
}

async function snapshotMarkdown(root: string): Promise<Map<string, FileSnap>> {
  const map = new Map<string, FileSnap>()
  for await (const file of glob("**/*.md", { cwd: root })) {
    const abs = join(root, file)
    const buf = readFileSync(abs)
    const stat = statSync(abs)
    map.set(relative(root, abs), {
      path: relative(root, abs),
      hash: createHash("sha256").update(buf).digest("hex"),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    })
  }
  return map
}

function diffSnaps(
  before: Map<string, FileSnap>,
  after: Map<string, FileSnap>,
): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const [path, b] of before) {
    const a = after.get(path)
    if (!a) {
      removed.push(path)
      continue
    }
    if (a.hash !== b.hash) changed.push(path)
  }
  for (const path of after.keys()) {
    if (!before.has(path)) added.push(path)
  }
  return { changed, added, removed }
}

function freshVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-readonly-"))
  scratch.push(dir)
  mkdirSync(join(dir, ".km"), { recursive: true })
  mkdirSync(join(dir, "@agent"), { recursive: true })
  mkdirSync(join(dir, "@km", "storage"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:
  prefix: km
  roots: ["@km"]
  default_scope: "inbox"
`,
  )
  // Slot board file — bare H1 form (no `title:` frontmatter, no `[/]` marker,
  // no `^N` anchor). If a read-only command triggers materialization writeback,
  // the file would gain those tokens.
  writeFileSync(
    join(dir, "@agent", "3.md"),
    `# @agent/3 km.add:: . km.default:: true

![[sample-bead]]
`,
  )
  // Bead that mentions @agent/3 — picked up by the slot's km.add rule.
  writeFileSync(
    join(dir, "@km", "storage", "sample-bead.md"),
    `# Sample bead @km/storage #task @agent/3 #P0

Body content.
`,
  )
  // A second bead with no @agent assignment (unrelated WIP).
  writeFileSync(
    join(dir, "@km", "storage", "unrelated.md"),
    `# Unrelated @km/storage #task #P2

Body.
`,
  )
  return dir
}

/**
 * Vault matching real-world patterns: existing `title:` frontmatter, `[/]` task
 * marker on H1, `^N` block anchor, multiple H2 phase sections. If
 * normalization-on-load is wired into a read-only path, this layout exposes it
 * because there's nothing left to normalize — any new write is unwanted.
 */
function realisticVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-readonly-real-"))
  scratch.push(dir)
  mkdirSync(join(dir, ".km"), { recursive: true })
  mkdirSync(join(dir, "@agent"), { recursive: true })
  mkdirSync(join(dir, "@km", "storage"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:
  prefix: km
  roots: ["@km"]
  default_scope: "inbox"
`,
  )
  writeFileSync(
    join(dir, "@agent", "3.md"),
    `---
title: "@agent/3"
---

# [/] @agent/3 km.add:: . km.default:: true ^3

## [ ] Phase 1

![[bead-one]]

## [ ] Phase 2

![[bead-two]]
`,
  )
  writeFileSync(
    join(dir, "@km", "storage", "bead-one.md"),
    `---
title: bead-one
---

# [ ] First bead @km/storage #task @agent/3 #P1 ^one

Body.
`,
  )
  writeFileSync(
    join(dir, "@km", "storage", "bead-two.md"),
    `---
title: bead-two
---

# [ ] Second bead @km/storage #task @agent/3 #P1 ^two

Body.
`,
  )
  return dir
}

async function km(repo: string, args: string[]) {
  try {
    const result = await $`bun ${CLI_PATH} ${args}`
      .cwd(repo)
      .env({ ...process.env, KM_DIR: join(repo, ".km") })
      .quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    }
  } catch (error: unknown) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; exitCode?: number }
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.exitCode ?? 1,
    }
  }
}

describe("read-only commands never write source files (P0 #bug)", () => {
  test("`km bd query @agent/3` leaves all .md files byte-identical", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)
    expect(before.size).toBeGreaterThan(0)

    const result = await km(vault, ["bd", "query", "@agent/3"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff, JSON.stringify(diff, null, 2)).toEqual({
      changed: [],
      added: [],
      removed: [],
    })
  })

  test("`km bd list` leaves all .md files byte-identical", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)

    const result = await km(vault, ["bd", "list"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff).toEqual({ changed: [], added: [], removed: [] })
  })

  test("`km bd ready` leaves all .md files byte-identical", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)

    const result = await km(vault, ["bd", "ready"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff).toEqual({ changed: [], added: [], removed: [] })
  })

  test("`km bd show <id>` leaves all .md files byte-identical", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)

    const result = await km(vault, [
      "bd",
      "show",
      "@km/storage/sample-bead",
    ])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff).toEqual({ changed: [], added: [], removed: [] })
  })

  test("`km query <dsl>` leaves all .md files byte-identical", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)

    const result = await km(vault, ["query", "@agent/3"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff).toEqual({ changed: [], added: [], removed: [] })
  })

  test("realistic vault: `km bd query @agent/3` does not normalize H1 markers, frontmatter, or anchors", async () => {
    const vault = realisticVault()
    const before = await snapshotMarkdown(vault)

    const result = await km(vault, ["bd", "query", "@agent/3"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff, JSON.stringify(diff, null, 2)).toEqual({
      changed: [],
      added: [],
      removed: [],
    })
  })

  test("realistic vault: `km bd list --json` is byte-clean across multiple commands", async () => {
    const vault = realisticVault()
    const before = await snapshotMarkdown(vault)

    for (const args of [
      ["bd", "list"],
      ["bd", "list", "--json"],
      ["bd", "ready"],
      ["bd", "show", "@km/storage/bead-one"],
      ["bd", "query", "@agent/3"],
      ["query", "@agent/3"],
    ]) {
      const result = await km(vault, args)
      expect(result.exitCode, `${args.join(" ")}\n${result.stderr || result.stdout}`).toBe(0)
    }

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff).toEqual({ changed: [], added: [], removed: [] })
  })

  // Metatest: confirm the snapshot mechanism actually catches changes. If a
  // future regression makes a read-only command write to source, the diff
  // detector must catch it — this verifies the gate works.
  test("snapshot mechanism detects manual file edits (gate self-check)", async () => {
    const vault = freshVault()
    const before = await snapshotMarkdown(vault)

    // Manually mutate a file — simulating what a regressed materializer would do.
    writeFileSync(
      join(vault, "@agent", "3.md"),
      readFileSync(join(vault, "@agent", "3.md"), "utf-8") + "\n# regression marker\n",
    )

    const after = await snapshotMarkdown(vault)
    const diff = diffSnaps(before, after)
    expect(diff.changed).toContain("@agent/3.md")
  })
})
