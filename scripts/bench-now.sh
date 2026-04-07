#!/usr/bin/env bash
#
# scripts/bench-now.sh — Manual + tribe-coordinated bench ritual.
#
# Why this script exists:
#   Vitest benchmark numbers are highly sensitive to system load. A bench run
#   while another agent is compiling, syncing, or running its own tests gets
#   noisy by 30%+. We need a coordination ritual: check load → tell the tribe
#   to pause → run the bench → record results → tell the tribe we're done.
#
#   We do NOT use CI for these benchmarks (the user explicitly rejected CI as
#   too noisy). This script is the entire workflow.
#
# Usage:
#   scripts/bench-now.sh                                  # default: cursor-perf bench
#   scripts/bench-now.sh apps/km-tui/tests/foo.bench.ts   # custom bench file
#   BENCH_FORCE=1 scripts/bench-now.sh                    # skip CPU load check
#   BENCH_NO_TRIBE=1 scripts/bench-now.sh                 # skip tribe broadcast
#
# Outputs:
#   benchmarks/results/<sha>-<ts>.txt          — raw vitest output + phase report
#   benchmarks/history.jsonl                   — one summary line per run
#   benchmarks/results/.last-phases.json       — machine-readable phase data

set -euo pipefail

# Resolve repo root from script location so the script can be run from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BENCH_FILE="${1:-apps/km-tui/tests/cursor-perf.bench.ts}"
RESULTS_DIR="benchmarks/results"
HISTORY="benchmarks/history.jsonl"

mkdir -p "$RESULTS_DIR"

# -----------------------------------------------------------------------------
# Step 1: Identify
# -----------------------------------------------------------------------------

SHA="$(git rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RESULT_FILE="$RESULTS_DIR/${SHA}-${TIMESTAMP}.txt"

echo "==> Running bench"
echo "    file:    $BENCH_FILE"
echo "    sha:     $SHA"
echo "    output:  $RESULT_FILE"
echo

# -----------------------------------------------------------------------------
# Step 2: CPU load check
# -----------------------------------------------------------------------------

CORES="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 1)"
LOAD="$(uptime | awk -F'load averages?:' '{print $2}' | awk '{print $1}' | tr -d ',')"
LOAD_LIMIT="$(awk -v c="$CORES" 'BEGIN { printf "%.2f", c * 0.5 }')"

echo "==> CPU load check: load=$LOAD limit=$LOAD_LIMIT (cores=$CORES)"

# Compare load vs limit using awk for portable floating-point math.
LOAD_OK="$(awk -v l="$LOAD" -v lim="$LOAD_LIMIT" 'BEGIN { print (l <= lim) ? "1" : "0" }')"
if [[ "$LOAD_OK" != "1" ]]; then
  if [[ "${BENCH_FORCE:-}" == "1" ]]; then
    echo "    WARNING: load above 0.5 * cores — proceeding anyway (BENCH_FORCE=1)"
  else
    echo "    ABORT: 1-min load average ($LOAD) exceeds 0.5 * cores ($LOAD_LIMIT)."
    echo "    Wait for load to drop, or pass BENCH_FORCE=1 to override."
    exit 1
  fi
fi
echo

# -----------------------------------------------------------------------------
# Step 3: Tribe coordination — broadcast "pause for bench"
# -----------------------------------------------------------------------------

TRIBE_CLI="vendor/bearly/tools/tribe-cli.ts"

broadcast() {
  local msg="$1"
  if [[ "${BENCH_NO_TRIBE:-}" == "1" ]]; then
    return 0
  fi
  if [[ ! -f "$TRIBE_CLI" ]]; then
    return 0
  fi
  # Best-effort: don't fail the bench if tribe is unavailable.
  bun "$TRIBE_CLI" send '*' "$msg" >/dev/null 2>&1 || true
}

echo "==> Broadcasting pause request to tribe"
broadcast "BENCH STARTING on $SHA — please pause CPU-heavy work for ~60s ($BENCH_FILE)"
echo "    waiting 5s for objections (silence = consent)"
sleep 5
echo

# -----------------------------------------------------------------------------
# Step 4: Reset phase sidecar so we don't merge with previous runs
# -----------------------------------------------------------------------------

PHASES_SIDECAR="$RESULTS_DIR/.last-phases.json"
[[ -f "$PHASES_SIDECAR" ]] && rm -f "$PHASES_SIDECAR"

