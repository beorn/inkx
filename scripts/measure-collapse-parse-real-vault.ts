#!/usr/bin/env bun
/**
 * measure-collapse-parse-real-vault.ts
 *
 * Build state.db in a tmp file against the real ~/Bear/Vault filesystem,
 * first WITHOUT collapse-parse then WITH it, and report node counts.
 *
 * Uses an on-disk tmp file (not :memory:) because 500K+ nodes don't fit
 * comfortably in memory. The tmp file is deleted on exit.
 *
 * READ-ONLY WRT THE USER'S VAULT: we only read .md files, we never write
 * to the vault or its .km/ directory.
 *
 * Usage:
 *   bun scripts/measure-collapse-parse-real-vault.ts
 *   bun scripts/measure-collapse-parse-real-vault.ts --vault /path/to/other
 */

import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir, homedir } from "os"

import { SCHEMA } from "../packages/km-storage/src/db/schema.ts"
import { loadRepo } from "../packages/km-storage/src/repo/loader.ts"
import { createCollapseParseMatcher } from "../packages/km-storage/src/markdown/collapse-parse.ts"

interface Args {
  vault: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { vault: join(homedir(), "Bear", "Vault") }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--vault") args.vault = argv[++i]!
    else if (a === "--help" || a === "-h") {
      console.log("usage: bun scripts/measure-collapse-parse-real-vault.ts [--vault <path>]")
      process.exit(0)
    }
  }
  return args
}

interface Breakdown {
  total: number
  topLevels: Array<{ top: string; count: number; pct: number }>
}

function measure(vaultRoot: string, patterns: string[]): Breakdown {
  const tmpDir = mkdtempSync(join(tmpdir(), "km-cp-real-"))
  const dbPath = join(tmpDir, "state.db")
  const db = new Database(dbPath)
  db.run(SCHEMA)

  try {
    const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
    // Force memory mode so we rebuild from the filesystem (bypass the vault's
    // existing changes.jsonl, which contains historical parse events that
    // would mask the effect of collapse-parse). Also disable ancestor search
    // so we don't accidentally pick up a parent `.km/` dir.
    const gen = loadRepo(vaultRoot, {
      db,
      collapseMatcher,
      mode: "memory",
      searchAncestors: false,
    })
    let r = gen.next()
    while (!r.done) r = gen.next()

    const total = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c

    // Top-level attribution via recursive CTE — same as vault-diagnostic.ts.
    const topRows = db
      .query(
        `WITH RECURSIVE tree(root_id, node_id) AS (
           SELECT id, id FROM nodes WHERE fstype IN ('mdfile', 'file')
           UNION ALL
           SELECT t.root_id, n.id
           FROM nodes n JOIN tree t ON n.parent_id = t.node_id
         )
         SELECT
           CASE
             WHEN r.fs_path IS NULL THEN '(no file)'
             WHEN instr(r.fs_path, '/') = 0 THEN '(top-level file)'
             ELSE substr(r.fs_path, 1, instr(r.fs_path, '/') - 1) || '/'
           END AS top,
           COUNT(*) as c
         FROM tree t
         JOIN nodes r ON r.id = t.root_id
         GROUP BY top
         ORDER BY c DESC`,
      )
      .all() as { top: string; c: number }[]

    const topLevels = topRows.map((r) => ({ top: r.top, count: r.c, pct: (r.c / total) * 100 }))
    return { total, topLevels }
  } finally {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

function printBreakdown(label: string, b: Breakdown): void {
  console.log(`${label}: ${b.total.toLocaleString()} nodes`)
  for (const row of b.topLevels.slice(0, 10)) {
    console.log(`  ${row.top.padEnd(20)} ${row.count.toLocaleString().padStart(10)} (${row.pct.toFixed(1)}%)`)
  }
}

function main() {
  const args = parseArgs(process.argv)
  console.log(`measuring ${args.vault}\n`)

  console.log("=== BEFORE (no collapse-parse) ===")
  const before = measure(args.vault, [])
  printBreakdown("total", before)

  console.log("\n=== AFTER (raw/chats/** + archive/**) ===")
  const after = measure(args.vault, ["raw/chats/**", "archive/**"])
  printBreakdown("total", after)

  const reduction = ((before.total - after.total) / before.total) * 100
  console.log(`\nreduction: ${reduction.toFixed(1)}%  (${before.total.toLocaleString()} → ${after.total.toLocaleString()})`)
}

main()
