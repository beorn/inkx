#!/bin/bash
# =====================================================================
# ⚠️  STRICT INVARIANT — THIS HOOK MUST ALWAYS EMIT VALID JSON ON STDOUT
# =====================================================================
#
# If this hook exits with empty stdout, Claude Code displays a bare
# "Human: UserPromptSubmit hook success: OK" system-reminder bundled
# onto the user's turn. The LLM then reads that as if the user typed it
# and may respond to the phantom "Human:" — producing fake dialogue
# lines in the transcript and, worse, acting on self-generated pseudo
# input. This is a Claude Code provenance bug, not something this hook
# can "opt out of" by exiting silently — the only safe path is to
# ALWAYS emit a well-formed payload.
#
# Upstream bug tracker:
#   https://github.com/anthropics/claude-code/issues/50972
#   (dupes: #42481, #39368, #38294)
#
# Project memory:
#   feedback-never-emit-role-prefixes.md
#   feedback-quiet-tribe-ack.md
#   feedback-silent-tribe-acks-no-ack-word.md
#
# Minimum legal payload:
#   {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}
#
# RULES:
#   1. Every exit path MUST go through emit_and_exit below (or emit an
#      equivalent JSON payload before `exit`).
#   2. If you want to "disable" this hook, emit an empty additionalContext
#      and exit 0 — do NOT `exit 0` without output.
#   3. If you error out, STILL emit valid JSON on stdout before exiting.
#   4. Never `exec` another program without verifying it will itself
#      emit the required JSON shape.
# =====================================================================

emit_and_exit() {
  # Arg 1: additionalContext body (already-escaped-for-json OR empty).
  # If empty or omitted, emits a legal payload with no injected context.
  local ctx="${1-}"
  if [ -z "$ctx" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}\n'
  else
    # Caller has already jq-escaped the payload.
    printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":%s}}\n' "$ctx"
  fi
  exit 0
}

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Peek at stdin to check for /compact
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

# Intercept /compact — run pre-compact checkpoint and inject context
if echo "$PROMPT" | grep -qiE '^\s*/compact'; then
  CONTEXT=$("$REPO_ROOT/.claude/hooks/pre-compact.sh" 2>/dev/null)
  if [ -n "$CONTEXT" ]; then
    ESCAPED=$(echo "$CONTEXT" | jq -Rs . 2>/dev/null)
    if [ -n "$ESCAPED" ]; then
      emit_and_exit "$ESCAPED"
    fi
  fi
  # pre-compact.sh produced nothing usable — still emit legal JSON
  emit_and_exit ""
fi

# Default: delta context injection via tribe (formerly `recall hook`,
# moved in @bearly/tribe 0.10.0 — `recall hook` now errors out).
#
# IMPORTANT: do NOT use `echo | exec cmd` here — `exec` inside a pipeline
# only replaces the subshell, not this script, so after tribe-cli writes
# its JSON the outer script continues and would emit a SECOND payload
# (producing the double "hook success: ..." lines that users see in the
# transcript).
#
# Capture tribe-cli's stdout. tribe-cli emits valid JSON for most prompts
# (recall hits → full context), but SILENTLY emits nothing when recall
# skips (e.g. short prompts: `[recall hook] skipped: short`). If we pass
# an empty body through, Claude Code falls back to the bare "hook
# success: OK" reminder — exactly what this script exists to prevent.
# So: empty → emit legal-empty payload via emit_and_exit.
if [ -f "$REPO_ROOT/vendor/bearly/tools/tribe-cli.ts" ]; then
  TRIBE_OUT=$(echo "$INPUT" | bun "$REPO_ROOT/vendor/bearly/tools/tribe-cli.ts" hook prompt 2>/dev/null)
  if [ -n "$TRIBE_OUT" ]; then
    printf '%s\n' "$TRIBE_OUT"
    exit 0
  fi
fi

# Fallback: tribe-cli not found OR emitted nothing — emit legal empty payload
emit_and_exit ""
