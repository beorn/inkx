#!/usr/bin/env bash
#
# scripts/bench-compare.sh — Run a bench at a historical commit and diff
# against the current HEAD.
#
# Why this script exists:
#   `git bisect` for performance is slow. We want a one-shot "how does HEAD
#   compare to <ref>" answer that runs the same bench in two worktrees and
#   prints a diff. The historical worktree is created at /tmp/km-bench-<sha>,
#   the bench runs there, and the worktree is removed afterward.
#
#   This script does NOT touch tribe (bench-now.sh handles that). It assumes
#   the caller already paused the tribe via `bench-now.sh` if needed.
#
# Usage:
#   scripts/bench-compare.sh HEAD~5
#   scripts/bench-compare.sh HEAD~5 apps/km-tui/tests/cursor-perf.bench.ts
#   KEEP_WORKTREE=1 scripts/bench-compare.sh HEAD~5    # don't remove worktree

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REF="${1:-}"
BENCH_FILE="${2:-apps/km-tui/tests/cursor-perf.bench.ts}"

if [[ -z "$REF" ]]; then
  echo "usage: scripts/bench-compare.sh <git-ref> [bench-file]" >&2
  echo "  example: scripts/bench-compare.sh HEAD~5" >&2
  exit 2
fi

REF_SHA="$(git rev-parse --short "$REF")"
HEAD_SHA="$(git rev-parse --short HEAD)"
WORKTREE="/tmp/km-bench-${REF_SHA}"

echo "==> bench-compare"
echo "    HEAD:      $HEAD_SHA"
echo "    ref:       $REF -> $REF_SHA"
echo "    bench:     $BENCH_FILE"
echo "    worktree:  $WORKTREE"
echo

# -----------------------------------------------------------------------------
# Cleanup helper — runs on exit unless KEEP_WORKTREE=1.
# -----------------------------------------------------------------------------

