#!/usr/bin/env bun
/**
 * injection-gate — PreToolUse authority gate for Claude Code.
 *
 * The structural backstop for km-ambot. Even if prompt-confusion survives
 * (and it will), mutating tool calls (Write / Edit / MultiEdit / Bash)
 * get blocked when the candidate content can only be traced back to
 * injected recall spans rather than user-typed text.
 *
 * Works in tandem with `@bearly/injection-envelope`:
 *   - At UserPromptSubmit time, `wrapInjectedContext({sessionId, typedUserText, items})`
 *     writes a `TurnManifest` to $BEARLY_SESSIONS_DIR/turn-manifest-<sid>.json
 *     with typed entities/shingles/explicit-write-auth + the untrusted
 *     recall spans (each with its own entities/shingles).
 *   - At PreToolUse time, this hook reads the manifest and inspects the
 *     pending tool's args. It emits a `permissionDecision: "deny"` when
 *     the heuristics flag injection-driven authority.
 *
 * Gate logic (deterministic, no model calls):
 *
 *   (A) No manifest / no injected spans / non-mutating tool → allow.
 *   (B) Candidate output contains entities present ONLY in injected
 *       spans (not in typed text) → deny.
 *   (C) Lexical shingle overlap: candidate ↔ injected is strictly
 *       greater than candidate ↔ typed AND the user did not give
 *       explicit write authorization → deny.
 *   (D) No explicit write auth + any injection present + tool is a
 *       mutation → deny.
 *
 * The deny reason always names the problematic entities so the user
 * can reply "proceed — I do want that" and it goes through.
 *
 * See km-bearly.injection-gate-pretooluse for the design trade-offs.
 */

import { readFileSync } from "node:fs"

import {
  readTurnManifest,
  extractEntities,
  extractShingles,
  type TurnManifest,
} from "../vendor/bearly/plugins/injection-envelope/src/index.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GateInput {
  /** Claude Code session id — keys the turn-manifest lookup. */
  session_id: string
  /** Tool name from PreToolUse payload (Write, Edit, MultiEdit, Bash, Read, …). */
  tool_name: string
  /** Raw tool_input object — Claude Code passes this through unchanged. */
  tool_input: Record<string, unknown>
}

export type Permission = "allow" | "ask" | "deny"

export interface GateDecision {
  permissionDecision: Permission
  /** Human-readable explanation. Shown to the user on deny/ask. */
  permissionDecisionReason: string
  /**
   * Structured audit fields. Not part of Claude Code's schema, but we include
   * them so tests can assert WHY the gate made its call. Serialised below
   * as a comment on the real hook output.
   */
  debug?: {
    reasonCode: string
    recallOnlyEntities?: string[]
    candidateInjectedOverlap?: number
    candidateTypedOverlap?: number
  }
}

// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

const MUTATING_TOOLS: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"])

/** Regex tokens in a bash command that count as destructive / mutating. */
const DESTRUCTIVE_BASH_RE =
  /\b(rm\s+-r?f?|rmdir|mv\s+[^\s]+\s+[^\s]+|cp\s+[^\s]+\s+[^\s]+|dd\s+|truncate\s+|>>?\s*\/(?!dev\/(?:null|stderr|stdout)\b|tmp\/)|tee\s+|chmod\s+|chown\s+|mkfs\b|dd\s+of=|git\s+(?:reset\s+--hard|checkout\s+\.|clean\s+-[fdx]|push\s+--force|stash\b)|npm\s+publish\b|pnpm\s+publish\b|curl\s+[^|]*\|\s*(sh|bash|zsh)\b|wget\s+[^|]*\|\s*(sh|bash|zsh)\b)/i

function isMutatingTool(toolName: string, toolInput: Record<string, unknown>): boolean {
  if (MUTATING_TOOLS.has(toolName)) return true
  if (toolName === "Bash") {
    const cmd = typeof toolInput.command === "string" ? toolInput.command : ""
    return DESTRUCTIVE_BASH_RE.test(cmd)
  }
  return false
}

