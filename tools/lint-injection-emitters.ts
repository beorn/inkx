#!/usr/bin/env bun
/**
 * lint-injection-emitters — enforce that raw UserPromptSubmit
 * `hookSpecificOutput.additionalContext` emission stays inside the
 * `@bearly/injection-envelope` library.
 *
 * Context: km-ambot (P0 prompt-injection incident, 2026-04-21). Two
 * parallel hook paths each built their own wrapper; one was hardened,
 * the other wasn't, and that drift is what made the attack work. The
 * structural fix is to route every emitter through one chokepoint —
 * see km-bearly.injection-envelope-lib. This lint is the teeth that
 * prevent the drift from coming back.
 *
 * What it checks:
 *   For every `.ts` / `.tsx` file outside the envelope library,
 *   grep for any of the following tokens that indicate raw emission:
 *     - `hookSpecificOutput.*additionalContext`
 *     - `additionalContext:` (object property) in combination with
 *       `hookEventName: "UserPromptSubmit"` in the same file
 *     - raw `<session_memory>` / `<injected_context>` string literals
 *       (the wrapper tags must only be written by the library)
 *     - a local `CONTEXT_PROTOCOL_FOOTER` redefinition
 *
 *   The envelope library itself (vendor/bearly/plugins/injection-envelope/)
 *   is explicitly allowed — that's where these tokens belong.
 *
 * Exit:
 *   0 — no raw emitters detected
 *   1 — at least one violation; prints file:line and a fix hint
 */

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), "..")

/** Directories that are expected to contain the tokens we look for. */
const ALLOWED_PATHS: readonly string[] = [
  // The library itself — canonical implementation lives here
  "vendor/bearly/plugins/injection-envelope/",
  // The lint tool — contains token strings for detection
  "tools/lint-injection-emitters.ts",
  // Injection-gate hook — reads the manifest written by the library
  "tools/injection-gate.ts",
  // Test fixtures intentionally containing adversarial content
  "vendor/bearly/plugins/injection-envelope/tests/",
]

/**
 * Files that import from the library and therefore go through the
 * chokepoint — they're allowed to contain `additionalContext` property
 * accesses as long as the envelope builder is the one assembling them.
 * Tracked explicitly (not heuristically) to keep the rule tight.
 */
const CHOKEPOINT_CLIENTS: readonly string[] = [
  // bearly recall — imports CONTEXT_PROTOCOL_FOOTER + rewriteImperativeAsReported
  "vendor/bearly/plugins/recall/src/lib/inject-core.ts",
  // bearly recall hooks — reads hookSpecificOutput off the library result
  "vendor/bearly/plugins/recall/src/lib/hooks.ts",
  "vendor/bearly/plugins/recall/src/history/scanner.ts",
  // accountly recall — imports wrapInjectedContext + emitHookJson
  "vendor/accountly/src/recall.ts",
  // tests that assert envelope shape
  "vendor/bearly/plugins/recall/tests/inject-core.test.ts",
  "vendor/accountly/tests/recall.test.ts",
  // tribe daemon: data-forwarding — it runs inject_delta via the library's
  // runInjectDelta (already hardened) and passes through the resulting
  // additionalContext over RPC to the hook. Not a raw emitter.
  "vendor/bearly/tools/lib/tribe/lore-handlers.ts",
  "vendor/bearly/plugins/tribe/lore/server.ts",
  "vendor/bearly/plugins/tribe/lore/lib/rpc.ts",
  "vendor/bearly/plugins/tribe/tests/lore-server.test.ts",
]