cleanup() {
  local exit_code=$?
  if [[ "${KEEP_WORKTREE:-}" == "1" ]]; then
    echo "==> Keeping worktree at $WORKTREE (KEEP_WORKTREE=1)"
    return $exit_code
  fi
  if [[ -d "$WORKTREE" ]]; then
    echo "==> Removing worktree $WORKTREE"
    git worktree remove --force "$WORKTREE" 2>/dev/null \
      || git worktree prune 2>/dev/null \
      || true
  fi
  return $exit_code
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Step 1: Create the historical worktree
# -----------------------------------------------------------------------------

if [[ -d "$WORKTREE" ]]; then
  echo "==> Worktree already exists, removing first"
  git worktree remove --force "$WORKTREE" 2>/dev/null || true
fi

echo "==> Creating worktree at $WORKTREE for $REF_SHA"
git worktree add --detach "$WORKTREE" "$REF_SHA" >/dev/null

# Init submodules in the worktree (vendor/silvery, vendor/bearly, etc).
# Skip vendor/internal which is private and may not be available.
echo "==> Initializing submodules in worktree"
(
  cd "$WORKTREE"
  git submodule update --init \
    vendor/silvery \
    vendor/bearly \
    vendor/loggily \
    vendor/flexily \
    vendor/vimonkey \
    vendor/termless 2>&1 | tail -5
) || echo "    (submodule init partially failed — proceeding)"

# Fall back to the parent repo's checked-out submodules for any vendor
# package the worktree couldn't fetch (e.g. because the ref's submodule
# pointer is an unpushed commit). This lets bench-compare work against
# arbitrary local-only commits at the cost of measuring the current
# submodule state instead of the ref's exact submodule state.
#
# We never delete existing content here — we only populate empty submodule
# directories. If the worktree already has content, leave it alone.
for pkg in silvery bearly loggily flexily vimonkey termless; do
  if [[ -d "$WORKTREE/vendor/$pkg" ]] \
    && [[ ! -f "$WORKTREE/vendor/$pkg/package.json" ]] \
    && [[ -z "$(ls -A "$WORKTREE/vendor/$pkg" 2>/dev/null)" ]] \
    && [[ -d "$REPO_ROOT/vendor/$pkg" ]]; then
    echo "==> Mirroring vendor/$pkg from parent (submodule unfetchable at ref)"
    cp -R "$REPO_ROOT/vendor/$pkg/." "$WORKTREE/vendor/$pkg/" 2>/dev/null || true
  fi
done

# Many ref branches won't have vt100 in .gitmodules — fall back to copying
# from the parent repo so bun install can resolve workspace deps.
if [[ ! -d "$WORKTREE/vendor/vt100/packages" ]]; then
  if [[ -d "$REPO_ROOT/vendor/vt100/packages" ]]; then
    echo "==> Copying vendor/vt100 from parent (worktree missing it)"
    mkdir -p "$WORKTREE/vendor/vt100"
    cp -R "$REPO_ROOT/vendor/vt100/." "$WORKTREE/vendor/vt100/"
  fi
fi

# -----------------------------------------------------------------------------
# Step 2: Install dependencies in the worktree
# -----------------------------------------------------------------------------

echo "==> Running bun install in worktree"
(
  cd "$WORKTREE"
  bun install 2>&1 | tail -5
) || {
  echo "    bun install failed in worktree — aborting"
  exit 1
}

# Some km commits (pre mdspec-submodule-removal) reference
# `mdspec/vitest-plugin` but mdspec is no longer an installable dependency.
# Mirror it from the first node_modules tree that has it — usually the
# main km checkout. This keeps bench-compare focused on measuring perf
# instead of debugging missing tooling.
if [[ ! -d "$WORKTREE/node_modules/mdspec" ]]; then
  MDSPEC_SRC=""
  for candidate in "$REPO_ROOT/node_modules/mdspec" "$HOME/Code/pim/km/node_modules/mdspec"; do
    if [[ -d "$candidate" ]]; then
      MDSPEC_SRC="$candidate"
      break
    fi
  done
  if [[ -n "$MDSPEC_SRC" ]]; then
    echo "==> Mirroring node_modules/mdspec from $MDSPEC_SRC"
    mkdir -p "$WORKTREE/node_modules/mdspec"
    cp -R "$MDSPEC_SRC/." "$WORKTREE/node_modules/mdspec/"
  else
    echo "    WARNING: mdspec not found — vitest.config.ts may fail to load"
  fi
fi

# -----------------------------------------------------------------------------
# Step 3: Generate build-info if the worktree needs it
# -----------------------------------------------------------------------------

if [[ -f "$WORKTREE/scripts/generate-build-info.ts" ]]; then
  (cd "$WORKTREE" && bun scripts/generate-build-info.ts >/dev/null 2>&1) || true
fi

# -----------------------------------------------------------------------------
# Step 4: Run the same bench in BOTH worktrees, capture phase data
# -----------------------------------------------------------------------------

run_bench() {
  local label="$1"
  local dir="$2"
  local outfile="$3"

  echo
  echo "==> [$label] Running $BENCH_FILE in $dir"
  (
    cd "$dir"
    rm -f "benchmarks/results/.last-phases.json" 2>/dev/null || true
    set +e
    bunx --bun vitest bench --run "$BENCH_FILE" 2>&1
    local rc=$?
    set -e
    return $rc
  ) > "$outfile" 2>&1 || echo "    (bench at $label exited non-zero — see $outfile)"
}

REF_OUT="/tmp/km-bench-${REF_SHA}.txt"
HEAD_OUT="/tmp/km-bench-${HEAD_SHA}.txt"
REF_PHASES="/tmp/km-bench-${REF_SHA}-phases.json"
HEAD_PHASES="/tmp/km-bench-${HEAD_SHA}-phases.json"

run_bench "ref:$REF_SHA" "$WORKTREE" "$REF_OUT"
[[ -f "$WORKTREE/benchmarks/results/.last-phases.json" ]] && cp "$WORKTREE/benchmarks/results/.last-phases.json" "$REF_PHASES"

run_bench "HEAD:$HEAD_SHA" "$REPO_ROOT" "$HEAD_OUT"
[[ -f "$REPO_ROOT/benchmarks/results/.last-phases.json" ]] && cp "$REPO_ROOT/benchmarks/results/.last-phases.json" "$HEAD_PHASES"

# -----------------------------------------------------------------------------
# Step 5: Diff the two outputs
# -----------------------------------------------------------------------------

echo
echo "==> Diff: per-bench mean (ref -> HEAD)"
bun -e '
const fs = require("node:fs")
// Vitest bench rows: " · NAME  hz  min  max  mean  p75  ..."
// Name and hz are separated by 2+ spaces; subsequent columns by single spaces.
function parse(path) {
  if (!fs.existsSync(path)) return new Map()
  const text = fs.readFileSync(path, "utf8")
  const out = new Map()
  for (const line of text.split("\n")) {
    const prefix = line.match(/^\s+·\s+(.+)$/)
    if (!prefix) continue
    const parts = prefix[1].split(/ {2,}/)
    if (parts.length < 2) continue
    const name = parts[0].trim()
    const nums = parts.slice(1).join("  ").split(/\s+/).filter(Boolean).map(s => parseFloat(s.replace(/,/g, "")))
    if (nums.length < 4) continue
    const mean = nums[3]
    if (Number.isFinite(mean)) out.set(name, mean)
  }
  return out
}
// bun -e: argv[0]=bun, argv[1..]=user args
const ref = parse(process.argv[1])
const head = parse(process.argv[2])
const names = new Set([...ref.keys(), ...head.keys()])
if (names.size === 0) { console.log("  (no benches matched in either output)"); process.exit(0) }
console.log("  " + "name".padEnd(36) + "  " + "ref ms".padStart(12) + "  " + "HEAD ms".padStart(12) + "  " + "delta".padStart(10))
console.log("  " + "-".repeat(36) + "  " + "-".repeat(12) + "  " + "-".repeat(12) + "  " + "-".repeat(10))
const sorted = Array.from(names).sort()
for (const name of sorted) {
  const r = ref.get(name)
  const h = head.get(name)
  const refStr = r === undefined ? "—".padStart(12) : r.toFixed(2).padStart(12)
  const headStr = h === undefined ? "—".padStart(12) : h.toFixed(2).padStart(12)
  let deltaStr = "—".padStart(10)
  if (r !== undefined && h !== undefined && r !== 0) {
    const delta = ((h - r) / r) * 100
    const sign = delta > 0 ? "+" : ""
    deltaStr = (sign + delta.toFixed(1) + "%").padStart(10)
  }
  console.log("  " + name.padEnd(36) + "  " + refStr + "  " + headStr + "  " + deltaStr)
}
' "$REF_OUT" "$HEAD_OUT"

# -----------------------------------------------------------------------------
# Step 6: Diff per-phase data if both files exist
# -----------------------------------------------------------------------------

if [[ -f "$REF_PHASES" ]] && [[ -f "$HEAD_PHASES" ]]; then
  echo
  echo "==> Diff: per-phase wall time (ref -> HEAD)"
  bun -e '
  const fs = require("node:fs")
  // bun -e: argv[0]=bun, argv[1..]=user args
  const ref = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const head = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  const refMap = new Map(ref.map(r => [r.name, r]))
  const headMap = new Map(head.map(r => [r.name, r]))
  const names = new Set([...refMap.keys(), ...headMap.keys()])
  for (const name of Array.from(names).sort()) {
    const r = refMap.get(name)
    const h = headMap.get(name)
    if (!r || !h) { console.log(`  ${name}  (missing in one side)`); continue }
    const ri = r.iterations || 1
    const hi = h.iterations || 1
    const refWall = r.wallMs / ri
    const headWall = h.wallMs / hi
    const refOutput = r.phases.output / ri
    const headOutput = h.phases.output / hi
    const refContent = r.phases.content / ri
    const headContent = h.phases.content / hi
    const refLayout = r.phases.layoutTotal / ri
    const headLayout = h.phases.layoutTotal / hi
    const fmt = (a, b) => {
      const d = ((b - a) / (a || 1)) * 100
      const sign = d > 0 ? "+" : ""
      return `${a.toFixed(1)}->${b.toFixed(1)}ms (${sign}${d.toFixed(1)}%)`
    }
    console.log(`  ${name}`)
    console.log(`    wall:    ${fmt(refWall, headWall)}`)
    console.log(`    layout:  ${fmt(refLayout, headLayout)}`)
    console.log(`    content: ${fmt(refContent, headContent)}`)
    console.log(`    output:  ${fmt(refOutput, headOutput)}`)
  }
  ' "$REF_PHASES" "$HEAD_PHASES"
fi

echo
echo "==> bench-compare done"
echo "    ref output:   $REF_OUT"
echo "    HEAD output:  $HEAD_OUT"
