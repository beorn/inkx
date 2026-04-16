/**
 * SOP tool definitions — the single source of truth for what tools run.
 *
 * Each task = one shell command whose output gets cached in .sop-cache/.
 * Domain checks in sop.ts map to these task IDs.
 * SKILL.md domain check lists should reference these same IDs.
 */

export interface SopTask {
  id: string
  label: string
  command: string
  /** Cache strategy:
   *  - "git"   = invalidate when HEAD or working-tree diff changes
   *  - number  = TTL in seconds (time-based expiry)
   *  - omitted = no caching, always run */
  cache?: "git" | number
  /** Task IDs that must complete before this one starts */
  deps?: string[]
}

// ─── Code tools ────────────────────────────────────────────────────────────

const tsc: SopTask = {
  id: "tsc",
  label: "typecheck",
  command: "bash packages/km-infra/scripts/typecheck/check.sh 2>&1",
  cache: "git",
  deps: ["lint"],
}

const lint: SopTask = {
  id: "lint",
  label: "lint + format",
  command: "bun fix 2>&1",
  // No cache — lint mutates files (--fix), must always run first
}

const testFast: SopTask = {
  id: "test-fast",
  label: "test suite",
  command: "bun run test:fast 2>&1 | tail -40",
  cache: "git",
  deps: ["lint"],
}

const complexity: SopTask = {
  id: "complexity",
  label: "complexity",
  command: "bun lint:complexity --brief 2>&1",
  cache: "git",
  deps: ["lint"],
}

const knip: SopTask = {
  id: "knip",
  label: "dead code + dep analysis",
  command: "bunx knip --no-progress 2>&1",
  cache: "git",
  deps: ["lint"],
}

const depcruise: SopTask = {
  id: "depcruise",
  label: "layer violations",
  command: "bun run lint:deps 2>&1",
  cache: "git",
  deps: ["lint"],
}

const typeCoverage: SopTask = {
  id: "type-coverage",
  label: "type coverage",
  command: "bun run lint:types 2>&1",
  cache: "git",
  deps: ["lint"],
}

// ─── Package tools ─────────────────────────────────────────────────────────

const npmRegistry: SopTask = {
  id: "npm-registry",
  label: "version drift",
  command: "bun npm-registry audit 2>&1",
  cache: 3600,
}

const releaseStatus: SopTask = {
  id: "release-status",
  label: "unreleased changes",
  command: "bun release status 2>&1",
  cache: "git",
}

const auditPackages: SopTask = {
  id: "audit-packages",
  label: "publishability",
  command: "bun packages/km-infra/scripts/audit-packages.ts 2>&1",
  cache: "git",
  deps: ["lint"],
}

const sherif: SopTask = {
  id: "sherif",
  label: "workspace consistency",
  command: "bun run lint:workspace 2>&1",
  cache: "git",
}

// ─── External / inbound tools ──────────────────────────────────────────────

const bunAudit: SopTask = {
  id: "bun-audit",
  label: "CVE scan",
  command: "bun audit --json 2>/dev/null || true",
  cache: 3600,
}

const ghIssues: SopTask = {
  id: "gh-issues",
  label: "untriaged issues",
  command: "gh issue list --repo beorn/km --state open --json number,title,labels --limit 50 2>&1",
  cache: 3600,
}

// ─── Backlog tools ─────────────────────────────────────────────────────────

const bdStale: SopTask = {
  id: "bd-stale",
  label: "stale beads",
  command: "bd stale 2>&1",
  cache: 600,
}

const bdOrphans: SopTask = {
  id: "bd-orphans",
  label: "orphan deps",
  command: "bd orphans 2>&1",
  cache: 600,
}

const bdPriority: SopTask = {
  id: "bd-priority",
  label: "P0/P1 drift",
  command: "bd list --status=open --priority=0 --priority=1 2>&1",
  cache: 600,
}

// ─── Site tools ────────────────────────────────────────────────────────────

const docLinks: SopTask = {
  id: "doc-links",
  label: "doc links",
  command: "bun run lint:links 2>&1",
  cache: "git",
}

const docFreshness: SopTask = {
  id: "doc-freshness",
  label: "doc freshness",
  command: [
    "for pkg in vendor/silvery vendor/flexily vendor/vterm vendor/ansi vendor/mdspec; do",
    '  if [ -d "$pkg" ]; then',
    "    name=$(basename $pkg)",
    '    doc_date=$(git log -1 --format=%ci -- "$pkg/docs" "$pkg/README.md" 2>/dev/null || echo "never")',
    '    pkg_date=$(git log -1 --format=%ci -- "$pkg/package.json" 2>/dev/null || echo "never")',
    '    echo "$name docs=$doc_date pkg=$pkg_date"',
    '    if [ "$pkg_date" \\> "$doc_date" ] 2>/dev/null; then',
    '      echo "  stale: $name docs older than package changes"',
    "    fi",
    "  fi",
    "done",
  ].join("\n"),
  cache: "git",
}

// ─── Security tools ────────────────────────────────────────────────────────

const secretScan: SopTask = {
  id: "secret-scan",
  label: "secret scan",
  command:
    'grep -rn "sk-[a-zA-Z0-9]\\{20,\\}\\|AKIA[A-Z0-9]\\{16\\}\\|ghp_[a-zA-Z0-9]\\{36\\}\\|gho_[a-zA-Z0-9]\\{36\\}\\|-----BEGIN.*PRIVATE KEY" --include="*.ts" --include="*.js" --include="*.json" --include="*.env" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.beads --exclude-dir=dist --exclude-dir=.km --exclude-dir=.claude --exclude=sop.ts --exclude=sop-tools.ts --exclude="*.lock" --exclude="*.jsonl" . 2>&1 || true',
  cache: "git",
  deps: ["lint"],
}

