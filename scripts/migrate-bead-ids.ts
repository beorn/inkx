#!/usr/bin/env bun
/**
 * Migrate active bead IDs to project-scoped pattern (km-<scope>-N)
 *
 * Usage:
 *   bun scripts/migrate-bead-ids.ts --dry-run   # Preview changes
 *   bun scripts/migrate-bead-ids.ts --execute   # Apply changes
 */

import { Database } from "bun:sqlite"
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"

interface Bead {
  id: string
  title: string
  description: string
  status: string
  issue_type: string
}

interface IDMapping {
  oldId: string
  newId: string
  scope: string
  bead: Bead
}

const REPO_ROOT = join(import.meta.dir, "..")
const BEADS_DB = join(REPO_ROOT, ".beads/beads.db")
const ISSUES_JSONL = join(REPO_ROOT, ".beads/issues.jsonl")

// Parse command line args
const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const isExecute = args.includes("--execute")

if (!isDryRun && !isExecute) {
  console.error("Error: Must specify --dry-run or --execute")
  process.exit(1)
}

/**
 * Infer scope from bead title/description
 */
function inferScope(bead: Bead): string {
  const text = `${bead.title} ${bead.description}`.toLowerCase()

  // Check for explicit scope markers (order matters - more specific first)
  if (
    text.includes("storage") ||
    text.includes("@km/storage") ||
    text.includes("km-storage")
  ) {
    return "storage"
  }
  if (
    text.includes("flexture") ||
    text.includes("layout")
  ) {
    return "flexture"
  }
  if (text.includes("board") || text.includes("@km/board")) return "board"
  if (
    text.includes("tui") ||
    text.includes("apps/km-tui") ||
    text.includes("km-tui")
  ) {
    return "tui"
  }
  if (text.includes("tree") || text.includes("@km/tree")) return "tree"
  if (
    text.includes("markdown") ||
    text.includes("@km/markdown") ||
    text.includes("parser")
  ) {
    return "markdown"
  }
  if (
    text.includes("command") ||
    text.includes("@km/commands") ||
    text.includes("keybinding")
  ) {
    return "commands"
  }
  if (
    text.includes("test") ||
    text.includes("testing") ||
    text.includes("test suite")
  ) {
    return "test"
  }
  if (
    text.includes("sync") ||
    text.includes("watcher") ||
    text.includes("reconcile") ||
    text.includes("file watch")
  ) {
    return "sync"
  }
  if (
    text.includes("domain") ||
    text.includes("refactor") ||
    text.includes("architecture")
  ) {
    return "domain"
  }
  if (
    text.includes("vendor") ||
    text.includes("extract")
  ) {
    return "vendor"
  }
  if (
    text.includes("mouse") ||
    text.includes("click") ||
    text.includes("drag")
  ) {
    return "mouse"
  }

  // Check issue type for scope hints
  if (
    bead.issue_type === "chore" ||
    text.includes("cleanup") ||
    text.includes("lint")
  ) {
    return "chore"
  }

  // Fallback: misc
  return "misc"
}

/**
 * Get next available number for a scope
 */
function getNextNumber(
  db: Database,
  scope: string,
  existingMappings: Map<string, IDMapping>,
): number {
  // Check both database and in-flight mappings
  const prefix = `km-${scope}-`

  // Query database for max N
  const stmt = db.prepare<{ maxN: number | null }, [string, string, string]>(`
    SELECT MAX(CAST(SUBSTR(id, LENGTH(?) + 1) AS INTEGER)) as maxN
    FROM issues
    WHERE id LIKE ? || '%'
      AND id GLOB ? || '[0-9]*'
  `)

  const result = stmt.get(prefix, prefix, prefix)
  const dbMax = result?.maxN ?? 0

  // Check in-flight mappings
  const mappingMax = Array.from(existingMappings.values())
    .filter((m) => m.newId.startsWith(prefix))
    .map((m) => {
      const match = m.newId.match(/km-[a-z]+-(\d+)/)
      return match?.[1] ? parseInt(match[1], 10) : 0
    })
    .reduce((max, n) => Math.max(max, n), 0)

  return Math.max(dbMax, mappingMax) + 1
}

/**
 * Load active beads from database
 */
