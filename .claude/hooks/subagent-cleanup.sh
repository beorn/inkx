#!/bin/bash
# Hook: SubagentStop
# Kills orphaned vitest fork workers after a sub-agent stops.
# This is the primary zombie cleanup trigger — sub-agents stopping mid-test-run
# is the #1 cause of orphaned vitest workers.
#
# Detection strategy (two-pass):
#   1. PPID=1 (reparented to launchd — parent vitest process died)
#   2. Stale workers running >5 minutes whose parent is NOT a vitest main process
#      (handles cases where reparenting hasn't completed yet)

KILLED=0

# Pass 1: Classic orphan detection — PPID reparented to init/launchd (PID 1)
ORPHANS=$(ps -eo pid,ppid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '$2 == 1 {print $1}')
if [ -n "$ORPHANS" ]; then
  COUNT=$(echo "$ORPHANS" | wc -l | tr -d ' ')
  echo "$ORPHANS" | xargs kill -9 2>/dev/null
  KILLED=$((KILLED + COUNT))
fi

# Pass 2: Stale workers (>5min elapsed) whose parent is not a vitest process
# On macOS, etime format is [[dd-]hh:]mm:ss
while IFS= read -r line; do
  [ -z "$line" ] && continue
  PID=$(echo "$line" | awk '{print $1}')
  PPID_VAL=$(echo "$line" | awk '{print $2}')
  ETIME=$(echo "$line" | awk '{print $3}')

  # Skip if already handled (PPID=1)
  [ "$PPID_VAL" = "1" ] && continue

  # Parse elapsed time to seconds
  SECS=0
  if echo "$ETIME" | grep -q '-'; then
    # dd-hh:mm:ss format
    DAYS=$(echo "$ETIME" | cut -d'-' -f1)
    REST=$(echo "$ETIME" | cut -d'-' -f2)
    SECS=$((DAYS * 86400))
    ETIME="$REST"
  fi
  # Count colons to distinguish hh:mm:ss from mm:ss
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

  # Only kill if running >5 minutes (300s)
  if [ "$SECS" -gt 300 ]; then
    # Check if parent is still a vitest process
    PARENT_CMD=$(ps -p "$PPID_VAL" -o command= 2>/dev/null)
    if ! echo "$PARENT_CMD" | grep -q 'vitest'; then
      kill -9 "$PID" 2>/dev/null
      KILLED=$((KILLED + 1))
    fi
  fi
done <<< "$(ps -eo pid,ppid,etime,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep)"

if [ "$KILLED" -gt 0 ]; then
  echo "{\"systemMessage\": \"Cleaned up $KILLED orphaned vitest fork worker(s) after subagent stop\"}"
else
  echo '{}'
fi

exit 0