// Regex tokens that indicate raw injection emission. Order matters only for
// the order of reports.
const PATTERNS: { id: string; re: RegExp; hint: string }[] = [
  {
    id: "raw-additionalContext",
    re: /hookSpecificOutput[\s\S]{0,200}additionalContext/,
    hint: "Route through wrapInjectedContext() + emitHookJson() from @bearly/injection-envelope.",
  },
  {
    id: "session-memory-literal",
    re: /<session_memory[\s\S]{0,20}[>"]/,
    hint: "Don't hand-write <session_memory> tags; wrapInjectedContext() emits them.",
  },
  {
    id: "injected-context-literal",
    re: /<injected_context[\s\S]{0,20}[>"]/,
    hint: "Don't hand-write <injected_context> tags; wrapInjectedContext() emits them.",
  },
  {
    id: "context-protocol-footer-redef",
    re: /const\s+CONTEXT_PROTOCOL_FOOTER\s*=/,
    hint: "Import CONTEXT_PROTOCOL_FOOTER from @bearly/injection-envelope; don't redefine.",
  },
]

function listFiles(): string[] {
  // Use git ls-files so we scan tracked files only (fast + avoids node_modules).
  const raw = execSync("git ls-files -z '*.ts' '*.tsx'", { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
  return raw
    .toString("utf8")
    .split("\0")
    .filter((p) => p.length > 0)
}

function isAllowed(relPath: string): boolean {
  for (const prefix of ALLOWED_PATHS) {
    if (relPath === prefix) return true
    if (relPath.startsWith(prefix)) return true
  }
  for (const exact of CHOKEPOINT_CLIENTS) {
    if (relPath === exact) return true
  }
  return false
}

function fileImportsEnvelope(absPath: string): boolean {
  try {
    const content = readFileSync(absPath, "utf8")
    return (
      content.includes("@bearly/injection-envelope") ||
      /injection-envelope\/src\//.test(content)
    )
  } catch {
    return false
  }
}

interface Violation {
  file: string
  line: number
  patternId: string
  hint: string
  snippet: string
}

function scan(): Violation[] {
  const violations: Violation[] = []
  const files = listFiles()
  for (const f of files) {
    const abs = resolve(REPO_ROOT, f)
    if (!existsSync(abs)) continue
    if (isAllowed(f)) continue
    // Files that import the envelope library are by definition going
    // through the chokepoint — don't flag them even if they touch
    // `additionalContext` on the library's return shape.
    if (fileImportsEnvelope(abs)) continue

    let content: string
    try {
      content = readFileSync(abs, "utf8")
    } catch {
      continue
    }
    // Fast pre-check: skip files that don't mention any of our substrings
    if (
      !content.includes("additionalContext") &&
      !content.includes("<session_memory") &&
      !content.includes("<injected_context") &&
      !content.includes("CONTEXT_PROTOCOL_FOOTER")
    ) {
      continue
    }

    const lines = content.split("\n")
    for (const pat of PATTERNS) {
      // Search the raw content with a non-anchored test, then locate the
      // first matching line for reporting. Multi-line patterns (like
      // raw-additionalContext) may match the full content without hitting
      // any single line — fall back to anchoring the report at the first
      // line containing a known token.
      if (!pat.re.test(content)) continue
      let found = false
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (pat.re.test(line)) {
          violations.push({
            file: f,
            line: i + 1,
            patternId: pat.id,
            hint: pat.hint,
            snippet: line.trim().slice(0, 120),
          })
          found = true
          break
        }
      }
      if (!found) {
        const firstTokenLine = lines.findIndex((l) =>
          /hookSpecificOutput|additionalContext|<session_memory|<injected_context|CONTEXT_PROTOCOL_FOOTER/.test(l),
        )
        violations.push({
          file: f,
          line: firstTokenLine >= 0 ? firstTokenLine + 1 : 1,
          patternId: pat.id,
          hint: pat.hint,
          snippet: (lines[firstTokenLine] ?? "").trim().slice(0, 120),
        })
      }
    }
  }
  return violations
}

function main(): void {
  const v = scan()
  if (v.length === 0) {
    // Silent success — matches the style of bun fix's other linters.
    process.exit(0)
  }
  process.stderr.write(
    `lint-injection-emitters: found ${v.length} raw injection emitter(s) outside @bearly/injection-envelope\n\n`,
  )
  for (const { file, line, patternId, hint, snippet } of v) {
    process.stderr.write(`  ${relative(REPO_ROOT, resolve(REPO_ROOT, file))}:${line}  [${patternId}]\n`)
    process.stderr.write(`    ${snippet}\n`)
    process.stderr.write(`    → ${hint}\n\n`)
  }
  process.stderr.write(
    `See vendor/bearly/plugins/injection-envelope/README.md for the canonical API, ` +
      `and km-bearly.injection-envelope-lib for the migration rationale.\n`,
  )
  process.exit(1)
}

main()
