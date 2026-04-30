#!/usr/bin/env bun
/**
 * Prepare a reviewable bead scope reorganization plan.
 *
 * This script does not mutate bead files and never executes renames. By
 * default it prints a dry-run plan. Use --write-output <file> to save the
 * generated `km bd rename <old-id> <new-id>` commands for the non-ambiguous
 * entries.
 *
 * Target model:
 * - km-owned work stays under @km/<scope>/<slug>
 * - independent packages/products move to top-level roots such as
 *   @silvery/<slug>, @flexily/<slug>, @code/<slug>, @bearly/<slug>
 */

import { Glob } from "bun"
type DecisionKind = "RENAME" | "REVIEW" | "SKIP"

interface BeadFile {
  path: string
  id: string
  scope: string
  slug: string
  title: string
  body: string
  status: "open" | "closed" | "unknown"
}

interface Decision {
  kind: DecisionKind
  bead: BeadFile
  targetId?: string
  targetPath?: string
  reason: string
}

const KM_SCOPES = new Set([
  "tui",
  "storage",
  "tree",
  "markdown",
  "core",
  "commands",
  "beads",
  "infra",
  "tools",
  "market",
  "docs",
  "testing",
  "architecture",
  "perf",
  "archive",
])

const EXTERNAL_SCOPE_ROOTS = new Map<string, string>([
  ["silvercode", "code"],
  ["silvery", "silvery"],
  ["inkx", "silvery"],
  ["inkz", "silvery"],
  ["flexily", "flexily"],
  ["flexx", "flexily"],
  ["vterm", "vterm"],
  ["termless", "termless"],
  ["tribe", "tribe"],
  ["bearly", "bearly"],
  ["bear", "bearly"],
  ["loggily", "loggily"],
  ["logger", "loggily"],
  ["mdtest", "mdspec"],
  ["mdspec", "mdspec"],
  ["terminfo", "terminfo"],
])

const TARGET_ROOTS = new Set([
  "km",
  "code",
  "silvery",
  "flexily",
  "vterm",
  "termless",
  "tribe",
  "bearly",
  "loggily",
  "mdspec",
  "terminfo",
  "infra",
])

const SOURCE_SCOPES = new Set(["inbox", "all", ...EXTERNAL_SCOPE_ROOTS.keys(), "infra"])
const LEGACY_SCOPE_RE = /^(?:inkx|inkz|flexx|tui1|tui2|term-[12]|rev.*|review.*|test.*)$/

const DEFAULT_COMMAND_OUTPUT = "bead-reorg-commands.sh"

