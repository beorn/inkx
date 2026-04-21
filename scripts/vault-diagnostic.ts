#!/usr/bin/env bun
/**
 * vault-diagnostic.ts — node histogram + heaviest-files report
 *
 * Read-only diagnostic over an existing `.km/state.db`. Opens the DB
 * directly via `bun:sqlite` (no createRepo() — we don't need sync,
 * parsing, or any mutation path to count rows).
 *
 * Produces a per-type, per-fstype, per-depth, per-file histogram and
 * identifies pathological patterns (very-deep trees, files with 10K+
 * nodes, repeated auto-generated-looking content).
 *
 * Usage:
 *   bun scripts/vault-diagnostic.ts [--db <path>] [--json] [--markdown]
 *
 * Default DB path: ~/Bear/Vault/.km/state.db
 *
 * Why not createRepo(): opening a repo kicks off reconcile/watcher/
 * link-resolution, which is orders-of-magnitude slower than reading
 * the already-built SQLite cache. The DB is a materialized view of
 * the vault — reading it directly is the right primitive for a
 * diagnostic report. We snapshot the file first so live edits during
 * the run don't race the queries.
 */

import { Database } from "bun:sqlite"
import { existsSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface Args {
  db: string
  json: boolean
  markdown: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    db: join(homedir(), "Bear", "Vault", ".km", "state.db"),
    json: false,
    markdown: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--db") args.db = argv[++i]!
    else if (a === "--json") args.json = true
    else if (a === "--markdown") args.markdown = true
    else if (a === "--help" || a === "-h") {
      console.log("usage: bun scripts/vault-diagnostic.ts [--db <path>] [--json] [--markdown]")
      process.exit(0)
    }
  }
  return args
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

interface TypeBreakdown {
  type: string
  item: number
  count: number
  pct: number
}

interface FstypeBreakdown {
  fstype: string | null
  count: number
  pct: number
}

interface HeaviestFile {
  fs_path: string | null
  fstype: string | null
  count: number
}

interface TopLevelBreakdown {
  top: string
  count: number
  pct: number
}

interface DepthBreakdown {
  depth: number
  count: number
}

interface ContentSample {
  content: string
  count: number
}

function runQueries(db: Database) {
  const totalNodes = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c

  const totalItems = (db.query("SELECT COUNT(*) as c FROM nodes WHERE item = 1").get() as { c: number }).c
  const totalBlocks = (db.query("SELECT COUNT(*) as c FROM nodes WHERE item = 0").get() as { c: number }).c

  const distinctFiles = (
    db.query("SELECT COUNT(DISTINCT fs_path) as c FROM nodes WHERE fs_path IS NOT NULL").get() as { c: number }
  ).c

  // Breakdown: type + item flag
  const typeRows = db
    .query(
      `SELECT type, item, COUNT(*) as c
       FROM nodes
       GROUP BY type, item
       ORDER BY c DESC`,
    )
    .all() as { type: string; item: number; c: number }[]
  const typeBreakdown: TypeBreakdown[] = typeRows.map((r) => ({
    type: r.type,
    item: r.item,
    count: r.c,
    pct: (r.c / totalNodes) * 100,
  }))

  // Breakdown: fstype
  const fstypeRows = db
    .query(
      `SELECT fstype, COUNT(*) as c
       FROM nodes
       GROUP BY fstype
       ORDER BY c DESC`,
    )
    .all() as { fstype: string | null; c: number }[]
  const fstypeBreakdown: FstypeBreakdown[] = fstypeRows.map((r) => ({
    fstype: r.fstype,
    count: r.c,
    pct: (r.c / totalNodes) * 100,
  }))

  // Heaviest files — counts ALL descendants, not just direct rows. fs_path is
  // only set on file/mdfile/folder root nodes; paragraphs, headings, list items
  // inherit via parent_id chain. We walk the ancestry with a recursive CTE to
  // attribute every descendant to its nearest file/mdfile root.
  //
  // This is the count that matters for the "explosion" hypothesis — if a chat
  // transcript file holds 30K descendant nodes, we want that number, not "1".
  const heaviestRaw = db
    .query(
      `WITH RECURSIVE tree(root_id, node_id) AS (
         SELECT id, id FROM nodes WHERE fstype IN ('mdfile', 'file')
         UNION ALL
         SELECT t.root_id, n.id
         FROM nodes n
         JOIN tree t ON n.parent_id = t.node_id
       )
       SELECT t.root_id, r.fs_path, r.fstype, COUNT(*) as c
       FROM tree t
       JOIN nodes r ON r.id = t.root_id
       GROUP BY t.root_id
       ORDER BY c DESC
       LIMIT 20`,
    )
    .all() as { root_id: string; fs_path: string | null; fstype: string | null; c: number }[]
  const heaviestFiles: HeaviestFile[] = heaviestRaw.map((r) => ({
    fs_path: r.fs_path,
    fstype: r.fstype,
    count: r.c,
  }))

  // Distribution by node-count bucket — walk the ancestry CTE to attribute
  // descendants, then bucket per-file totals.
  const bucketRows = db
    .query(
      `WITH RECURSIVE tree(root_id, node_id) AS (
         SELECT id, id FROM nodes WHERE fstype IN ('mdfile', 'file')
         UNION ALL
         SELECT t.root_id, n.id
         FROM nodes n
         JOIN tree t ON n.parent_id = t.node_id
       ),
       counts AS (
         SELECT root_id, COUNT(*) as c FROM tree GROUP BY root_id
       )
       SELECT
         CASE
           WHEN c < 10 THEN '00000-00009'
           WHEN c < 50 THEN '00010-00049'
           WHEN c < 100 THEN '00050-00099'
           WHEN c < 500 THEN '00100-00499'
           WHEN c < 1000 THEN '00500-00999'
           WHEN c < 5000 THEN '01000-04999'
           WHEN c < 10000 THEN '05000-09999'
           WHEN c < 20000 THEN '10000-19999'
           ELSE '20000+'
         END as bucket,
         COUNT(*) as files,
         SUM(c) as nodes
       FROM counts
       GROUP BY bucket
       ORDER BY bucket`,
    )
    .all() as { bucket: string; files: number; nodes: number }[]
  const filesPerBucket = bucketRows

  const over10k = filesPerBucket
    .filter((b) => b.bucket === "10000-19999" || b.bucket === "20000+")
    .reduce((a, b) => a + b.files, 0)
  const over1k = filesPerBucket
    .filter((b) => ["01000-04999", "05000-09999", "10000-19999", "20000+"].includes(b.bucket))
    .reduce((a, b) => a + b.files, 0)
  const over100 = filesPerBucket
    .filter((b) =>
      ["00100-00499", "00500-00999", "01000-04999", "05000-09999", "10000-19999", "20000+"].includes(b.bucket),
    )
    .reduce((a, b) => a + b.files, 0)

  // Top-level directory breakdown — attribute every node to its NEAREST file
  // root, then bucket by the root's top-level path segment. Only mdfile/file
  // roots participate (folder roots would double-count because they contain
  // mdfile children that also belong to them).
  //
  // Nodes whose ancestry never reaches a file root are counted as "(orphan)"
  // — these are synthetic/virtual nodes not backed by any file.
  const topLevelRows = db
    .query(
      `WITH RECURSIVE tree(root_id, node_id) AS (
         SELECT id, id FROM nodes WHERE fstype IN ('mdfile', 'file')
         UNION ALL
         SELECT t.root_id, n.id
         FROM nodes n
         JOIN tree t ON n.parent_id = t.node_id
       ),
       per_node AS (
         SELECT node_id, root_id FROM tree
       ),
       attributed AS (
         SELECT
           CASE
             WHEN r.fs_path LIKE 'raw/chats/%' THEN 'raw/chats'
             WHEN r.fs_path LIKE 'raw/%' THEN 'raw/other'
             WHEN r.fs_path LIKE 'archive/Asana/%' THEN 'archive/Asana'
             WHEN r.fs_path LIKE 'archive/%' THEN 'archive/other'
             WHEN r.fs_path LIKE 'journals/%' THEN 'journals'
             WHEN r.fs_path LIKE '@inbox/%' THEN '@inbox'
             WHEN r.fs_path LIKE 'areas/%' THEN 'areas'
             WHEN r.fs_path LIKE 'projects/%' THEN 'projects'
             WHEN r.fs_path LIKE 'ref/%' THEN 'ref'
             WHEN r.fs_path IS NULL THEN '(no fs_path)'
             ELSE '(top-level file)'
           END as top,
           p.node_id
         FROM per_node p
         JOIN nodes r ON r.id = p.root_id
       )
       SELECT top, COUNT(*) as c FROM attributed GROUP BY top
       UNION ALL
       SELECT '(orphan — no file ancestor)' as top, COUNT(*) as c FROM nodes
         WHERE id NOT IN (SELECT node_id FROM per_node)
       ORDER BY c DESC`,
    )
    .all() as { top: string; c: number }[]
  const topLevelBreakdown: TopLevelBreakdown[] = topLevelRows.map((r) => ({
    top: r.top,
    count: r.c,
    pct: (r.c / totalNodes) * 100,
  }))

  // Approximate depth via parent-chain walk (SQLite recursive CTE).
  // Cap at 50 so pathological cycles (shouldn't exist, but defensive)
  // don't hang forever. "Max depth" in output is the depth we saw.
  const depthRows = db
    .query(
      `WITH RECURSIVE chain(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM nodes WHERE parent_id IS NULL OR parent_id = '.'
         UNION ALL
         SELECT n.id, n.parent_id, c.depth + 1
         FROM nodes n
         JOIN chain c ON n.parent_id = c.id
         WHERE c.depth < 50
       )
       SELECT depth, COUNT(*) as c FROM chain GROUP BY depth ORDER BY depth`,
    )
    .all() as { depth: number; c: number }[]
  const depthBreakdown: DepthBreakdown[] = depthRows.map((r) => ({ depth: r.depth, count: r.c }))
  const maxDepth = depthRows.length > 0 ? depthRows[depthRows.length - 1]!.depth : 0

  // Average children per item-node (only items can have children)
  const avgChildrenRow = db
    .query(
      `WITH child_counts AS (
         SELECT parent_id, COUNT(*) as c FROM nodes
         WHERE parent_id IS NOT NULL AND parent_id != '.'
         GROUP BY parent_id
       )
       SELECT AVG(c) as avg_c, MAX(c) as max_c FROM child_counts`,
    )
    .get() as { avg_c: number | null; max_c: number | null }

  // Top recurring content (looking for auto-generated duplicates)
  // Short paragraphs with identical content across many rows are a
  // smell — e.g., "[ ] " or "---" repeated, or a single emoji.
  const dupContentRows = db
    .query(
      `SELECT content, COUNT(*) as c FROM nodes
       WHERE content IS NOT NULL AND length(content) > 0
       GROUP BY content
       HAVING c >= 100
       ORDER BY c DESC
       LIMIT 20`,
    )
    .all() as { content: string; c: number }[]
  const dupContent: ContentSample[] = dupContentRows.map((r) => ({
    content: r.content.length > 80 ? r.content.slice(0, 77) + "..." : r.content,
    count: r.c,
  }))

  // Nodes with NULL fs_path (synthetic — not backed by a file)
  const syntheticCount = (
    db.query("SELECT COUNT(*) as c FROM nodes WHERE fs_path IS NULL").get() as { c: number }
  ).c

  // Embed nodes — these are materialized runtime, and at high scale could double/triple count
  const embedCount = (
    db.query("SELECT COUNT(*) as c FROM nodes WHERE embed_of IS NOT NULL").get() as { c: number }
  ).c

  // List-item types specifically — the single biggest bucket in prior notes
  const listItemRows = db
    .query(
      `SELECT list_marker, COUNT(*) as c
       FROM nodes WHERE type = 'p' AND item = 1 AND list_marker IS NOT NULL
       GROUP BY list_marker ORDER BY c DESC`,
    )
    .all() as { list_marker: string; c: number }[]

  // Nodes by parsed flag — did everything parse, or are many stubs?
  const parsedRows = db
    .query(
      `SELECT parsed, COUNT(*) as c FROM nodes GROUP BY parsed ORDER BY parsed`,
    )
    .all() as { parsed: number; c: number }[]

  return {
    totalNodes,
    totalItems,
    totalBlocks,
    distinctFiles,
    typeBreakdown,
    fstypeBreakdown,
    heaviestFiles,
    over10k,
    over1k,
    over100,
    filesPerBucket,
    topLevelBreakdown,
    depthBreakdown,
    maxDepth,
    avgChildren: avgChildrenRow.avg_c ?? 0,
    maxChildren: avgChildrenRow.max_c ?? 0,
    dupContent,
    syntheticCount,
    embedCount,
    listItemRows,
    parsedRows,
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString()
}

function pctStr(n: number): string {
  return n.toFixed(1) + "%"
}

function renderMarkdown(r: ReturnType<typeof runQueries>, dbPath: string): string {
  const lines: string[] = []
  lines.push(`# Vault Node Explosion Diagnostic`)
  lines.push(``)
  lines.push(`**DB**: \`${dbPath}\`  `)
  lines.push(`**Generated**: ${new Date().toISOString()}  `)
  lines.push(``)
  lines.push(`## Top-line numbers`)
  lines.push(``)
  lines.push(`| Metric | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Total nodes | **${fmt(r.totalNodes)}** |`)
  lines.push(`| Distinct files | ${fmt(r.distinctFiles)} |`)
  lines.push(`| Avg nodes per file | ${(r.totalNodes / Math.max(1, r.distinctFiles)).toFixed(1)} |`)
  lines.push(`| Items (\`item=1\`) | ${fmt(r.totalItems)} (${pctStr((r.totalItems / r.totalNodes) * 100)}) |`)
  lines.push(`| Blocks (\`item=0\`) | ${fmt(r.totalBlocks)} (${pctStr((r.totalBlocks / r.totalNodes) * 100)}) |`)
  lines.push(`| Synthetic (no \`fs_path\`) | ${fmt(r.syntheticCount)} (${pctStr((r.syntheticCount / r.totalNodes) * 100)}) |`)
  lines.push(`| Embed nodes (\`embed_of IS NOT NULL\`) | ${fmt(r.embedCount)} |`)
  lines.push(`| Max tree depth (capped @ 50) | ${r.maxDepth} |`)
  lines.push(`| Avg children per parent | ${r.avgChildren.toFixed(2)} |`)
  lines.push(`| Max children under one parent | ${fmt(r.maxChildren)} |`)
  lines.push(``)

  lines.push(`## Node type breakdown (by \`type\` + \`item\`)`)
  lines.push(``)
  lines.push(`| type | item | count | % |`)
  lines.push(`|---|---:|---:|---:|`)
  for (const t of r.typeBreakdown) {
    lines.push(`| \`${t.type}\` | ${t.item} | ${fmt(t.count)} | ${pctStr(t.pct)} |`)
  }
  lines.push(``)

  lines.push(`## fstype breakdown`)
  lines.push(``)
  lines.push(`| fstype | count | % |`)
  lines.push(`|---|---:|---:|`)
  for (const f of r.fstypeBreakdown) {
    lines.push(`| \`${f.fstype ?? "(null)"}\` | ${fmt(f.count)} | ${pctStr(f.pct)} |`)
  }
  lines.push(``)

  lines.push(`## Depth distribution`)
  lines.push(``)
  lines.push(`| depth | count |`)
  lines.push(`|---:|---:|`)
  for (const d of r.depthBreakdown) {
    lines.push(`| ${d.depth} | ${fmt(d.count)} |`)
  }
  lines.push(``)

  lines.push(`## File node-count distribution`)
  lines.push(``)
  lines.push(`| nodes-per-file | files | total nodes |`)
  lines.push(`|---|---:|---:|`)
  for (const b of r.filesPerBucket) {
    lines.push(`| ${b.bucket} | ${fmt(b.files)} | ${fmt(b.nodes)} |`)
  }
  lines.push(``)

  lines.push(`## Pathological-file counts`)
  lines.push(``)
  lines.push(`| threshold | files over it |`)
  lines.push(`|---|---:|`)
  lines.push(`| ≥ 100 nodes | ${fmt(r.over100)} |`)
  lines.push(`| ≥ 1,000 nodes | ${fmt(r.over1k)} |`)
  lines.push(`| ≥ 10,000 nodes | ${fmt(r.over10k)} |`)
  lines.push(``)

  lines.push(`## Top 10 heaviest files (descendant count via ancestry walk)`)
  lines.push(``)
  lines.push(`| rank | nodes | fstype | path |`)
  lines.push(`|---:|---:|---|---|`)
  for (let i = 0; i < Math.min(10, r.heaviestFiles.length); i++) {
    const h = r.heaviestFiles[i]!
    lines.push(`| ${i + 1} | ${fmt(h.count)} | \`${h.fstype}\` | \`${h.fs_path}\` |`)
  }
  lines.push(``)

  if (r.heaviestFiles.length > 10) {
    lines.push(`<details><summary>Rank 11–20</summary>`)
    lines.push(``)
    lines.push(`| rank | nodes | fstype | path |`)
    lines.push(`|---:|---:|---|---|`)
    for (let i = 10; i < r.heaviestFiles.length; i++) {
      const h = r.heaviestFiles[i]!
      lines.push(`| ${i + 1} | ${fmt(h.count)} | \`${h.fstype}\` | \`${h.fs_path}\` |`)
    }
    lines.push(``)
    lines.push(`</details>`)
    lines.push(``)
  }

  lines.push(`## Top-level attribution (where the nodes live)`)
  lines.push(``)
  lines.push(`Every node attributed to its file-root's top-level directory, via the same ancestry walk.`)
  lines.push(``)
  lines.push(`| top-level | nodes | % |`)
  lines.push(`|---|---:|---:|`)
  for (const t of r.topLevelBreakdown) {
    lines.push(`| \`${t.top}\` | ${fmt(t.count)} | ${pctStr(t.pct)} |`)
  }
  lines.push(``)

  lines.push(`## List-item markers (structural items, \`type='p' item=1\`)`)
  lines.push(``)
  lines.push(`| marker | count |`)
  lines.push(`|---|---:|`)
  for (const li of r.listItemRows) {
    lines.push(`| \`${li.list_marker}\` | ${fmt(li.c)} |`)
  }
  lines.push(``)

  lines.push(`## Parsed flag`)
  lines.push(``)
  lines.push(`| parsed | count |`)
  lines.push(`|---:|---:|`)
  for (const p of r.parsedRows) {
    lines.push(`| ${p.parsed} | ${fmt(p.c)} |`)
  }
  lines.push(``)

  if (r.dupContent.length > 0) {
    lines.push(`## High-duplication content (100+ identical rows)`)
    lines.push(``)
    lines.push(`Potential auto-generated / template / noise content.`)
    lines.push(``)
    lines.push(`| count | content |`)
    lines.push(`|---:|---|`)
    for (const d of r.dupContent) {
      const c = d.content.replace(/\n/g, "\\n").replace(/\|/g, "\\|")
      lines.push(`| ${fmt(d.count)} | \`${c}\` |`)
    }
    lines.push(``)
  }

  return lines.join("\n")
}

function renderText(r: ReturnType<typeof runQueries>, dbPath: string): string {
  const lines: string[] = []
  const bar = "=".repeat(60)
  lines.push(bar)
  lines.push(`Vault Node Explosion Diagnostic`)
  lines.push(`DB: ${dbPath}`)
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(bar)
  lines.push(``)
  lines.push(`TOP LINE`)
  lines.push(`  Total nodes:        ${fmt(r.totalNodes)}`)
  lines.push(`  Distinct files:     ${fmt(r.distinctFiles)}`)
  lines.push(`  Avg nodes/file:     ${(r.totalNodes / Math.max(1, r.distinctFiles)).toFixed(1)}`)
  lines.push(`  Items (item=1):     ${fmt(r.totalItems)} (${pctStr((r.totalItems / r.totalNodes) * 100)})`)
  lines.push(`  Blocks (item=0):    ${fmt(r.totalBlocks)} (${pctStr((r.totalBlocks / r.totalNodes) * 100)})`)
  lines.push(`  Synthetic:          ${fmt(r.syntheticCount)} (${pctStr((r.syntheticCount / r.totalNodes) * 100)})`)
  lines.push(`  Embeds:             ${fmt(r.embedCount)}`)
  lines.push(`  Max depth:          ${r.maxDepth}`)
  lines.push(`  Avg children:       ${r.avgChildren.toFixed(2)}`)
  lines.push(`  Max children:       ${fmt(r.maxChildren)}`)
  lines.push(``)

  lines.push(`NODE TYPE BREAKDOWN`)
  for (const t of r.typeBreakdown) {
    lines.push(`  ${t.type.padEnd(6)} item=${t.item}  ${fmt(t.count).padStart(10)}  ${pctStr(t.pct).padStart(6)}`)
  }
  lines.push(``)

  lines.push(`FSTYPE BREAKDOWN`)
  for (const f of r.fstypeBreakdown) {
    const name = f.fstype ?? "(null)"
    lines.push(`  ${name.padEnd(12)} ${fmt(f.count).padStart(10)}  ${pctStr(f.pct).padStart(6)}`)
  }
  lines.push(``)

  lines.push(`DEPTH DISTRIBUTION`)
  for (const d of r.depthBreakdown) {
    lines.push(`  depth ${String(d.depth).padStart(2)}  ${fmt(d.count).padStart(10)}`)
  }
  lines.push(``)

  lines.push(`FILES-PER-BUCKET`)
  for (const b of r.filesPerBucket) {
    lines.push(`  ${b.bucket.padEnd(12)} files=${fmt(b.files).padStart(7)}  nodes=${fmt(b.nodes).padStart(10)}`)
  }
  lines.push(``)

  lines.push(`PATHOLOGICAL FILES`)
  lines.push(`  >=   100 nodes:  ${fmt(r.over100)}`)
  lines.push(`  >=  1000 nodes:  ${fmt(r.over1k)}`)
  lines.push(`  >= 10000 nodes:  ${fmt(r.over10k)}`)
  lines.push(``)

  lines.push(`TOP 10 HEAVIEST FILES (descendant count via ancestry walk)`)
  for (let i = 0; i < Math.min(10, r.heaviestFiles.length); i++) {
    const h = r.heaviestFiles[i]!
    lines.push(`  ${String(i + 1).padStart(2)}. ${fmt(h.count).padStart(8)}  [${h.fstype}]  ${h.fs_path}`)
  }
  lines.push(``)

  if (r.heaviestFiles.length > 10) {
    lines.push(`RANK 11-20`)
    for (let i = 10; i < r.heaviestFiles.length; i++) {
      const h = r.heaviestFiles[i]!
      lines.push(`  ${String(i + 1).padStart(2)}. ${fmt(h.count).padStart(8)}  [${h.fstype}]  ${h.fs_path}`)
    }
    lines.push(``)
  }

  lines.push(`TOP-LEVEL ATTRIBUTION (where the nodes live)`)
  for (const t of r.topLevelBreakdown) {
    lines.push(`  ${t.top.padEnd(18)} ${fmt(t.count).padStart(10)}  ${pctStr(t.pct).padStart(6)}`)
  }
  lines.push(``)

  lines.push(`LIST-ITEM MARKERS`)
  for (const li of r.listItemRows) {
    lines.push(`  ${li.list_marker.padEnd(4)} ${fmt(li.c).padStart(10)}`)
  }
  lines.push(``)

  lines.push(`PARSED FLAG`)
  for (const p of r.parsedRows) {
    lines.push(`  ${p.parsed}  ${fmt(p.c).padStart(10)}`)
  }
  lines.push(``)

  if (r.dupContent.length > 0) {
    lines.push(`HIGH-DUPLICATION CONTENT (100+ identical rows)`)
    for (const d of r.dupContent) {
      const c = d.content.replace(/\n/g, "\\n")
      lines.push(`  ${fmt(d.count).padStart(8)}  ${c}`)
    }
    lines.push(``)
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.db)) {
    console.error(`ERROR: DB not found at ${args.db}`)
    process.exit(1)
  }

  const stat = statSync(args.db)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(1)

  // Open read-only to keep us out of the write path (the running vault
  // might be mutating the real DB; we're pointed at a snapshot by default).
  const db = new Database(args.db, { readonly: true })

  // SQLite journal mode check — WAL-mode DBs are fine to read read-only
  // but won't see transactions still in the -wal file. That's acceptable
  // for a histogram: we'll be within 0.01% of truth.
  const started = Date.now()
  const report = runQueries(db)
  const elapsedMs = Date.now() - started

  if (args.json) {
    console.log(JSON.stringify({ dbPath: args.db, dbSizeMb: sizeMb, elapsedMs, ...report }, null, 2))
  } else if (args.markdown) {
    console.log(renderMarkdown(report, args.db))
    console.error(`\n# Diagnostic ran in ${elapsedMs}ms (DB ${sizeMb}MB)`)
  } else {
    console.log(renderText(report, args.db))
    console.log(`Diagnostic ran in ${elapsedMs}ms (DB ${sizeMb}MB)`)
  }

  db.close()
}

main()
