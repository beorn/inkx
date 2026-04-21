#!/usr/bin/env bun
/**
 * measure-collapsed-file-links-real-vault.ts
 *
 * C3 measurement (km-storage.collapsed-file-links): build state.db against
 * the real ~/Bear/Vault with collapse-parse enabled, then quantify the
 * backlink edges recovered by regex extraction over collapsed files.
 *
 * Reports:
 *   - Total rows in `collapsed_file_links`
 *   - Rows that target a href ALSO present in `links` (i.e. visible via the
 *     UNION — edges the target actually benefits from)
 *   - Top 10 most-linked-to hrefs in the collapsed pool
 *   - Query-time (ms) for a high-fanin backlink lookup
 *
 * READ-ONLY WRT THE USER'S VAULT: .md files only, never writes to vault
 * or its .km/ directory. tmp DB is deleted on exit.
 *
 * Usage:
 *   bun scripts/measure-collapsed-file-links-real-vault.ts
 *   bun scripts/measure-collapsed-file-links-real-vault.ts --vault /path
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
      console.log("usage: bun scripts/measure-collapsed-file-links-real-vault.ts [--vault <path>]")
      process.exit(0)
    }
  }
  return args
}

function main(): void {
  const args = parseArgs(process.argv)
  console.log(`measuring collapsed-file edge preservation on ${args.vault}\n`)

  const tmpDir = mkdtempSync(join(tmpdir(), "km-cfl-real-"))
  const dbPath = join(tmpDir, "state.db")
  const db = new Database(dbPath)
  db.run(SCHEMA)

  try {
    const matcher = createCollapseParseMatcher(["raw/chats/**", "archive/**"])
    const gen = loadRepo(args.vault, {
      db,
      collapseMatcher: matcher,
      mode: "memory",
      searchAncestors: false,
    })
    let r = gen.next()
    while (!r.done) r = gen.next()

    const totalNodes = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c
    const totalLinks = (db.query("SELECT COUNT(*) as c FROM links").get() as { c: number }).c
    const totalCfl = (db.query("SELECT COUNT(*) as c FROM collapsed_file_links").get() as { c: number })
      .c
    console.log(`nodes: ${totalNodes.toLocaleString()}`)
    console.log(`links (parsed): ${totalLinks.toLocaleString()}`)
    console.log(`collapsed_file_links: ${totalCfl.toLocaleString()}`)

    // Edge-type breakdown inside collapsed pool.
    const byType = db
      .query("SELECT link_type, COUNT(*) as c FROM collapsed_file_links GROUP BY link_type ORDER BY c DESC")
      .all() as Array<{ link_type: string; c: number }>
    console.log(`\ncollapsed_file_links by link_type:`)
    for (const row of byType) {
      console.log(`  ${row.link_type.padEnd(8)} ${row.c.toLocaleString().padStart(10)}`)
    }

    // Visible-via-UNION = hrefs in collapsed_file_links that ALSO show up as
    // targets from parsed content OR that resolve to a node with that href.
    // We approximate "visible benefit" as: hrefs that match a node.name in
    // the DB, since those are the ones backlink queries will surface.
    const visibleRows = db
      .query(
        `SELECT COUNT(*) as c FROM collapsed_file_links cfl
         WHERE EXISTS (
           SELECT 1 FROM nodes n
           WHERE cfl.href = 'km:' || n.name
              OR cfl.href = 'km:' || REPLACE(n.fs_path, '.md', '')
         )`,
      )
      .get() as { c: number }
    console.log(
      `\ncollapsed edges that reach a named target: ${visibleRows.c.toLocaleString()} / ${totalCfl.toLocaleString()} (${((visibleRows.c / Math.max(totalCfl, 1)) * 100).toFixed(1)}%)`,
    )

    // Top 10 most-linked-to hrefs in collapsed_file_links (regardless of
    // whether the target exists — just the raw fan-in from chat transcripts).
    const topTargets = db
      .query(
        "SELECT href, COUNT(*) as c FROM collapsed_file_links GROUP BY href ORDER BY c DESC LIMIT 10",
      )
      .all() as Array<{ href: string; c: number }>
    console.log(`\ntop 10 targets (by collapsed-source fan-in):`)
    for (const row of topTargets) {
      console.log(`  ${row.c.toLocaleString().padStart(8)}  ${row.href}`)
    }

    // Query time for a high-fanin backlink lookup. Pick the top target and
    // time the UNION query from the actual code path.
    const topHref = topTargets[0]?.href
    if (topHref) {
      const runs = 20
      const start = performance.now()
      for (let i = 0; i < runs; i++) {
        db.query(
          "SELECT host_id, href, rel FROM links WHERE href = ? " +
            "UNION ALL " +
            "SELECT host_id, href, rel FROM collapsed_file_links WHERE href = ?",
        ).all(topHref, topHref)
      }
      const elapsed = performance.now() - start
      const avg = elapsed / runs
      console.log(`\nUNION backlink query for top target (${topHref}):`)
      console.log(`  ${avg.toFixed(3)} ms avg over ${runs} runs`)
    }

    // File count that contributed edges.
    const contributingFiles = (
      db
        .query("SELECT COUNT(DISTINCT host_id) as c FROM collapsed_file_links")
        .get() as { c: number }
    ).c
    console.log(`\ncollapsed files contributing edges: ${contributingFiles.toLocaleString()}`)
  } finally {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main()
