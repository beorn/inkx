#!/usr/bin/env bash
# Two-way bead↔code-marker binding check for the upstream-waiting registry.
#
# Why this script exists: workarounds in code that lack a tracking bead
# silently outlive the upstream fix. Beads in km-all.upstream-waiting that
# lack a code marker can't be unwound — the workaround site is unfindable.
# Both directions of the binding must hold.
#
# What it enforces (per .claude/skills/pm/workflows/upstream.md §8):
#   1. Every `// UPSTREAM-WAITING(<repo>#<issue>):` comment under apps/,
#      packages/, vendor/* (excluding vendor's git internals/dist/node_modules)
#      must list a `// Bead: <bead-id>` line, and that bead must be:
#        - open
#        - parented under km-all.upstream-waiting
#   2. Every open child of km-all.upstream-waiting must have at least one
#      matching code marker referencing its bead ID.
#
# Mismatches print to stderr and exit non-zero.
#
# Wiring: invoked by `bun fix` (see package.json "fix" script). Also runnable
# standalone: `bash packages/km-infra/scripts/check-upstream-markers.sh`.
#
# Bead: km-all.plateau-90 (R2 deliverable)

set -euo pipefail

EXIT=0

# Find repo root regardless of cwd. The script is at packages/km-infra/scripts/.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../.." && pwd)
cd "$REPO_ROOT"

# Soft-skip if bd or rg are unavailable (CI environments without beads tooling).
if ! command -v bd > /dev/null 2>&1; then
  echo "check-upstream-markers: bd not found; skipping (install beads to enforce)"
  exit 0
fi
if ! command -v rg > /dev/null 2>&1; then
  echo "check-upstream-markers: rg (ripgrep) not found; skipping"
  exit 0
fi

SEARCH_GLOBS=(
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/.git/**'
  --glob '!.beads/**'
  --glob '!**/build/**'
  # Code markers live in source files, not docs/scripts that document the convention.
  --glob '!**/check-upstream-markers.sh'
  --glob '!**/upstream.md'
  --glob '!**/CLAUDE.md'
  --glob '!**/*.md'
)
SEARCH_ROOTS=(apps packages vendor)

# ---------------------------------------------------------------------------
# Direction 1: every UPSTREAM-WAITING marker resolves to a valid bead.
# ---------------------------------------------------------------------------
#
# Marker shape (multi-line, contiguous):
#   // UPSTREAM-WAITING(<repo>#<issue>): Delete when <pkg> >= <version>
#   // Bead: km-<scope>.<slug>
#   // Escalate by: <YYYY-MM-DD>
#
# We grep for the first line, then read the next 4 lines from the same file
# to extract the Bead: line. Comments may be `//` or `* ` (inside a /* */ block).

# Collect every "Bead: km-..." reference adjacent to an UPSTREAM-WAITING marker.
# Output: one bead-id per line.
referenced_beads_from_code() {
  rg --line-number --no-heading "${SEARCH_GLOBS[@]}" \
    'UPSTREAM-WAITING\(' "${SEARCH_ROOTS[@]}" 2> /dev/null \
    | while IFS=: read -r file line _rest; do
      # Read up to 4 lines after the marker to find "Bead: <id>".
      bead=$(awk -v start="$line" -v end=$((line + 4)) \
        'NR>=start && NR<=end && match($0, /Bead:[[:space:]]*(km-[A-Za-z0-9._-]+)/, m) { print m[1]; exit }' \
        "$file")
      if [ -z "$bead" ]; then
        echo "MISSING_BEAD_LINE	$file:$line" >&2
        EXIT=1
        continue
      fi
      echo "$bead	$file:$line"
    done
}

REFS_TMP=$(mktemp)
trap 'rm -f "$REFS_TMP"' EXIT
referenced_beads_from_code > "$REFS_TMP" || true

# Verify each referenced bead is open + parented to km-all.upstream-waiting.
declare -A SEEN_BEADS=()
while IFS=$'\t' read -r bead loc; do
  [ -z "$bead" ] && continue
  if [ -n "${SEEN_BEADS[$bead]:-}" ]; then
    SEEN_BEADS[$bead]+=" $loc"
    continue
  fi
  SEEN_BEADS[$bead]="$loc"

  if ! show=$(bd show "$bead" 2> /dev/null); then
    echo "ERROR: marker at $loc references bead '$bead' which does not exist" >&2
    EXIT=1
    continue
  fi
  # Status check: bd show prints e.g. "[● P3 · OPEN]". Treat anything that's
  # not OPEN/IN_PROGRESS as a problem (CLOSED beads with active markers = stale).
  if echo "$show" | head -1 | grep -qE '· (CLOSED|RESOLVED)'; then
    echo "ERROR: marker at $loc references bead '$bead' but bead is closed" >&2
    EXIT=1
  fi
  # Parent check: a child shows "Parent: km-all.upstream-waiting" in tree view,
  # but `bd show <id>` prints the parent indirectly. Use `bd list --parent` instead.
  if ! bd list --parent km-all.upstream-waiting --status open 2> /dev/null \
    | grep -qE "(^|[[:space:]])$bead([[:space:]]|$|:)"; then
    echo "WARN: marker at $loc references bead '$bead' which is not an open child of km-all.upstream-waiting" >&2
    EXIT=1
  fi
done < "$REFS_TMP"

# ---------------------------------------------------------------------------
# Direction 2: every open child of km-all.upstream-waiting has a code marker.
# ---------------------------------------------------------------------------
OPEN_CHILDREN=$(bd list --parent km-all.upstream-waiting --status open --json 2> /dev/null \
  | grep -oE '"id":[[:space:]]*"[^"]+"' \
  | sed -E 's/.*"([^"]+)"$/\1/' || true)

if [ -z "$OPEN_CHILDREN" ]; then
  # JSON form may not be supported in all bd versions — fall back to text parse.
  # bd quirk: `bd list --parent X --status open` ignores --status and returns
  # every child including closed (✓). Per upstream.md §8, every non-closed child
  # must have a marker — open (○), in-progress (◐), blocked (●), deferred (❄).
  # Closed beads are kept under the registry as historical records and don't
  # need markers (the workaround is gone).
  OPEN_CHILDREN=$(bd list --parent km-all.upstream-waiting --status open 2> /dev/null \
    | grep -vE '✓[[:space:]]+km-' \
    | grep -oE 'km-[A-Za-z0-9._-]+' \
    | sort -u || true)
fi

while IFS= read -r bead; do
  [ -z "$bead" ] && continue
  # Skip the parent epic itself if it shows up.
  [ "$bead" = "km-all.upstream-waiting" ] && continue
  if [ -z "${SEEN_BEADS[$bead]:-}" ]; then
    echo "ERROR: bead '$bead' is an open child of km-all.upstream-waiting but no code marker references it" >&2
    echo "       Either add an UPSTREAM-WAITING comment block at the workaround site, or close the bead." >&2
    EXIT=1
  fi
done <<< "$OPEN_CHILDREN"

if [ "$EXIT" -eq 0 ]; then
  echo "OK: upstream-waiting markers and beads are in sync"
fi

exit "$EXIT"
