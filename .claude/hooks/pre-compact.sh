#!/bin/bash
# Hook: Pre-compact checkpoint (called by user-prompt-submit.sh on /compact)
# Gathers session context and outputs it as additionalContext for the compact summary.
# The actual bead update is done by Claude via the /checkpoint skill —
# this hook just injects context so the compact summary includes session state.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

# Gather context quickly (must be fast — hook has 5s timeout)
{
  echo "# Session State at Compact Time"
  echo ""
  echo "## In-Progress Beads"
  bd list --status=in_progress 2>/dev/null || echo "(beads unavailable)"
  echo ""
  echo "## Recent Commits"
  git log --oneline -10 2>/dev/null
  echo ""
  echo "## Uncommitted Changes"
  git status --short 2>/dev/null | head -20
  echo ""
  echo "## Open Beads"
  bd list --status=open -n 10 2>/dev/null || echo "(none)"
  echo ""
  echo "IMPORTANT: Run /checkpoint or bd show <tracking-bead> after compact to recover full context."
} 2>/dev/null
