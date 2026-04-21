#!/usr/bin/env bun
/**
 * verify-collapse-parse.ts — synthetic before/after benchmark
 *
 * Builds a small tmp vault that mimics the shape of `~/Bear/Vault`:
 *   raw/chats/*.md           → large transcripts
 *   archive/Asana/*.md       → mega-files
 *   projects/*.md, notes.md  → ordinary content
 *
 * Loads the same directory twice — once without collapse-parse (baseline),
 * once with `["raw/chats/**", "archive/**"]` — and prints node counts.
 *
 * This is not a replacement for running against the real vault, but it
 * validates the mechanism end-to-end and shows the expected 80-90% drop.
 *
 * Usage:
 *   bun scripts/verify-collapse-parse.ts
 */

import { Database } from "bun:sqlite"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../packages/km-storage/src/db/schema.ts"
import { loadRepo } from "../packages/km-storage/src/repo/loader.ts"
import { createCollapseParseMatcher } from "../packages/km-storage/src/markdown/collapse-parse.ts"

function makeChatTranscript(sessionId: string): string {
  const parts: string[] = [`# Chat Session ${sessionId}\n`]
  for (let i = 0; i < 30; i++) {
    parts.push(`## Turn ${i}\n`)
    parts.push(`### User\n\n- prompt line 1\n- prompt line 2\n- prompt line 3\n- prompt line 4\n`)
    parts.push(
      `### Assistant\n\n- answer line 1\n- answer line 2\n- answer line 3\n- answer line 4\n- answer line 5\n`,
    )
  }
  return parts.join("\n")
}

function makeAsanaExport(): string {
  const parts: string[] = [`# Asana Export\n`]
  for (let i = 0; i < 50; i++) {
    parts.push(`## Project ${i}\n`)
    for (let j = 0; j < 8; j++) {
      parts.push(`### Task ${i}.${j}\n\n- subtask a\n- subtask b\n- subtask c\n`)
    }
  }
  return parts.join("\n")
}

function buildFakeVault(): string {
  const root = mkdtempSync(join(tmpdir(), "km-cp-verify-"))
  mkdirSync(join(root, "raw", "chats"), { recursive: true })
  mkdirSync(join(root, "archive", "Asana"), { recursive: true })
  mkdirSync(join(root, "projects"), { recursive: true })
  mkdirSync(join(root, "notes"), { recursive: true })

  // 12 chat transcripts (emulates raw/chats sink at smaller scale)
  for (let i = 0; i < 12; i++) {
    writeFileSync(join(root, "raw", "chats", `2026-03-${String(i + 1).padStart(2, "0")}-session.md`), makeChatTranscript(String(i)))
  }

  // 2 Asana mega-files
  writeFileSync(join(root, "archive", "Asana", "pers-prod.md"), makeAsanaExport())
  writeFileSync(join(root, "archive", "Asana", "person-bjorn.md"), makeAsanaExport())

  // A few ordinary project + note files
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(root, "projects", `project-${i}.md`), `# Project ${i}\n\n## Goals\n\n- a\n- b\n- c\n`)
  }
  writeFileSync(join(root, "notes", "meeting.md"), `# Meeting\n\n## Agenda\n\n- item 1\n- item 2\n`)

  return root
}

function countNodes(vaultRoot: string, patterns: string[]): number {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  const collapseMatcher = patterns.length > 0 ? createCollapseParseMatcher(patterns) : undefined
  const gen = loadRepo(vaultRoot, { db, collapseMatcher })
  let r = gen.next()
  while (!r.done) r = gen.next()
  const count = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c
  db.close()
  return count
}

function main() {
  const vaultRoot = buildFakeVault()
  console.log(`fake vault: ${vaultRoot}`)

  const baseline = countNodes(vaultRoot, [])
  const collapsed = countNodes(vaultRoot, ["raw/chats/**", "archive/**"])

  const reduction = ((baseline - collapsed) / baseline) * 100

  console.log("")
  console.log("before (no collapse-parse): " + baseline.toLocaleString() + " nodes")
  console.log("after  (raw/chats + archive collapsed): " + collapsed.toLocaleString() + " nodes")
  console.log(`reduction: ${reduction.toFixed(1)}%`)
  console.log("")
  if (reduction < 50) {
    console.error("expected ≥50% reduction — something is off")
    process.exit(1)
  }
}

main()
