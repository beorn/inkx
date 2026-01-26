#!/usr/bin/env bun
/**
 * check-migration.ts - Verify Vault → Repo Migration Completeness
 *
 * Ensures no unexpected "vault" terminology remains in the codebase.
 * Run this to verify ADR-002 migration is complete.
 *
 * Usage:
 *   bun scripts/check-migration.ts        # Check and report
 *   bun scripts/check-migration.ts --fix  # Show what to fix (no auto-fix)
 */

import { Glob } from "bun"

// Patterns that are ALLOWED to contain "vault" (case-insensitive)
// Goal: Remove ALL vault terminology except truly necessary exceptions
const ALLOWED_PATTERNS = [
  // Deprecated backward-compat exports (these files exist to support gradual migration)
  /vault\.ts/, // The deprecated re-export file
  /vault-context\.tsx/, // File with backward-compat aliases

  // External references to OTHER systems' vaults (not ours)
  /obsidian/i,

  // Historical references in docs/ADRs (describing the migration itself)
  /docs\/adr/,
  /CHANGELOG/,

  // Test files testing the deprecated APIs
  /\.test\.ts/,
  /\.spec\.ts/,

  // Comments explicitly about the migration
  /Vault.*→.*Repo/i,
  /vault.*to.*repo/i,
]

// Directories to skip
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".km",
  "archive",
  // NOTE: .claude and vendor ARE searched - they should use Repo terminology
])

interface Finding {
  file: string
  line: number
  content: string
  reason?: string
}

async function main() {
  const args = process.argv.slice(2)
  const showFix = args.includes("--fix")

  console.log("Checking Vault → Repo migration completeness...\n")

  const findings: Finding[] = []
  const allowed: Finding[] = []

  // Find all .ts and .tsx files
  const glob = new Glob("**/*.{ts,tsx}")

  for await (const file of glob.scan(".")) {
    // Skip files in excluded directories
    const parts = file.split("/")
    if (parts.some((p) => SKIP_DIRS.has(p))) continue

    // Skip this script
    if (file === "scripts/check-migration.ts") continue

    // Read and search file
    const content = await Bun.file(file).text()
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || !/vault/i.test(line)) continue

      const finding: Finding = {
        file,
        line: i + 1,
        content: line.trim(),
      }

      // Check if this match is allowed
      const isAllowed = ALLOWED_PATTERNS.some((pattern) => {
        if (pattern.test(line) || pattern.test(file)) {
          finding.reason = `Matches allowed pattern: ${pattern}`
          return true
        }
        return false
      })

      if (isAllowed) {
        allowed.push(finding)
      } else {
        findings.push(finding)
      }
    }
  }

  // Report findings
  if (findings.length === 0) {
    console.log("✅ Migration complete! No unexpected 'vault' mentions found.\n")
    console.log(`   (${allowed.length} allowed mentions skipped)`)
    process.exit(0)
  }

  console.log(`❌ Found ${findings.length} unexpected 'vault' mention(s):\n`)

  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`)
    console.log(`    ${f.content}\n`)
  }

  if (showFix) {
    console.log("\nTo fix, update these comments/code to use 'Repo' instead of 'Vault'.")
    console.log("If a mention should be allowed, add a pattern to ALLOWED_PATTERNS.")
  }

  console.log(`\n${allowed.length} allowed mentions (deprecated exports, Obsidian refs, etc.)`)

  process.exit(1)
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
