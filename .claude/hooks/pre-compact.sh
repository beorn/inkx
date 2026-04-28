#!/bin/bash
# Hook: Pre-compact checkpoint (called by user-prompt-submit.sh on /compact)
# Hook-Status: internal (invoked by user-prompt-submit.sh, not a top-level registration)
# Gathers session context and outputs it as additionalContext for the compact summary.
# The actual bead update is done by Claude via the /checkpoint skill —
# this hook just injects context so the compact summary includes session state.
#
# KEY: includes RESUME directive pointing to this session's tracking bead,
# so post-compact Claude knows exactly what to pick up.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# Prefer the Go `bd` binary while it's installed (50ms vs km bd's 600ms;
# the hook loops list/show, so per-call latency matters for the 5s timeout).
# Fall back to `bun km bd` so the hook still works after dolt-archive cutover
# in environments where `bd` is uninstalled. Both share the same query surface.
if command -v bd >/dev/null 2>&1; then
  BD="bd"
else
  BD="bun $REPO_ROOT/apps/km-cli/src/index.ts bd"
fi

# Get session ID for checkpoint bead matching
SHORT_ID="${CLAUDE_SESSION_ID:0:8}"

# Gather context quickly (must be fast — hook has 5s timeout)
{
  # Find THIS session's tracking bead (claimed by this session's ID)
  TRACKING_BEAD=""
  if [ -n "$SHORT_ID" ]; then
    # Search beads claimed by this session that are in_progress
    TRACKING_BEAD=$($BD list --status=in_progress 2>/dev/null | grep -o 'km-[a-z0-9._-]*' | head -1)
    # Try to find one specifically claimed by this session
    for bead_id in $($BD list --status=in_progress 2>/dev/null | grep -o 'km-[a-z0-9._-]*'); do
      if $BD show "$bead_id" 2>/dev/null | grep -q "$SHORT_ID"; then
        TRACKING_BEAD="$bead_id"
        break
      fi
    done
  fi

  # RESUME directive — must be FIRST so post-compact Claude sees it immediately
  if [ -n "$TRACKING_BEAD" ]; then
    echo "# RESUME: bd show $TRACKING_BEAD"
    echo "This session was working on $TRACKING_BEAD. After compact, run 'bd show $TRACKING_BEAD' FIRST to recover context."
    echo "Do NOT list all beads or start new work — resume this bead."
    echo ""
  fi

  echo "# Session State at Compact Time (session: $SHORT_ID)"
  echo ""
  echo "## In-Progress Beads"
  $BD list --status=in_progress 2>/dev/null || echo "(beads unavailable)"
  echo ""
  echo "## Recent Commits"
  git log --oneline -10 2>/dev/null
  echo ""
  echo "## Uncommitted Changes"
  git status --short 2>/dev/null | head -20

  if [ -z "$TRACKING_BEAD" ]; then
    echo ""
    echo "WARNING: No tracking bead found for session $SHORT_ID. Context may be lost after compact."
  fi
} 2>/dev/null
