#!/bin/bash
# Hook: SubagentStop
# Kills orphaned vitest fork workers after a sub-agent stops.
# This is the primary zombie cleanup trigger — sub-agents stopping mid-test-run
# is the #1 cause of orphaned vitest workers.
#
# Only kills workers orphaned to PPID=1 (parent vitest process died).

ORPHANS=$(ps -eo pid,ppid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '$2 == 1 {print $1}')

if [ -n "$ORPHANS" ]; then
  COUNT=$(echo "$ORPHANS" | wc -l | tr -d ' ')
  echo "$ORPHANS" | xargs kill -9 2>/dev/null
  echo "{\"systemMessage\": \"Cleaned up $COUNT orphaned vitest fork worker(s) after subagent stop\"}"
else
  exit 0
fi