/**
 * Pull the string(s) from tool_input that represent the CONTENT we care
 * about — the bit that ends up on disk or executed. For Write this is the
 * body; for Edit it's the new_string; for Bash it's the command.
 */
function extractCandidateText(toolName: string, toolInput: Record<string, unknown>): string {
  const pieces: string[] = []
  const push = (v: unknown): void => {
    if (typeof v === "string") pieces.push(v)
  }
  switch (toolName) {
    case "Write":
      push(toolInput.content)
      push(toolInput.file_path)
      break
    case "Edit":
      push(toolInput.new_string)
      push(toolInput.file_path)
      break
    case "MultiEdit":
      push(toolInput.file_path)
      if (Array.isArray(toolInput.edits)) {
        for (const e of toolInput.edits as Array<{ new_string?: unknown }>) {
          push(e.new_string)
        }
      }
      break
    case "Bash":
      push(toolInput.command)
      break
    case "NotebookEdit":
      push(toolInput.new_source)
      push(toolInput.notebook_path)
      break
    default:
      // Non-mutating — don't inspect deeply
      for (const v of Object.values(toolInput)) push(v)
  }
  return pieces.join("\n")
}

// ---------------------------------------------------------------------------
// Heuristic comparators
// ---------------------------------------------------------------------------

/** Entities present in ANY injected span but NOT in typed text. */
function recallOnlyEntities(manifest: TurnManifest): Set<string> {
  const typed = new Set(manifest.typedEntities.map((e) => e.toLowerCase()))
  const recallOnly = new Set<string>()
  for (const span of manifest.untrustedRecall) {
    for (const e of span.entities) {
      const lc = e.toLowerCase()
      if (!typed.has(lc)) recallOnly.add(lc)
    }
  }
  return recallOnly
}

/** Count shingles that appear in BOTH the candidate and `other`. */
function shingleOverlap(candidate: Set<string>, other: string[]): number {
  let n = 0
  for (const s of other) if (candidate.has(s)) n++
  return n
}

