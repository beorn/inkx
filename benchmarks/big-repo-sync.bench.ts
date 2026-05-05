/**
 * Big-repo sync baseline.
 *
 * Approximates a real km vault at scale: thousands of markdown files
 * with hashtags, wikilinks, rule-driven boards, and a few high-fanout
 * "@inbox" / "@next" nodes. Builds the vault synthetically on first
 * run (cached on disk), then exercises every km sync code path end
 * to end:
 *
 *   - cold load   — empty .km/state.db, full reconcile + parse
 *   - warm no-op  — re-run after cold, expect mostly skips
 *   - incremental — N file edits, rerun
 *
 * Run via the standard pipeline (`bun run bench`) so timings land in
 * `benchmarks/history.jsonl` for trend tracking. The `BIG_FILES` /
 * `BIG_RULES` env vars override the default scale (5000 files, 100
 * rule nodes) for one-off sweeps. Synthetic — never touches the
 * user's real vault.
 *
 * Re-run with `BIG_REBUILD=1` to discard the cached vault and rebuild
 * (useful when changing the generator below).
 */
import { bench, describe, beforeAll, afterAll } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { Database } from "bun:sqlite"
import { createEmitter, SCHEMA, ensureRepoRootNode, migrateSchema, migrateData } from "@km/storage"
import { withSync, type SyncableRepo } from "@km/fs-mount"

const BIG_FILES = Number(process.env.BIG_FILES ?? 5000)
const BIG_RULES = Number(process.env.BIG_RULES ?? 100)
const BIG_REBUILD = process.env.BIG_REBUILD === "1"
const VAULT_FIXTURE_BASE = join(tmpdir(), `km-bench-big-repo-${BIG_FILES}f-${BIG_RULES}r`)

function buildVault(target: string): void {
  mkdirSync(join(target, ".km"), { recursive: true })
  mkdirSync(join(target, "@km/inbox"), { recursive: true })
  mkdirSync(join(target, "@km/next"), { recursive: true })
  mkdirSync(join(target, "@km/agent"), { recursive: true })
  mkdirSync(join(target, "boards"), { recursive: true })
  writeFileSync(
    join(target, ".km/config.yaml"),
    `beads:\n  prefix: km\n  roots: ["@km"]\n  default_scope: "inbox"\n`,
  )

  // Rule-driven boards — match the real-vault shape (km.add:: queries
  // with -path: filters that exercise the recursive CTE).
  for (let r = 0; r < BIG_RULES; r++) {
    const tag = ["agent", "inbox", "next"][r % 3]!
    writeFileSync(
      join(target, `boards/board-${r}.md`),
      [
        `---`,
        `aliases: [km-boards.board-${r}]`,
        `created_at: 2026-04-${(r % 28) + 1}T00:00:00Z`,
        `---`,
        ``,
        `# Board ${r}`,
        ``,
        `## Section ${r} #board`,
        ``,
        "```km",
        `km.add:: @${tag} -path:archive/ -path:raw/`,
        "```",
        ``,
      ].join("\n"),
    )
  }

  // Bulk content — mimics inbox / next / agent items with hashtags and
  // cross-file wikilinks (the kind of stuff every tag-driven rule
  // matches against).
  const tags = ["#bug", "#feature", "#refactor", "#urgent", "#backlog"]
  for (let i = 0; i < BIG_FILES; i++) {
    const which = ["inbox", "next", "agent"][i % 3]!
    const extras = `${tags[i % tags.length]} ${tags[(i + 1) % tags.length]}`
    writeFileSync(
      join(target, `@km/${which}/note-${i}.md`),
      [
        `---`,
        `aliases: [km-${which}.note-${i}]`,
        `created_at: 2026-04-${(i % 28) + 1}T00:00:00Z`,
        `---`,
        ``,
        `# Note ${i} #P${i % 5} ${extras}`,
        ``,
        `Reference [[@km/${which}/note-${(i + 1) % BIG_FILES}]] and another @${which} mention.`,
        `Body line with cross-ref tag and prose.`,
        ``,
      ].join("\n"),
    )
  }
}

