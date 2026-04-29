#!/bin/bash
# Hook: km bd prime wrapper
# Emits the beads workflow context + recent memories at SessionStart and PreCompact.
#
# Prefers the Go `bd` binary while it's installed (50ms vs km bd's 180ms);
# falls back to `bun km bd prime` so the hook still works in environments
# where `bd` was uninstalled (e.g. after the km-beads.dolt-archive cutover).
# Both emit equivalent priming text — `km bd prime` reads .beads/PRIME.md
# (same source the bd binary maintains) followed by recent mem/ entries.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if command -v bd >/dev/null 2>&1; then
  exec bd prime
else
  exec bun "$REPO_ROOT/apps/km-cli/src/index.ts" bd prime
fi
