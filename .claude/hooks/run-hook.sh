#!/bin/bash
# Universal hook runner — captures stderr to /tmp/claude-hooks.log
# Stdout passes through to Claude Code (hooks output JSON on stdout)
# Usage: run-hook.sh <hook-name> <command> [args...]
HOOK_LOG="/tmp/claude-hooks.log"
HOOK_NAME="${1:?usage: run-hook.sh <name> <command>}"
shift
echo "$(date +%H:%M:%S) $HOOK_NAME: starting" >>"$HOOK_LOG"
if output=$("$@" 2>>"$HOOK_LOG"); then
  echo "$(date +%H:%M:%S) $HOOK_NAME: ok" >>"$HOOK_LOG"
else
  echo "$(date +%H:%M:%S) $HOOK_NAME: FAILED (exit $?)" >>"$HOOK_LOG"
fi
# Pass stdout through (hook JSON output)
[ -n "$output" ] && echo "$output"
