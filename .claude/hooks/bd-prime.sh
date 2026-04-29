#!/bin/bash
# Hook: km bd prime wrapper
# Emits the beads workflow context + recent memories at SessionStart and PreCompact.
#
# Post-cutover (km-beads.cutover, 2026-04-28): Go `bd` binary is archived.
# km bd reads from .km/state.db (rebuilt from markdown scope dirs).

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$REPO_ROOT/scripts/km" bd prime
