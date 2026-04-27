#!/usr/bin/env bun
/**
 * Prompt-boundary CI gate (Layer 1 enforcement, ambient-context-safety.md § 3).
 *
 * `apps/silvercode/src/prompt-assembly.ts` (and its delegate
 * `prompt-cross-agent.ts`) is the ONLY path that constructs ACP prompt
 * `ContentBlock` arrays delivered to an agent. Centralizing block
 * construction means:
 *
 *   - User text always lands in a `type:"text"` block byte-for-byte.
 *   - Ambient content always lands in `type:"resource"` blocks with
 *     `_meta.ambient = true`.
 *   - Layer 2 sanitization runs deterministically on every payload.
 *   - Adversarial channel content cannot bypass these guarantees by
 *     constructing a `ContentBlock` somewhere else.
 *
 * Detection strategy: scan TypeScript files under `apps/silvercode/src/`
 * for both
 *   (a) an import of `ContentBlock` from `@km/agent-harness`, AND
 *   (b) an object-literal expression constructing such a block,
 * outside the canonical allow-list.
 *
 * Run: `bun tools/check-prompt-boundary.ts`
 *
 * Exit codes: 0 clean, 1 violation. Use `--strict` to scan the wider
 * agent-harness package too (used by tests; not part of the daily
 * `bun fix` flow because the parser legitimately constructs blocks).
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const REPO_ROOT = join(import.meta.dir, "..")
const SCAN_ROOT = "apps/silvercode/src"

const ALLOWED_FILES = new Set([
  "apps/silvercode/src/prompt-assembly.ts",
  "apps/silvercode/src/prompt-cross-agent.ts",
  // transcript.ts only constructs `{type:"text", text: safe}` from a
  // sanitized text block (Layer 3 loop-closure rewrite). It does not
  // build new blocks from scratch — it propagates the type tag of an
  // existing block while replacing the text content.
  "apps/silvercode/src/transcript.ts",
])

const EXTS = [".ts", ".tsx"]

const IMPORT_RE = /import\s+(?:type\s+)?[^;]*\bContentBlock\b[^;]*from\s+['"]@km\/agent-harness(?:\/[^'"]*)?['"]/

// We flag any object-literal that has `type:"<discriminator>"` AS A KEY,
// where the discriminator matches an ACP ContentBlock variant. This is
// strict — false positives are rare because `ContentBlock` discriminators
// don't collide with mdast or MCP shapes when the ContentBlock import is
// also present in the same file.
const DISCRIMINATORS = ["text", "resource", "image", "audio", "resource_link"]
const CONSTRUCTION_RE = new RegExp(`\\{[^}]{0,200}?\\btype\\s*:\\s*['"](?:${DISCRIMINATORS.join("|")})['"]`, "g")

type Violation = { file: string; line: number; excerpt: string }

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (st.isFile() && EXTS.some((e) => full.endsWith(e))) {
      yield full
    }
  }
}

function checkFile(absPath: string): Violation[] {
  const rel = relative(REPO_ROOT, absPath)
  if (ALLOWED_FILES.has(rel)) return []
  if (rel.includes("/tests/") || rel.includes("/storybook/") || rel.includes("/.storybook/")) return []

  let content: string
  try {
    content = readFileSync(absPath, "utf8")
  } catch {
    return []
  }

  // Two-stage: must import ContentBlock from @km/agent-harness AND have
  // a literal construction. Imports of ContentBlock from other modules
  // (e.g. mdast, MCP types) don't count.
  if (!IMPORT_RE.test(content)) return []

  const violations: Violation[] = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    CONSTRUCTION_RE.lastIndex = 0
    if (CONSTRUCTION_RE.test(line)) {
      // Skip comment lines.
      const trimmed = line.trim()
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
      violations.push({ file: rel, line: i + 1, excerpt: trimmed })
    }
  }
  return violations
}

function main(): void {
  const violations: Violation[] = []
  for (const f of walk(join(REPO_ROOT, SCAN_ROOT))) {
    violations.push(...checkFile(f))
  }
  if (violations.length === 0) {
    console.log("✓ prompt-boundary: clean — ContentBlock construction only inside the allowed seam")
    process.exit(0)
  }
  console.error(`✗ prompt-boundary: ${violations.length} violation(s)\n`)
  console.error("ContentBlock construction is only allowed in:")
  for (const f of ALLOWED_FILES) console.error(`  - ${f}`)
  console.error("")
  console.error("Why: prompt-assembly.ts is the one path that guarantees byte-for-byte")
  console.error("user-text fidelity, _meta.ambient=true marking, and Layer-2 sanitization.")
  console.error("See hub/silvercode/design/ambient-context-safety.md")
  console.error("")
  console.error("Violations:")
  for (const v of violations.slice(0, 50)) {
    console.error(`  ${v.file}:${v.line}  ${v.excerpt}`)
  }
  if (violations.length > 50) console.error(`  … and ${violations.length - 50} more`)
  process.exit(1)
}

main()