function loadActiveBeads(db: Database): Bead[] {
  const stmt = db.prepare<Bead, []>(`
    SELECT id, title, COALESCE(description, '') as description, status, issue_type
    FROM issues
    WHERE status IN ('open', 'in_progress')
    ORDER BY id
  `)

  return stmt.all()
}

/**
 * Generate ID mappings for all active beads
 */
function generateMappings(db: Database, beads: Bead[]): IDMapping[] {
  const mappings = new Map<string, IDMapping>()

  // First pass: generate base mappings (non-hierarchical)
  for (const bead of beads) {
    if (!bead.id.includes(".")) {
      const scope = inferScope(bead)
      const nextN = getNextNumber(db, scope, mappings)
      const newId = `km-${scope}-${nextN}`

      mappings.set(bead.id, {
        oldId: bead.id,
        newId,
        scope,
        bead,
      })
    }
  }

  // Second pass: handle hierarchical beads
  for (const bead of beads) {
    if (bead.id.includes(".")) {
      const parts = bead.id.split(".")
      const parentId = parts[0]! // Guaranteed to exist since id contains "."
      const suffix = parts.slice(1).join(".")

      const parentMapping = mappings.get(parentId)
      if (parentMapping !== undefined) {
        // Parent is active, use its new ID as prefix
        const newId = `${parentMapping.newId}.${suffix}`
        mappings.set(bead.id, {
          oldId: bead.id,
          newId,
          scope: parentMapping.scope,
          bead,
        })
      } else if (parentMapping === undefined) {
        // Parent is closed/not active, flatten hierarchy
        const scope = inferScope(bead)
        const nextN = getNextNumber(db, scope, mappings)
        const newId = `km-${scope}-${nextN}`

        mappings.set(bead.id, {
          oldId: bead.id,
          newId,
          scope,
          bead,
        })
      }
    }
  }

  return Array.from(mappings.values())
}

/**
 * Update database with new IDs
 */
function updateDatabase(db: Database, mappings: IDMapping[]): void {
  db.run("BEGIN TRANSACTION")

  try {
    // Update issues table
    for (const mapping of mappings) {
      db.run("UPDATE issues SET id = ? WHERE id = ?", [
        mapping.newId,
        mapping.oldId,
      ])
    }

    // Update dependencies table (both sides)
    for (const mapping of mappings) {
      db.run("UPDATE dependencies SET issue_id = ? WHERE issue_id = ?", [
        mapping.newId,
        mapping.oldId,
      ])
      db.run(
        "UPDATE dependencies SET depends_on_id = ? WHERE depends_on_id = ?",
        [mapping.newId, mapping.oldId],
      )
    }

    db.run("COMMIT")
    console.log("✓ Database updated successfully")
  } catch (error) {
    db.run("ROLLBACK")
    throw error
  }
}

/**
 * Update JSONL file with new IDs
 */