function freshTargetCopy(): string {
  if (BIG_REBUILD && existsSync(VAULT_FIXTURE_BASE)) {
    rmSync(VAULT_FIXTURE_BASE, { recursive: true, force: true })
  }
  if (!existsSync(VAULT_FIXTURE_BASE)) {
    buildVault(VAULT_FIXTURE_BASE)
  }
  // Each iteration syncs a FRESH copy so we measure cold-cycle behaviour
  // (state.db rebuilt, not pre-warmed). Using `cp -R` is faster than
  // re-running the generator.
  const copy = mkdtempSync(join(tmpdir(), `km-bench-big-repo-run-`))
  // bun-friendly recursive copy via Node's cpSync (sync, no symlink follow).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cpSync } = require("node:fs")
  cpSync(VAULT_FIXTURE_BASE, copy, { recursive: true })
  return copy
}

function buildSyncableRepo(db: Database, repoPath: string): SyncableRepo {
  const emitter = createEmitter({ kmDir: join(repoPath, ".km"), db })
  return {
    database: db,
    path: repoPath,
    emitter,
    apply: (event, options) => emitter.apply(event, options),
    commit: (event, options) => emitter.commit(event, options),
  }
}

function openFreshDb(repoPath: string): Database {
  const db = new Database(join(repoPath, ".km/state.db"))
  migrateSchema(db)
  db.run(SCHEMA)
  migrateData(db)
  ensureRepoRootNode(db, repoPath)
  return db
}

async function syncOnce(repoPath: string): Promise<void> {
  const db = openFreshDb(repoPath)
  const manager = withSync({ debounceFs: 0, debounceApply: 0, conflictStrategy: "last_write_wins" })(
    buildSyncableRepo(db, repoPath),
  )
  await manager.syncFromFs()
  await manager.stop()
  db.close()
}

describe(`big-repo sync — ${BIG_FILES} files, ${BIG_RULES} rules`, () => {
  // Build the fixture once across the suite so first-iteration timing
  // doesn't include the synthetic-vault generator (~10-30s for 5000
  // files). The cached fixture is reused across runs unless BIG_REBUILD=1.
  beforeAll(() => {
    if (!existsSync(VAULT_FIXTURE_BASE) || BIG_REBUILD) {
      if (existsSync(VAULT_FIXTURE_BASE)) rmSync(VAULT_FIXTURE_BASE, { recursive: true, force: true })
      buildVault(VAULT_FIXTURE_BASE)
    }
  })

  afterAll(() => {
    // Keep the fixture cached between runs (cheaper for repeat invocations).
    // BIG_REBUILD=1 forces regeneration. Per-iteration copies are cleaned
    // by the OS tmp reaper.
  })

  bench(
    `cold sync — fresh DB, ${BIG_FILES} files`,
    async () => {
      const repoPath = freshTargetCopy()
      try {
        await syncOnce(repoPath)
      } finally {
        rmSync(repoPath, { recursive: true, force: true })
      }
    },
    { iterations: 3, warmupIterations: 0 },
  )

  bench(
    `warm no-op sync — DB up-to-date, no changes`,
    async () => {
      const repoPath = freshTargetCopy()
      try {
        await syncOnce(repoPath) // first sync seeds the DB
        await syncOnce(repoPath) // measured: should be near-instant
      } finally {
        rmSync(repoPath, { recursive: true, force: true })
      }
    },
    { iterations: 3, warmupIterations: 0 },
  )

  bench(
    `incremental sync — single file edit (rule eval triage)`,
    async () => {
      const repoPath = freshTargetCopy()
      try {
        await syncOnce(repoPath) // seed DB

        // Edit one file in @km/inbox/. The new content stays in the
        // same tag namespace so only @inbox-watching rules need to
        // re-evaluate. Rules watching @next or @agent get triaged out
        // by `evaluateAffectedRules`.
        const target = join(repoPath, "@km/inbox/note-0.md")
        writeFileSync(
          target,
          [
            `---`,
            `aliases: [km-inbox.note-0]`,
            `created_at: 2026-04-29T12:00:00Z`,
            `---`,
            ``,
            `# Note 0 #P1 #urgent`,
            ``,
            `Updated body line.`,
            ``,
          ].join("\n"),
        )

        await syncOnce(repoPath) // measured: incremental rule eval
      } finally {
        rmSync(repoPath, { recursive: true, force: true })
      }
    },
    { iterations: 3, warmupIterations: 0 },
  )
})