# -----------------------------------------------------------------------------
# Step 5: Run the bench
# -----------------------------------------------------------------------------

echo "==> Running vitest bench"
START_TIME="$(date -u +%s)"

# bunx --bun is required: without --bun, the harness uses node and bun:sqlite
# imports fail. We tee the output so we can both display it and save it.
{
  echo "=== bench run ==="
  echo "sha:       $SHA"
  echo "file:      $BENCH_FILE"
  echo "timestamp: $TIMESTAMP"
  echo "cores:     $CORES"
  echo "load:      $LOAD (limit $LOAD_LIMIT)"
  echo "==="
  echo
  set +e
  bunx --bun vitest bench --run "$BENCH_FILE" 2>&1
  BENCH_EXIT=$?
  set -e
  echo
  echo "=== exit: $BENCH_EXIT ==="
} | tee "$RESULT_FILE"

END_TIME="$(date -u +%s)"
DURATION="$((END_TIME - START_TIME))"
echo
echo "==> Bench finished in ${DURATION}s"

# -----------------------------------------------------------------------------
# Step 6: Append phase summary to result file
# -----------------------------------------------------------------------------

if [[ -f "$PHASES_SIDECAR" ]]; then
  {
    echo
    echo "=== per-phase breakdown ==="
    bun scripts/bench-format-phases.ts || echo "(phase formatter failed)"
  } | tee -a "$RESULT_FILE"
fi

# -----------------------------------------------------------------------------
# Step 7: Append summary to history.jsonl
# -----------------------------------------------------------------------------

# Extract per-bench mean times from the vitest output. Vitest's table rows
# look like:  · 100 cards — 20 j-presses  0.4798  2,069.11  2,120.65  ...
# We capture the leading bench name and the third numeric column (mean).
# This is a best-effort parser — if vitest changes its output format, the
# history line still gets the metadata even if the per-bench numbers are empty.
SUMMARY_JSON="$(bun -e '
const fs = require("node:fs")
const path = process.argv[2]
const sha = process.argv[3]
const ts = process.argv[4]
const cores = process.argv[5]
const load = process.argv[6]
const phasesPath = process.argv[7]
const benchFile = process.argv[8]
const text = fs.readFileSync(path, "utf8")
const benches = []
for (const line of text.split("\n")) {
  // Match vitest bench rows: " · NAME  hz  min  max  mean  ..."
  const m = line.match(/^\s+·\s+(.+?)\s{2,}([\d.]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/)
  if (m) {
    benches.push({
      name: m[1].trim(),
      hz: parseFloat(m[2]),
      meanMs: parseFloat(m[5].replace(/,/g, "")),
    })
  }
}
let phases = null
if (fs.existsSync(phasesPath)) {
  try { phases = JSON.parse(fs.readFileSync(phasesPath, "utf8")) } catch {}
}
const entry = {
  ts,
  sha,
  benchFile,
  cores: parseInt(cores, 10),
  load: parseFloat(load),
  benches,
  phases,
}
process.stdout.write(JSON.stringify(entry))
' "$RESULT_FILE" "$SHA" "$TIMESTAMP" "$CORES" "$LOAD" "$PHASES_SIDECAR" "$BENCH_FILE")"

echo "$SUMMARY_JSON" >> "$HISTORY"
echo "==> Appended summary to $HISTORY"

# -----------------------------------------------------------------------------
# Step 8: Tribe coordination — broadcast done
# -----------------------------------------------------------------------------

broadcast "bench done on $SHA (${DURATION}s) — see $RESULT_FILE"
echo "==> Broadcast 'bench done' to tribe"

# -----------------------------------------------------------------------------
# Step 9: Print one-line summary to stdout
# -----------------------------------------------------------------------------

echo
echo "==> Summary"
echo "$SUMMARY_JSON" | bun -e '
const data = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
console.log(`  sha:        ${data.sha}`)
console.log(`  duration:   ${data.benches.length} benches`)
for (const b of data.benches.slice(0, 12)) {
  console.log(`  ${b.name.padEnd(36)} ${b.meanMs.toFixed(2).padStart(10)}ms  (${b.hz.toFixed(2)} hz)`)
}
if (data.benches.length > 12) console.log(`  ... and ${data.benches.length - 12} more`)
' || true