function updateJSONL(mappings: IDMapping[]): void {
  const lines = readFileSync(ISSUES_JSONL, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
  const oldToNew = new Map(mappings.map((m) => [m.oldId, m.newId]))

  const updated = lines.map((line) => {
    const bead = JSON.parse(line) as { id: string; [key: string]: unknown }
    if (oldToNew.has(bead.id)) {
      const newId = oldToNew.get(bead.id)
      if (newId) {
        bead.id = newId
      }
    }
    return JSON.stringify(bead)
  })

  writeFileSync(ISSUES_JSONL, updated.join("\n") + "\n")
  console.log("✓ JSONL file updated successfully")
}

/**
 * Recursively find files matching extensions
 */
function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip node_modules and .git
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue
      }

      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, extensions))
      } else if (entry.isFile()) {
        const ext = entry.name.split(".").pop()
        if (ext && extensions.includes(ext)) {
          results.push(fullPath)
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return results
}

/**
 * Update references in code/doc files
 */
async function updateReferences(mappings: IDMapping[]): Promise<void> {
  const dirs = [
    join(REPO_ROOT, "apps"),
    join(REPO_ROOT, "packages"),
    join(REPO_ROOT, "docs"),
    join(REPO_ROOT, ".claude"),
  ]

  const extensions = ["ts", "tsx", "md"]
  const oldToNew = new Map(mappings.map((m) => [m.oldId, m.newId]))
  let filesUpdated = 0
  let referencesUpdated = 0

  // Find all files
  const files: string[] = []
  for (const dir of dirs) {
    if (existsSync(dir)) {
      files.push(...findFiles(dir, extensions))
    }
  }

  console.log(`   Found ${files.length} files to check`)

  for (const file of files) {
    let content = readFileSync(file, "utf-8")
    let modified = false

    for (const [oldId, newId] of oldToNew) {
      // Use word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${oldId}\\b`, "g")
      const matches = content.match(regex)
      if (matches) {
        content = content.replace(regex, newId)
        referencesUpdated += matches.length
        modified = true
      }
    }

    if (modified) {
      writeFileSync(file, content)
      filesUpdated++
    }
  }

  console.log(
    `✓ Updated ${referencesUpdated} references across ${filesUpdated} files`,
  )
}

/**
 * Create backups
 */
function createBackups(): void {
  writeFileSync(`${BEADS_DB}.backup`, readFileSync(BEADS_DB))
  writeFileSync(`${ISSUES_JSONL}.backup`, readFileSync(ISSUES_JSONL))
  console.log("✓ Backups created (.backup files)")
}

/**
 * Print mapping table
 */
function printMappings(mappings: IDMapping[]): void {
  console.log("\n📋 ID Mappings:\n")
  console.log(
    "Old ID                    → New ID                   Scope      Title",
  )
  console.log("─".repeat(100))

  for (const mapping of mappings) {
    const oldId = mapping.oldId.padEnd(25)
    const newId = mapping.newId.padEnd(25)
    const scope = mapping.scope.padEnd(10)
    const title = mapping.bead.title.substring(0, 40)
    console.log(`${oldId} → ${newId} ${scope} ${title}`)
  }

  // Print scope summary
  const scopeCounts = new Map<string, number>()
  for (const mapping of mappings) {
    scopeCounts.set(mapping.scope, (scopeCounts.get(mapping.scope) || 0) + 1)
  }

  console.log("\n📊 Scope Summary:\n")
  for (const [scope, count] of Array.from(scopeCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${scope.padEnd(15)} ${count} beads`)
  }
  console.log(`\n  Total: ${mappings.length} beads\n`)
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Bead ID Migration Script\n")

  // Check files exist
  if (!existsSync(BEADS_DB)) {
    console.error(`Error: Database not found at ${BEADS_DB}`)
    process.exit(1)
  }

  if (!existsSync(ISSUES_JSONL)) {
    console.error(`Error: JSONL file not found at ${ISSUES_JSONL}`)
    process.exit(1)
  }

  // Load database
  const db = new Database(BEADS_DB)

  // Load active beads
  console.log("📥 Loading active beads...")
  const beads = loadActiveBeads(db)
  console.log(`   Found ${beads.length} active beads\n`)

  // Generate mappings
  console.log("🔄 Generating ID mappings...")
  const mappings = generateMappings(db, beads)
  printMappings(mappings)

  if (isDryRun) {
    console.log("✨ Dry run complete. Use --execute to apply changes.\n")
    db.close()
    return
  }

  // Execute migration
  console.log("💾 Creating backups...")
  createBackups()

  console.log("\n🔨 Applying migration...\n")

  console.log("  1. Updating database...")
  updateDatabase(db, mappings)

  console.log("  2. Updating JSONL file...")
  updateJSONL(mappings)

  console.log("  3. Updating code/doc references...")
  await updateReferences(mappings)

  db.close()

  console.log("\n✅ Migration complete!\n")
  console.log("Next steps:")
  console.log("  1. Verify: bd list --status open")
  console.log("  2. Test: bd show km-storage-1")
  console.log(
    '  3. Check: grep -r "km-[a-z0-9]\\{4,5\\}" apps/ packages/ docs/ .claude/',
  )
  console.log("\nIf issues occur, restore from backups:")
  console.log(`  cp ${BEADS_DB}.backup ${BEADS_DB}`)
  console.log(`  cp ${ISSUES_JSONL}.backup ${ISSUES_JSONL}\n`)
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error)
  process.exit(1)
})
