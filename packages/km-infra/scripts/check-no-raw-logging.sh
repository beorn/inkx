#!/usr/bin/env bash
# Block raw observability patterns that bypass loggily's pipeline.
#
# Why this script exists: loggily ships namespaces (createLogger("ns:thing")),
# levels, structured fields, file-writer fan-out, and worker-thread bridges.
# 30+ subsystems already use it correctly. The failure mode this lint
# catches is a subsystem reinventing it locally:
#
#   - exporting its own `createLogger` function (shadows loggily's name,
#     bypasses the shared writer pipeline; tracked in km-bearly.unified-
#     observability after bg-recall + injection-envelope drifted)
#   - writing `fs.appendFileSync(path, json + "\n")` for log records
#     (skips formatting, level filtering, namespace tagging)
#   - naming env vars `<SUBSYSTEM>_DEBUG_LOG` (bead-spec literalism that
#     pushes agents to build parallel file writers; the canonical names
#     are LOGGILY_FILE / LOGGILY_FILE_<NS>)
#
# The lint rule turns "two paths can drift" into "there is no second
# path" — quality-rubric L0/L1 → L4. Same shape as check-no-raw-lifecycle.sh.
#
# Bead: km-bearly.unified-observability (the migration that justifies
# making this lint a CI gate).

set -e
EXIT=0

# Files allowed to define / use the raw patterns. Anchor with file path
# fragments — grep matches anywhere in the path.
#
#   loggily/                    — the primitive itself
#   tests/, *.test.*, *.spec.*  — test code can mock anything
#   /dist/, /node_modules/      — built artifacts
#   /scripts/, /tools/          — build & infra scripts (some grep helpers)
#   docs/, hub/, README, CHANGELOG, .md  — documentation referencing patterns
#   .skill                      — skill docs explaining the pattern
#   .claude/worktrees/          — agent worktree clones (stale snapshots; the
#                                 lint runs on main, but submodule worktree
#                                 clones live under .claude/worktrees/<name>/
#                                 inside vendor/bearly and would otherwise
#                                 double-count every offender N times)
#   web/stubs/                  — browser bundle stubs (web build replaces
#                                 the real loggily import with a noop createLogger;
#                                 this is exactly the cross-platform shim
#                                 pattern the lint exists to allow)
ALLOWLIST_PATTERN='\(/loggily/\|/tests/\|\.test\.\|\.spec\.\|/dist/\|/node_modules/\|/scripts/\|/tools/\|/docs/\|/hub/\|README\|CHANGELOG\|\.md$\|/\.claude/skills/\|/\.claude/worktrees/\|/web/stubs/\)'

SEARCH_ROOTS='apps packages vendor'

# === BASELINES (2026-04-27) =============================================
# Bump DOWN as call sites migrate to loggily. Never bump UP — that means
# a new offender slipped in. The unified-observability bead lowers these
# to zero; this lint locks them at zero from there.
#
# Migration recipe:
#   import { createLogger, addWriter, createFileWriter } from "loggily"
#   const log = createLogger("subsystem:event-class")
#   log.info("...", { structured, fields })
#
# At app startup (host code only):
#   if (process.env.LOGGILY_FILE) {
#     addWriter(formatted => createFileWriter(process.env.LOGGILY_FILE).write(formatted))
#   }
BASELINE_LOCAL_CREATELOGGER=0    # `export function createLogger` outside vendor/loggily.
                                  # Was 2 (bg-recall + injection-envelope) pre km-bearly.
                                  # unified-observability; both deleted/migrated.
                                  # Goal: stay at 0.
BASELINE_APPEND_LOG_FILE=6        # `appendFileSync` writing to .log / .jsonl paths.
                                  # Today's offenders (tracked in km-bearly.llm-loggily-migration):
                                  #   - apps/km-cli/src/commands/daemon.ts (1)
                                  #   - vendor/bearly/plugins/llm/src/lib/dual-pro.ts (2 — backtest + promotions JSONL)
                                  #   - vendor/bearly/plugins/llm/src/lib/dispatch.ts (1 — ab-pro JSONL)
                                  #   - vendor/silvery/packages/ag-term/src/runtime/create-app.tsx (2 — debug trace)
                                  # The obs bead's lint baseline missed these; bumping to 6
                                  # to honestly reflect main today. Migration tracked separately.
BASELINE_DEBUG_LOG_ENV=2          # `_DEBUG_LOG` env-var literals as log file paths.
                                  # Today: INJECTION_DEBUG_LOG (back-compat shim in
                                  # plugins/injection-envelope/src/debug.ts:14,71 — lazily
                                  # registers a namespace-scoped writer if env var is set).
                                  # BG_RECALL_DEBUG_LOG was deleted in unified-observability.
                                  # Goal: 0 once back-compat shim is dropped (one release later).
# =========================================================================

count_pattern() {
  local pattern="$1"
  shift
  grep -rnE "$pattern" $SEARCH_ROOTS "$@" 2>/dev/null \
    | grep -v "$ALLOWLIST_PATTERN" \
    | wc -l | tr -d ' '
}

list_pattern() {
  local pattern="$1"
  shift
  grep -rnE "$pattern" $SEARCH_ROOTS "$@" 2>/dev/null \
    | grep -v "$ALLOWLIST_PATTERN" || true
}

check_baseline() {
  local label="$1"
  local baseline="$2"
  local explanation="$3"
  local pattern="$4"
  shift 4
  local actual
  actual=$(count_pattern "$pattern" "$@")
  if [ "$actual" -gt "$baseline" ]; then
    echo "ERROR: $label — count $actual exceeds baseline $baseline"
    echo "       $explanation"
    list_pattern "$pattern" "$@" | head -20
    echo ""
    echo "       Use loggily instead:"
    echo "         import { createLogger } from \"loggily\""
    echo "         const log = createLogger(\"subsystem:event-class\")"
    echo "       Wire file output at host-app startup:"
    echo "         addWriter(formatted => createFileWriter(LOGGILY_FILE).write(formatted))"
    echo "       See .claude/skills/logging/SKILL.md for the full pattern."
    EXIT=1
  elif [ "$actual" -lt "$baseline" ]; then
    echo "PROGRESS: $label — count $actual is BELOW baseline $baseline."
    echo "          Lower BASELINE_${label} to $actual in this script and commit."
  fi
}

check_baseline LOCAL_CREATELOGGER "$BASELINE_LOCAL_CREATELOGGER" \
  "Local createLogger function shadows loggily's name and bypasses the shared writer pipeline." \
  '^export function createLogger' --include='*.ts' --include='*.tsx'

check_baseline APPEND_LOG_FILE "$BASELINE_APPEND_LOG_FILE" \
  "Direct file appends bypass formatting, level filtering, namespace tagging. Use loggily's createFileWriter via addWriter." \
  'appendFileSync\(.*\.(log|jsonl)' --include='*.ts' --include='*.tsx'

check_baseline DEBUG_LOG_ENV "$BASELINE_DEBUG_LOG_ENV" \
  "Subsystem-specific _DEBUG_LOG env vars fragment observability. Use LOGGILY_FILE (or LOGGILY_FILE_<NS> for per-namespace files)." \
  '_DEBUG_LOG[^_A-Z]' --include='*.ts' --include='*.tsx'

if [ "$EXIT" -eq 0 ]; then
  echo "OK: no-raw-logging clean (no loggily-bypass surface introduced)"
fi

exit $EXIT
