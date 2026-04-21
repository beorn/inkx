#!/usr/bin/env bun
/**
 * measure-referenced-anchors-real-vault.ts
 *
 * C4 measurement (km-storage.collapsed-file-anchors): build state.db
 * against the real ~/Bear/Vault with collapse-parse enabled, then quantify
 * the pruning ratio achieved by only recording anchors that are actually
 * referenced from some other file.
 *
 * Reports:
 *   - Total rows in `referenced_anchors`
 *   - Number of collapsed files that have at least one inbound-referenced
 *     anchor (the set that actually benefits from the cache)
 *   - Top 10 most-referenced anchors (ref_count)
 *   - Query time (ms) for resolveAnchor on a representative collapsed-file
 *     reference
 *
 * READ-ONLY WRT THE USER'S VAULT: .md files only, never writes to vault
 * or its .km/ directory. tmp DB is deleted on exit.
 *
 * Usage:
 *   bun scripts/measure-referenced-anchors-real-vault.ts
 *   bun scripts/measure-referenced-anchors-real-vault.ts --vault /path
 */

import { Database } from "bun:sqlite"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir, homedir } from "os"

import { SCHEMA } from "../packages/km-storage/src/db/schema.ts"
import { loadRepo } from "../packages/km-storage/src/repo/loader.ts"
import { createCollapseParseMatcher } from "../packages/km-storage/src/markdown/collapse-parse.ts"
import { resolveAnchor } from "../packages/km-storage/src/links/resolve-anchor.ts"

interface Args {
  vault: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { vault: join(homedir(), "Bear", "Vault") }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--vault") args.vault = argv[++i]!
    else if (a === "--help" || a === "-h") {
      console.log("usage: bun scripts/measure-referenced-anchors-real-vault.ts [--vault <path>]")
      process.exit(0)
    }
  }
  return args
}

function main(): void {
  const args = parseArgs(process.argv)
  console.log(`measuring inbound-anchor pruning on ${args.vault}\n`)

  const tmpDir = mkdtempSync(join(tmpdir(), "km-ra-real-"))
  const dbPath = join(tmpDir, "state.db")
  const db = new Database(dbPath)
  db.run(SCHEMA)

  try {
    const matcher = createCollapseParseMatcher(["raw/chats/**", "archive/**"])
    const t0 = performance.now()
    const gen = loadRepo(args.vault, {
      db,
      collapseMatcher: matcher,
      mode: "memory",
      searchAncestors: false,
    })
    let r = gen.next()
    while (!r.done) r = gen.next()
    const loadMs = performance.now() - t0

    const totalNodes = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c
    const collapsedFiles = (
      db
        .query("SELECT COUNT(*) as c FROM nodes WHERE fs_path IS NOT NULL AND data LIKE '%_collapsed%'")
        .get() as { c: number }
    ).c
    const totalRefd = (db.query("SELECT COUNT(*) as c FROM referenced_anchors").get() as { c: number }).c
    const filesWithAnchors = (
      db
        .query("SELECT COUNT(DISTINCT file_id) as c FROM referenced_anchors")
        .get() as { c: number }
    ).c

    console.log(`load time: ${(loadMs / 1000).toFixed(2)}s`)
    console.log(`nodes: ${totalNodes.toLocaleString()}`)
    console.log(`collapsed files: ${collapsedFiles.toLocaleString()}`)
    console.log(`referenced_anchors rows: ${totalRefd.toLocaleString()}`)
    console.log(`collapsed files with >=1 referenced anchor: ${filesWithAnchors.toLocaleString()}`)
    if (collapsedFiles > 0) {
      console.log(
        `coverage: ${((filesWithAnchors / collapsedFiles) * 100).toFixed(1)}% of collapsed files have at least one inbound-referenced anchor`,
      )
    }

    // Breakdown: heading levels vs block refs.
    const byLevel = db
      .query(
        "SELECT IFNULL(CAST(heading_level AS TEXT), 'block') AS lvl, COUNT(*) as c " +
          "FROM referenced_anchors GROUP BY lvl ORDER BY lvl",
      )
      .all() as Array<{ lvl: string; c: number }>
    console.log(`\nreferenced_anchors by heading_level:`)
    for (const row of byLevel) {
      console.log(`  ${row.lvl.padEnd(8)} ${row.c.toLocaleString().padStart(10)}`)
    }

    // Top 10 most-referenced anchors (high ref_count).
    const topAnchors = db
      .query(
        "SELECT file_id, anchor, ref_count FROM referenced_anchors ORDER BY ref_count DESC LIMIT 10",
      )
      .all() as Array<{ file_id: string; anchor: string; ref_count: number }>
    if (topAnchors.length > 0) {
      console.log(`\ntop 10 referenced anchors (by ref_count):`)
      for (const row of topAnchors) {
        const filePath = (
          db
            .prepare("SELECT fs_path FROM nodes WHERE id = ?")
            .get(row.file_id) as { fs_path?: string } | undefined
        )?.fs_path
        console.log(
          `  ${row.ref_count.toLocaleString().padStart(5)} × ${filePath ?? "?"}#${row.anchor}`,
        )
      }
    }

    // Pruning ratio vs theoretical "all headings" extraction.
    // We approximate "all headings" by counting ATX-heading lines we would
    // have emitted if extractAnchors had run unconditionally on every
    // collapsed file. Since doing that on-the-fly would re-read the FS, we
    // report the pruning as (rows / (rows + missed)). A more accurate
    // figure requires a dry run with the full extractor, out of scope here.
    //
    // The practical point: rows is proportional to the inbound graph, not
    // to the headings count. If it's well below `collapsedFiles × avg_headings`
    // (a rough proxy is 30 headings/collapsed-file), the pruning is working.
    console.log(
      `\npruning proxy: rows/collapsed-file = ${(totalRefd / Math.max(collapsedFiles, 1)).toFixed(2)} (expect << headings/file avg)`,
    )

    // Time a representative resolveAnchor call — pick the top-referenced
    // anchor and time 20 calls.
    const top = topAnchors[0]
    if (top) {
      const filePath = (
        db
          .prepare("SELECT fs_path FROM nodes WHERE id = ?")
          .get(top.file_id) as { fs_path?: string } | undefined
      )?.fs_path
      if (filePath) {
        const basename = filePath.split("/").pop()?.replace(/\.md$/, "") ?? ""
        const runs = 20
        const t1 = performance.now()
        for (let i = 0; i < runs; i++) {
          resolveAnchor(db, { path: basename, anchor: top.anchor })
        }
        const avg = (performance.now() - t1) / runs
        console.log(
          `\nresolveAnchor({ path: ${JSON.stringify(basename)}, anchor: ${JSON.stringify(top.anchor)} }):`,
        )
        console.log(`  ${avg.toFixed(3)} ms avg over ${runs} runs`)
      }
    }
  } finally {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
