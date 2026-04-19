#!/bin/bash
# Utility: Kill orphaned vitest fork workers.
# Hook-Status: internal (not a top-level hook — invoked manually or from other hooks)
# Can be run manually or from hooks. Uses two-pass detection:
#   1. PPID=1 (reparented to launchd — definite orphan)
#   2. Stale (>5min) workers whose parent is not vitest (likely orphan)
#
# Usage: .claude/hooks/post-bash-cleanup.sh [--force]
#   --force: kill ALL vitest fork workers regardless of age/parent

FORCE=0
[ "$1" = "--force" ] && FORCE=1

KILLED=0

if [ "$FORCE" -eq 1 ]; then
  ALL=$(ps -eo pid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '{print $1}')
  if [ -n "$ALL" ]; then
    KILLED=$(echo "$ALL" | wc -l | tr -d ' ')
    echo "$ALL" | xargs kill -9 2>/dev/null
    echo "Force-killed $KILLED vitest fork worker(s)"
  else
    echo "No vitest workers found"
  fi
  exit 0
fi

# Pass 1: PPID=1 orphans
ORPHANS=$(ps -eo pid,ppid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '$2 == 1 {print $1}')
if [ -n "$ORPHANS" ]; then
  COUNT=$(echo "$ORPHANS" | wc -l | tr -d ' ')
  echo "$ORPHANS" | xargs kill -9 2>/dev/null
  KILLED=$((KILLED + COUNT))
fi

# Pass 2: Stale workers (>5min) with non-vitest parent
while IFS= read -r line; do
  [ -z "$line" ] && continue
  PID=$(echo "$line" | awk '{print $1}')
  PPID_VAL=$(echo "$line" | awk '{print $2}')
  ETIME=$(echo "$line" | awk '{print $3}')

  [ "$PPID_VAL" = "1" ] && continue

  # Parse elapsed time to seconds
  SECS=0
  if echo "$ETIME" | grep -q '-'; then
    DAYS=$(echo "$ETIME" | cut -d'-' -f1)
    REST=$(echo "$ETIME" | cut -d'-' -f2)
    SECS=$((DAYS * 86400))
    ETIME="$REST"
  fi
  COLONS=$(echo "$ETIME" | tr -cd ':' | wc -c | tr -d ' ')
  if [ "$COLONS" -eq 2 ]; then
    H=$(echo "$ETIME" | cut -d':' -f1)
    M=$(echo "$ETIME" | cut -d':' -f2)
    S=$(echo "$ETIME" | cut -d':' -f3)
    SECS=$((SECS + H * 3600 + M * 60 + S))
  else
    M=$(echo "$ETIME" | cut -d':' -f1)
    S=$(echo "$ETIME" | cut -d':' -f2)
    SECS=$((SECS + M * 60 + S))
  fi

  if [ "$SECS" -gt 300 ]; then
    PARENT_CMD=$(ps -p "$PPID_VAL" -o command= 2>/dev/null)
    if ! echo "$PARENT_CMD" | grep -q 'vitest'; then
      kill -9 "$PID" 2>/dev/null
      KILLED=$((KILLED + 1))
    fi
  fi
done <<< "$(ps -eo pid,ppid,etime,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep)"

if [ "$KILLED" -gt 0 ]; then
  echo "Killed $KILLED orphaned vitest fork worker(s)"
else
  echo "No orphaned vitest workers found"
fi