function parseArgs(argv: string[]): { writeOutput?: string; help: boolean } {
  const parsed: { writeOutput?: string; help: boolean } = { help: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      parsed.help = true
    } else if (arg === "--write-output") {
      const file = argv[++i]
      if (!file) throw new Error("--write-output requires a file path")
      parsed.writeOutput = file
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function printHelp(): void {
  console.log(`Usage:
  bun scripts/prepare-bead-reorg.ts
  bun scripts/prepare-bead-reorg.ts --write-output ${DEFAULT_COMMAND_OUTPUT}

Dry-run is the default. The script only prints a plan and optionally writes
shell commands for REVIEWED rename candidates; it never executes commands or
edits bead markdown.`)
}

function parseFrontmatter(text: string): { frontmatter: string; body: string } {
  if (!text.startsWith("---\n")) return { frontmatter: "", body: text }
  const end = text.indexOf("\n---", 4)
  if (end === -1) return { frontmatter: "", body: text }
  return {
    frontmatter: text.slice(4, end),
    body: text.slice(end + 4),
  }
}

function parseScalar(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"))
  return match?.[1]?.trim()
}

function firstHeading(body: string): string {
  const line = body.split("\n").find((candidate) => candidate.startsWith("# "))
  return line?.replace(/^#\s+/, "").trim() ?? ""
}

function parseStatus(title: string, frontmatter: string): BeadFile["status"] {
  if (/^\[x\]/i.test(title) || /closed_at:/m.test(frontmatter) || /closeReason:/m.test(frontmatter)) {
    return "closed"
  }
  if (/^\[ \]/i.test(title)) return "open"
  return "unknown"
}

function scopeFromId(id: string): string | undefined {
  const match = id.match(/^@km\/([^/]+)(?:\/|$)/)
  return match?.[1]
}

function slugFromId(id: string): string | undefined {
  const match = id.match(/^@km\/[^/]+\/(.+)$/)
  return match?.[1]
}

async function loadBeads(): Promise<BeadFile[]> {
  const glob = new Glob("@km/**/*.md")
  const beads: BeadFile[] = []

  for await (const path of glob.scan(".")) {
    const text = await Bun.file(path).text()
    const { frontmatter, body } = parseFrontmatter(text)
    const id = parseScalar(frontmatter, "id")
    if (!id?.startsWith("@km/")) continue

    const scope = scopeFromId(id)
    const slug = slugFromId(id)
    if (!scope || !slug) continue

    const title = firstHeading(body)
    beads.push({
      path,
      id,
      scope,
      slug,
      title,
      body,
      status: parseStatus(title, frontmatter),
    })
  }

  return beads.sort((a, b) => a.id.localeCompare(b.id))
}

function shouldConsider(scope: string): boolean {
  return SOURCE_SCOPES.has(scope) || LEGACY_SCOPE_RE.test(scope)
}

interface ScopeScore {
  score: number
  reasons: string[]
}

function scoreScopes(bead: BeadFile): Map<string, ScopeScore> {
  const titleSlug = `${bead.slug}\n${bead.title}`.toLowerCase()
  const text = `${titleSlug}\n${bead.body}`.toLowerCase()
  const scores = new Map<string, ScopeScore>()

  const add = (scope: string, reason: string, weight = 1): void => {
    const current = scores.get(scope) ?? { score: 0, reasons: [] }
    current.score += weight
    current.reasons.push(reason)
    scores.set(scope, current)
  }

  const contains = (pattern: RegExp): boolean => pattern.test(text)
  const titleContains = (pattern: RegExp): boolean => pattern.test(titleSlug)

  if (contains(/apps\/silvercode|silvercode|agent-harness|claude-acp/) || titleContains(/\bacp\b/)) add("silvercode", "silvercode/ACP mention", 3)
  if (contains(/vendor\/silvery|\bsilvery\b|\binkx\b|\binkz\b/) || titleContains(/reconciler|dirty flag|sticky|terminal ui|tui framework/)) add("silvery", "silvery/inkx rendering mention", 3)
  if (contains(/vendor\/flexily|\bflexily\b|\bflexx\b/) || titleContains(/flexbox|yoga|layout engine|aligncontent|flexshrink|wraprev/)) add("flexily", "flexily/flexx layout mention", 3)
  if (contains(/apps\/km-tui|\bkm-tui\b|board\.tsx|cardcolumn/) || titleContains(/\btui\b|keyboard|navigation|visual scroll/)) add("tui", "km-tui/UI mention", 2)
  if (contains(/packages\/km-storage|\bkm-storage\b|state\.db|loadrepo/) || titleContains(/\bstorage\b|\bvault\b|\bsync\b|\bwatcher\b|\brepo\b/)) add("storage", "storage/repo mention", 2)
  if (contains(/packages\/km-tree|\bkm-tree\b/) || titleContains(/\btree\b|outliner|operation log|selection model/)) add("tree", "tree mention", 2)
  if (contains(/packages\/km-markdown|\bkm-markdown\b/) || titleContains(/markdown|parser|frontmatter|mdspec/)) add("markdown", "markdown/parser mention", 2)
  if (contains(/packages\/km-core|\bkm-core\b/) || titleContains(/\bcore\b|klink|domain object/)) add("core", "core/domain mention", 2)
  if (contains(/packages\/km-commands|\bkm-commands\b/) || titleContains(/command registry|keybinding|undo|redo/)) add("commands", "commands/keybinding mention", 2)
  if (contains(/packages\/km-beads|\bkm-beads\b/) || titleContains(/\bbeads?\b|bd cli|bd command|issue tracking|scope reorg/)) add("beads", "beads/bd mention", 3)
  if (titleContains(/\binfra\b|ci|worktree|hook|guardrail|release|npm|script consolidation|fuzz/)) add("infra", "infra/process mention", 1)
  if (contains(/scripts\//) || titleContains(/\btools?\b/)) add("tools", "tools/scripts mention", 2)
  if (titleContains(/\btribe\b|agent coordination|sub-?agent/)) add("tribe", "tribe/agent coordination mention", 2)
  if (contains(/\bbearly\b/)) add("bearly", "bearly mention")
  if (contains(/\bloggily\b/) || titleContains(/logging|debug_log|logger/)) add("loggily", "loggily/logging mention", 2)
  if (contains(/\btermless\b|terminal emulator|tty capture/)) add("termless", "termless/testing terminal mention")
  if (contains(/\bterminfo\b|termcap|terminal capability/)) add("terminfo", "terminfo mention")
  if (titleContains(/\bmarket\b|marketplace/)) add("market", "market mention", 2)
  if (titleContains(/\bdocs?\b|documentation|readme|adr|claude\.md|agents\.md/)) add("docs", "documentation mention", 2)
  if (titleContains(/\btests?\b|testing|vitest|mdtest|visual testing|regression|fixture/)) add("testing", "testing mention", 2)
  if (titleContains(/\barchitecture\b|design doc|refactor|adr|layer|boundary/)) add("architecture", "architecture/refactor mention", 1)
  if (titleContains(/\bperf\b|performance|benchmark|bench|slow|latency|startup/)) add("perf", "performance mention", 2)
  if (titleContains(/\barchive\b|superseded|legacy cleanup/)) add("archive", "archive/superseded mention", 2)

  return scores
}

type TargetScope = {
  root: string
  scope?: string
}

function targetIdFor(bead: BeadFile, target: TargetScope): string {
  if (target.root === "km") return `@km/${target.scope}/${bead.slug}`
  return `@${target.root}/${bead.slug}`
}

function inferLegacyScope(bead: BeadFile): { target?: TargetScope; reason: string } {
  const externalRoot = EXTERNAL_SCOPE_ROOTS.get(bead.scope)
  if (externalRoot) {
    return {
      target: { root: externalRoot },
      reason: bead.scope === externalRoot
        ? `external ${bead.scope} scope moves out of @km`
        : `legacy ${bead.scope} scope maps to @${externalRoot}`,
    }
  }
  if (bead.scope === "tui1" || bead.scope === "tui2") return { target: { root: "km", scope: "tui" }, reason: `legacy ${bead.scope} scope maps to @km/tui` }
  if (/^test/.test(bead.scope)) return { target: { root: "km", scope: "testing" }, reason: `legacy ${bead.scope} scope maps to @km/testing` }
  return { reason: `legacy ${bead.scope} scope has no unconditional target` }
}

function chooseTargetScope(bead: BeadFile): { target?: TargetScope; reason: string } {
  const legacy = inferLegacyScope(bead)
  if (legacy.target) return legacy

  const scores = scoreScopes(bead)
  if (bead.scope.startsWith("rev") || bead.scope.startsWith("review")) {
    const allowedReviewScopes = ["docs", "testing", "architecture", "perf"] as const
    const reviewHits = allowedReviewScopes.filter((scope) => scores.has(scope))
    if (reviewHits.length === 1) {
      return { target: { root: "km", scope: reviewHits[0] }, reason: `legacy review scope with ${scores.get(reviewHits[0])!.reasons.join("; ")}` }
    }
    return {
      reason: reviewHits.length === 0
        ? "legacy review scope needs manual destination"
        : `legacy review scope matched multiple destinations: ${reviewHits.join(", ")}`,
    }
  }

  if (bead.scope === "all" || bead.scope === "inbox" || bead.scope === "term-1" || bead.scope === "term-2") {
    const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)
    if (ranked.length === 0 || ranked[0]![1].score < 2) return { reason: `${bead.scope} item has no strong scope signal` }
    if (ranked.length > 1 && ranked[0]![1].score === ranked[1]![1].score) {
      return { reason: `${bead.scope} item matched multiple destinations: ${ranked.map(([scope]) => scope).join(", ")}` }
    }
    const [scope, reasons] = ranked[0]!
    const externalRoot = EXTERNAL_SCOPE_ROOTS.get(scope)
    if (externalRoot) return { target: { root: externalRoot }, reason: reasons.reasons.join("; ") }
    return { target: { root: "km", scope }, reason: reasons.reasons.join("; ") }
  }

  if (bead.scope === "infra") {
    return { target: { root: "infra" }, reason: "cross-project infra scope moves out of @km" }
  }

  return { reason: `source scope ${bead.scope} is not part of this reorganization` }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function commandFor(decision: Decision): string {
  return `km bd rename ${shellQuote(decision.bead.id)} ${shellQuote(decision.targetId!)}`
}

function makeDecisions(beads: BeadFile[]): Decision[] {
  const existingIds = new Set(beads.map((bead) => bead.id))
  const plannedTargets = new Map<string, string>()
  const decisions: Decision[] = []

  for (const bead of beads) {
    if (!shouldConsider(bead.scope)) {
      decisions.push({ kind: "SKIP", bead, reason: "canonical or out-of-scope bead" })
      continue
    }

    const target = chooseTargetScope(bead)
    if (!target.target) {
      decisions.push({ kind: "REVIEW", bead, reason: target.reason })
      continue
    }

    if (!TARGET_ROOTS.has(target.target.root)) {
      decisions.push({ kind: "REVIEW", bead, reason: `inferred non-canonical root ${target.target.root}` })
      continue
    }

    if (target.target.root === "km" && (!target.target.scope || !KM_SCOPES.has(target.target.scope))) {
      decisions.push({ kind: "REVIEW", bead, reason: `inferred non-canonical @km scope ${target.target.scope}` })
      continue
    }

    const targetId = targetIdFor(bead, target.target)
    const targetPath = `${targetId.slice(1)}.md`
    if (targetId === bead.id) {
      decisions.push({ kind: "SKIP", bead, reason: "already in target scope" })
      continue
    }
    if (existingIds.has(targetId)) {
      decisions.push({ kind: "REVIEW", bead, targetId, targetPath, reason: `target already exists: ${targetId}` })
      continue
    }

    const previous = plannedTargets.get(targetId)
    if (previous) {
      decisions.push({ kind: "REVIEW", bead, targetId, targetPath, reason: `target also planned from ${previous}` })
      continue
    }

    plannedTargets.set(targetId, bead.id)
    decisions.push({ kind: "RENAME", bead, targetId, targetPath, reason: target.reason })
  }

  return decisions
}

function printPlan(decisions: Decision[]): void {
  const considered = decisions.filter((decision) => shouldConsider(decision.bead.scope))
  const renames = decisions.filter((decision) => decision.kind === "RENAME")
  const reviews = decisions.filter((decision) => decision.kind === "REVIEW")
  const skips = decisions.filter((decision) => decision.kind === "SKIP")

  console.log("Bead reorganization plan (dry run)")
  console.log(`Scanned: ${decisions.length} bead files`)
  console.log(`Considered source/legacy scopes: ${considered.length}`)
  console.log(`RENAME: ${renames.length}`)
  console.log(`REVIEW: ${reviews.length}`)
  console.log(`SKIP: ${skips.length}`)
  console.log("")

  console.log("Commands to review:")
  if (renames.length === 0) {
    console.log("  (none)")
  } else {
    for (const decision of renames) {
      console.log(`  ${commandFor(decision)}`)
      console.log(`    # ${decision.reason}; ${decision.bead.path} -> ${decision.targetPath}`)
    }
  }

  console.log("")
  console.log("REVIEW required:")
  if (reviews.length === 0) {
    console.log("  (none)")
  } else {
    for (const decision of reviews) {
      const target = decision.targetId ? ` -> ${decision.targetId}` : ""
      console.log(`  ${decision.bead.id}${target}`)
      console.log(`    # ${decision.reason}; ${decision.bead.path}`)
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const beads = await loadBeads()
  const decisions = makeDecisions(beads)
  printPlan(decisions)

  if (args.writeOutput) {
    const commands = decisions
      .filter((decision) => decision.kind === "RENAME")
      .map(commandFor)
    const output = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      "# Review before running. Generated by scripts/prepare-bead-reorg.ts.",
      ...commands,
      "",
    ].join("\n")

    await Bun.write(args.writeOutput, output)
    console.log("")
    console.log(`Wrote ${commands.length} command(s) to ${args.writeOutput}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