const lockfile: SopTask = {
  id: "lockfile",
  label: "lockfile integrity",
  command: "bun install --frozen-lockfile --dry-run 2>&1",
  cache: "git",
}

const nixFreshness: SopTask = {
  id: "nix-freshness",
  label: "nix freshness",
  command: [
    'python3 -c "',
    "import json, datetime, sys",
    "with open('flake.lock') as f:",
    "    lock = json.load(f)",
    "nixpkgs = lock['nodes'].get('nixpkgs', {}).get('locked', {})",
    "ts = nixpkgs.get('lastModified', 0)",
    "age = (datetime.datetime.now().timestamp() - ts) / 86400",
    "rev = nixpkgs.get('rev', '?')[:12]",
    "status = 'STALE' if age > 30 else 'ok'",
    "print(f'{status}: nixpkgs rev={rev} age={age:.0f}d')",
    "sys.exit(1 if age > 30 else 0)",
    '"',
  ].join("\n"),
  cache: 86400,
}

// ─── Packaging tools ───────────────────────────────────────────────────────

const bundleSizes: SopTask = {
  id: "bundle-sizes",
  label: "bundle sizes",
  command:
    'for d in vendor/*/; do [ -f "$d/package.json" ] && grep -q \'"private"\' "$d/package.json" 2>/dev/null && continue; name=$(basename "$d"); js=$(find "$d/dist" -name "*.mjs" -o -name "*.js" 2>/dev/null | xargs cat 2>/dev/null | wc -c); echo "$((js/1024))K\\t$name"; done | sort -rn',
  cache: "git",
}

const zeroDep: SopTask = {
  id: "zero-dep",
  label: "zero-dep check",
  command: 'grep -l \'"dependencies"\' vendor/*/package.json 2>/dev/null || true',
  cache: "git",
}

const cjsEsm: SopTask = {
  id: "cjs-esm",
  label: "CJS/ESM compat",
  // Per vendor-scope rule (_sop-rules.md): all public vendor packages are
  // first-class workspace members and need attw verification. Walk each
  // vendor/* directory with a public package.json and pack it through attw.
  command: [
    "for d in vendor/*/; do",
    '  [ -f "$d/package.json" ] || continue',
    '  grep -q \'"private":\\s*true\' "$d/package.json" 2>/dev/null && continue',
    '  name=$(basename "$d")',
    '  result=$(bunx --bun @arethetypeswrong/cli --pack "$d" --format=ascii 2>&1 | grep -E "(Resolution|Pass|FAIL|✓|💀|⚠️)" | head -8 || echo "  (no output)")',
    '  echo "── $name ──"',
    '  echo "$result"',
    "done",
  ].join("\n"),
  cache: "git",
}

// ─── Infra tools ───────────────────────────────────────────────────────────

const ciHealth: SopTask = {
  id: "ci-health",
  label: "CI health",
  command: "gh run list --repo beorn/km --limit 5 --json status,conclusion,name 2>&1",
  cache: 3600,
}

const hookIntegrity: SopTask = {
  id: "hook-integrity",
  label: "hook integrity",
  command: "ls .claude/hooks/ 2>&1",
  cache: "git",
}

const toolVersions: SopTask = {
  id: "tool-versions",
  label: "tool versions",
  command:
    "echo '--- bun ---' && bun --version 2>&1; echo '--- oxlint ---' && bunx oxlint --version 2>&1; echo '--- tsdown ---' && bunx tsdown --version 2>&1",
  cache: 86400,
}

// ─── Legal tools ───────────────────────────────────────────────────────────

const licenseFiles: SopTask = {
  id: "license-files",
  label: "LICENSE files",
  command: 'for d in vendor/*/; do [ -f "$d/LICENSE" ] || echo "MISSING: $d"; done 2>&1',
  cache: "git",
}

const depLicenses: SopTask = {
  id: "dep-licenses",
  label: "dep licenses",
  command: "npx license-checker --production --summary 2>&1 | head -30",
  cache: 86400,
}

// ─── Task registry ─────────────────────────────────────────────────────────

export const TASKS: SopTask[] = [
  // Phase 0: mutating (no cache, runs first)
  lint,
  // Phase 1: code-dependent (cache: "git", deps: ["lint"])
  tsc, testFast, complexity, knip, depcruise, typeCoverage,
  auditPackages, secretScan,
  // Phase 1: code-dependent (cache: "git", no lint dep)
  releaseStatus, sherif, lockfile, docLinks, docFreshness,
  bundleSizes, zeroDep, cjsEsm, hookIntegrity, licenseFiles,
  // Phase 1: external (cache: TTL)
  bunAudit, ghIssues, bdStale, bdOrphans, bdPriority,
  ciHealth, npmRegistry, nixFreshness, toolVersions, depLicenses,
]

export const TASK_MAP = new Map(TASKS.map((t) => [t.id, t]))

// ─── Domain → tool mapping ─────────────────────────────────────────────────

/** Which tools each domain needs. One tool can serve multiple domains. */
export const DOMAIN_TOOLS: Record<string, string[]> = {
  code: ["tsc", "lint", "test-fast", "complexity", "knip", "depcruise", "type-coverage"],
  packages: ["npm-registry", "release-status", "audit-packages", "knip", "sherif"],
  inbound: ["gh-issues", "bun-audit"],
  backlog: ["bd-stale", "bd-orphans", "bd-priority"],
  sites: ["doc-links", "doc-freshness"],
  security: ["bun-audit", "secret-scan", "lockfile", "nix-freshness"],
  packaging: ["bundle-sizes", "zero-dep", "cjs-esm"],
  infra: ["ci-health", "hook-integrity", "tool-versions"],
  legal: ["license-files", "dep-licenses"],
}
