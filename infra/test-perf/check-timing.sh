#!/bin/bash
# Wraps a vitest command and warns if it exceeds the threshold
THRESHOLD=${TEST_FAST_THRESHOLD:-15}
START=$SECONDS
"$@"
EXIT_CODE=$?
ELAPSED=$((SECONDS - START))
if [ $ELAPSED -gt $THRESHOLD ]; then
  echo ""
  echo "WARNING: test:fast took ${ELAPSED}s (threshold: ${THRESHOLD}s)"
  echo "  This is a P0 issue. See: bd show km-infra.test-timing-guard"
  echo "  Common causes: infinite loops, stale vitest processes, CPU contention"
  echo "  Run: ps aux | grep vitest | grep -v grep"
fi
exit $EXIT_CODE