/** Flatten injected shingles across all spans. */
function allInjectedShingles(manifest: TurnManifest): string[] {
  const out: string[] = []
  for (const span of manifest.untrustedRecall) {
    for (const s of span.shingles) out.push(s)
  }
  return out
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

export function evaluateGate(input: GateInput): GateDecision {
  // (A-0) Non-mutating tools are always allowed — the gate only scopes to
  // tools that write to disk or execute destructive shell.
  if (!isMutatingTool(input.tool_name, input.tool_input)) {
    return {
      permissionDecision: "allow",
      permissionDecisionReason: "non-mutating tool",
      debug: { reasonCode: "non-mutating" },
    }
  }

  // (A-1) No manifest — envelope didn't run this turn. Degrade to allow
  // rather than over-block. The envelope-emit side always writes a
  // manifest for substantive prompts; absence means the prompt was
  // trivial (no recall hits) OR this is happening outside a hook context
  // (e.g. a detached Claude Code session without the hooks wired up).
  const manifest = readTurnManifest(input.session_id)
  if (!manifest) {
    return {
      permissionDecision: "allow",
      permissionDecisionReason: "no turn manifest — envelope did not run",
      debug: { reasonCode: "no-manifest" },
    }
  }

  // (A-2) Manifest with no injected spans — nothing to guard against.
  if (manifest.untrustedRecall.length === 0) {
    return {
      permissionDecision: "allow",
      permissionDecisionReason: "no injected recall this turn",
      debug: { reasonCode: "no-recall" },
    }
  }

  const candidate = extractCandidateText(input.tool_name, input.tool_input)
  if (!candidate) {
    return {
      permissionDecision: "allow",
      permissionDecisionReason: "no candidate text to inspect",
      debug: { reasonCode: "no-candidate" },
    }
  }

  const candidateEntities = new Set(extractEntities(candidate).map((e) => e.toLowerCase()))
  const candidateShingles = new Set(extractShingles(candidate))
  const recallOnly = recallOnlyEntities(manifest)

  // (B) Entity check — candidate references entities that live ONLY in
  // injected spans, not in typed text. This is the strongest signal: the
  // model is about to write content whose specifics can't be attributed
  // to anything the user actually said.
  const hitEntities: string[] = []
  for (const e of candidateEntities) {
    if (recallOnly.has(e)) hitEntities.push(e)
  }
  if (hitEntities.length > 0) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `Blocked: about to write content referencing ${hitEntities
          .slice(0, 5)
          .map((e) => `"${e}"`)
          .join(", ")} — ` +
        `those entities came from retrieved recall spans, not your typed message. ` +
        `Reply "proceed" to authorize or clarify what you want.`,
      debug: { reasonCode: "recall-only-entity", recallOnlyEntities: hitEntities },
    }
  }

  // (C) Shingle overlap — candidate body overlaps the injected spans
  // much more than the typed text. Only fires when the user did not
  // explicitly authorize a write.
  const injectedOverlap = shingleOverlap(candidateShingles, allInjectedShingles(manifest))
  const typedOverlap = shingleOverlap(candidateShingles, manifest.typedShingles)
  if (!manifest.explicitWriteAuth && injectedOverlap > 0 && injectedOverlap > typedOverlap * 2) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `Blocked: proposed content overlaps injected recall (${injectedOverlap} shingles) ` +
        `much more than your typed message (${typedOverlap}). ` +
        `Reply "proceed" to authorize if this really is what you want.`,
      debug: {
        reasonCode: "shingle-overlap",
        candidateInjectedOverlap: injectedOverlap,
        candidateTypedOverlap: typedOverlap,
      },
    }
  }

  // (D) Final guard: no explicit write authorization + injection present +
  // mutating tool. Allowed when typed text contained mutation verbs;
  // otherwise ask.
  if (!manifest.explicitWriteAuth) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason:
        `Blocked: your typed message did not ask for a write. ` +
        `Injected recall spans are present this turn — declining by default. ` +
        `Reply with an explicit "create/edit/write X" if you want to proceed.`,
      debug: { reasonCode: "no-write-auth" },
    }
  }

  return {
    permissionDecision: "allow",
    permissionDecisionReason: "explicit write auth + no recall-only entity overlap",
    debug: { reasonCode: "allow-explicit-auth" },
  }
}

// ---------------------------------------------------------------------------
// Hook entry point — reads Claude Code PreToolUse JSON from stdin,
// emits the permissionDecision envelope on stdout.
// ---------------------------------------------------------------------------

export function emitPreToolUseHookJson(decision: GateDecision): string {
  const out: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.permissionDecisionReason,
    },
  }
  return JSON.stringify(out)
}

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

function main(): void {
  const raw = readStdinSync()
  let input: GateInput = { session_id: "", tool_name: "", tool_input: {} }
  try {
    const parsed = JSON.parse(raw) as {
      session_id?: string
      tool_name?: string
      tool_input?: Record<string, unknown>
    }
    input = {
      session_id: parsed.session_id ?? "",
      tool_name: parsed.tool_name ?? "",
      tool_input: parsed.tool_input ?? {},
    }
  } catch {
    // No stdin or bad JSON — emit empty allow and let other hooks / claude
    // defaults take over.
    process.stdout.write("{}")
    return
  }

  const decision = evaluateGate(input)

  // On "allow" we emit plain {} — Claude Code then proceeds with its own
  // ask-for-permission logic. Emitting an explicit `permissionDecision: "allow"`
  // would bypass user confirmation for every Write, which is not what we want.
  if (decision.permissionDecision === "allow") {
    process.stdout.write("{}")
    return
  }

  process.stdout.write(emitPreToolUseHookJson(decision))
}

if (import.meta.main) main()
