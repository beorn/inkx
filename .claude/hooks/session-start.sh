#!/bin/bash
# Export CLAUDE_SESSION_ID for /bd claiming functionality
# This hook runs on SessionStart and makes the session ID available as an env var

SESSION_ID=$(cat | jq -r '.session_id // empty')
if [ -n "$CLAUDE_ENV_FILE" ] && [ -n "$SESSION_ID" ]; then
  SHORT_ID="${SESSION_ID:0:8}"
  echo "export CLAUDE_SESSION_ID='${SESSION_ID}'" >> "$CLAUDE_ENV_FILE"
  echo "export BD_ACTOR='claude:${SHORT_ID}'" >> "$CLAUDE_ENV_FILE"
fi
exit 0
