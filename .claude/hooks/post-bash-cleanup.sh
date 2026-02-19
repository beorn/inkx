#!/bin/bash
# Utility: Kill orphaned vitest fork workers.
# Can be run manually or from hooks. Kills only workers whose parent vitest
# process has died (PPID=1, reparented to launchd/init).
#
# Usage: .claude/hooks/post-bash-cleanup.sh

ORPHANS=$(ps -eo pid,ppid,command 2>/dev/null | grep 'vitest.*forks\.js' | grep -v grep | awk '$2 == 1 {print $1}')

if [ -n "$ORPHANS" ]; then
  COUNT=$(echo "$ORPHANS" | wc -l | tr -d ' ')
  echo "$ORPHANS" | xargs kill -9 2>/dev/null
  echo "Killed $COUNT orphaned vitest fork worker(s)"
else
  echo "No orphaned vitest workers found"
fi
