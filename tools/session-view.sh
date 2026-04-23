#!/bin/bash
#
# session-view.sh — render a Claude Code session JSONL as a chat transcript.
#
# Usage:
#   tools/session-view.sh                    # latest session for this project
#   tools/session-view.sh <uuid-prefix>      # match on session filename prefix
#   tools/session-view.sh <partial-text>     # match any jsonl with that text
#
# Flags:
#   --full         don't truncate long tool results (default: 500 chars)
#   --thinking     show <thinking> blocks (default: hidden)
#   --injections   only show system-reminder / additionalContext injections
#   --since <n>    show turns in the last N minutes (e.g. 10, 60, 240)
#   --list         list available sessions (time-sorted, latest first) + exit
#   --help         this message
#
# The output highlights system-reminder injections (incl. recall-memory
# additionalContext) because those are the leading cause of phantom
# "Human:" self-injection — see anthropics/claude-code#50972.
#

set -euo pipefail

# ── config ──────────────────────────────────────────────────────────────────

# Derive the Claude Code project dir from the current repo root.
# Claude Code encodes paths by replacing '/' with '-' and prefixing with '-'.
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
project_enc=$(echo "$repo_root" | sed 's|/|-|g')
sessions_dir="${HOME}/.claude/projects/${project_enc}"

if [ ! -d "$sessions_dir" ]; then
  echo "No Claude Code sessions found for $repo_root" >&2
  echo "Looked in: $sessions_dir" >&2
  exit 1
fi

# ── colors (disable on !tty or NO_COLOR) ────────────────────────────────────

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_USER=$'\e[1;34m'   # bold blue
  C_ASSIST=$'\e[32m'   # green
  C_TOOL=$'\e[36m'     # cyan
  C_RESULT=$'\e[2;37m' # dim grey
  C_THINK=$'\e[2;35m'  # dim magenta
  C_INJECT=$'\e[1;33m' # bold yellow — injection marker
  C_SYSTEM=$'\e[33m'   # yellow — system events
  C_TS=$'\e[2;37m'     # dim grey for timestamps
  C_RST=$'\e[0m'
else
  C_USER='' C_ASSIST='' C_TOOL='' C_RESULT='' C_THINK='' C_INJECT='' C_SYSTEM='' C_TS='' C_RST=''
fi

# ── arg parse ───────────────────────────────────────────────────────────────

show_full=0
show_thinking=0
injections_only=0
since_min=0
do_list=0
target=""

while [ $# -gt 0 ]; do
  case "$1" in
    --full) show_full=1 ;;
    --thinking) show_thinking=1 ;;
    --injections) injections_only=1 ;;
    --since) since_min="$2"; shift ;;
    --list) do_list=1 ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's|^# \{0,1\}||'
      exit 0
      ;;
    --*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) target="$1" ;;
  esac
  shift
done

# ── session discovery ───────────────────────────────────────────────────────

# Sort by mtime desc via ls -t
sessions=()
while IFS= read -r f; do
  sessions+=("$f")
done < <(ls -t "$sessions_dir"/*.jsonl 2>/dev/null)

if [ "${#sessions[@]}" -eq 0 ]; then
  echo "No *.jsonl sessions in $sessions_dir" >&2
  exit 1
fi

if [ "$do_list" -eq 1 ]; then
  printf "%-40s  %8s  %s\n" "SESSION" "LINES" "MTIME"
  for f in "${sessions[@]}"; do
    # `date -r FILE` is portable across BSD (macOS) and Linux coreutils.
    mtime=$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "?")
    lines=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
    base=$(basename "$f" .jsonl)
    printf "%-40s  %8s  %s\n" "$base" "$lines" "$mtime"
  done
  exit 0
fi

# Resolve target → single session file
if [ -z "$target" ]; then
  session="${sessions[0]}"
else
  matches=()
  for f in "${sessions[@]}"; do
    base=$(basename "$f" .jsonl)
    if [[ "$base" == "$target"* ]]; then matches+=("$f"); fi
  done
  if [ "${#matches[@]}" -eq 0 ]; then
    # fall back: grep the content (slow path)
    while IFS= read -r f; do matches+=("$f"); done < <(grep -l -- "$target" "$sessions_dir"/*.jsonl 2>/dev/null | head -3)
  fi
  if [ "${#matches[@]}" -eq 0 ]; then
    echo "No session matches: $target" >&2
    exit 1
  fi
  if [ "${#matches[@]}" -gt 1 ]; then
    echo "Multiple matches for '$target':" >&2
    for m in "${matches[@]}"; do echo "  $(basename "$m" .jsonl)" >&2; done
    echo "Use a more specific prefix." >&2
    exit 1
  fi
  session="${matches[0]}"
fi

echo "${C_SYSTEM}session: $(basename "$session" .jsonl)${C_RST}"
echo "${C_SYSTEM}path:    $session${C_RST}"
echo "${C_SYSTEM}lines:   $(wc -l < "$session" | tr -d ' ')${C_RST}"
echo

# ── since filter (in minutes) ──────────────────────────────────────────────

since_cutoff=""
if [ "$since_min" -gt 0 ]; then
  # BSD/macOS date: -v-Nm for N minutes back
  since_cutoff=$(date -u -v-${since_min}M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)
fi

# ── jq program: emit one chat block per event ──────────────────────────────

max_chars=$([ "$show_full" -eq 1 ] && echo 0 || echo 500)
show_thinking_flag=$show_thinking
injections_flag=$injections_only

# The jq program produces lines of the form:
#   <type>\t<timestamp>\t<tool>\t<body>
# The caller then colors + formats them.
jq_prog=$(cat <<'JQ'
  # Helpers
  def trunc($n):
    if $n > 0 and (tostring | length) > $n then
      (tostring | .[:$n]) + "…(+" + ((tostring | length - $n) | tostring) + " chars)"
    else
      tostring
    end;

  def is_injection:
    (tostring | test("<system-reminder>|<recall-memory|UserPromptSubmit hook|additionalContext"));

  def fmt_tool_input($t; $in):
    if $t == "Bash" then
      ($in.command // "") | tostring | .[:300]
    elif $t == "Read" then
      "read " + ($in.file_path // "?") + (if $in.offset then " @" + ($in.offset|tostring) else "" end) + (if $in.limit then " limit=" + ($in.limit|tostring) else "" end)
    elif $t == "Edit" then
      "edit " + ($in.file_path // "?")
    elif $t == "Write" then
      "write " + ($in.file_path // "?") + " (" + (($in.content // "") | length | tostring) + " chars)"
    elif $t == "Grep" then
      "grep " + ($in.pattern // "?") + (if $in.glob then " glob=" + $in.glob else "" end)
    elif $t == "Glob" then
      "glob " + ($in.pattern // "?")
    elif $t == "Task" then
      "task " + ($in.subagent_type // "general") + ": " + ($in.description // "")
    else
      ($in | tostring | .[:200])
    end;

  # Process each line
  select(.type == "user" or .type == "assistant" or .type == "system")
  | if $since != "" then select(.timestamp >= $since) else . end
  | if $injections_only == "1" and (.message.content | tostring | test("<system-reminder>|<recall-memory|UserPromptSubmit hook") | not) then empty else . end
  | . as $ev
  | .timestamp as $ts
  | if .type == "system" then
      ["system", $ts, "", (.content // . | tostring | trunc($max_chars))] | @tsv
    elif .type == "user" then
      # User events can be: plain text prompt, tool_result, or injected system-reminder
      (.message.content) as $c
      | if ($c | type) == "string" then
          if ($c | test("<system-reminder>|<recall-memory|UserPromptSubmit hook")) then
            ["inject", $ts, "", ($c | trunc($max_chars))] | @tsv
          else
            ["user", $ts, "", ($c | trunc($max_chars))] | @tsv
          end
        elif ($c | type) == "array" then
          ($c | map(
            if .type == "tool_result" then
              ["tool_result", $ts, (.tool_use_id // ""), (.content | tostring | trunc($max_chars))] | @tsv
            elif .type == "text" then
              if (.text | test("<system-reminder>|<recall-memory|UserPromptSubmit hook")) then
                ["inject", $ts, "", (.text | trunc($max_chars))] | @tsv
              else
                ["user", $ts, "", (.text | trunc($max_chars))] | @tsv
              end
            else
              empty
            end
          ) | .[])
        else empty end
    elif .type == "assistant" then
      (.message.content) as $c
      | if ($c | type) == "array" then
          ($c | map(
            if .type == "text" then
              ["assistant", $ts, "", (.text | trunc($max_chars))] | @tsv
            elif .type == "thinking" and $show_thinking == "1" then
              ["thinking", $ts, "", (.thinking | trunc($max_chars))] | @tsv
            elif .type == "tool_use" then
              ["tool_use", $ts, .name, (fmt_tool_input(.name; .input))] | @tsv
            else
              empty
            end
          ) | .[])
        else empty end
    else empty end
JQ
)

# ── pipe jq output into a formatter ─────────────────────────────────────────

jq -r \
  --arg since "$since_cutoff" \
  --argjson max_chars "$max_chars" \
  --arg show_thinking "$show_thinking_flag" \
  --arg injections_only "$injections_flag" \
  "$jq_prog" \
  "$session" \
  2>/dev/null \
  | awk -F'\t' -v cu="$C_USER" -v ca="$C_ASSIST" -v ct="$C_TOOL" -v cr="$C_RESULT" -v cth="$C_THINK" -v ci="$C_INJECT" -v cs="$C_SYSTEM" -v cts="$C_TS" -v rst="$C_RST" '
    function ts(t) {
      # Trim "2026-04-23T00:48:42.419Z" → "00:48:42"
      return substr(t, 12, 8)
    }
    {
      kind=$1; t=$2; tool=$3; body=$4
      # unescape literal \n emitted by @tsv into real newlines for readability
      gsub(/\\n/, "\n", body)
      gsub(/\\t/, " ",  body)
      gsub(/\\"/, "\"", body)
      gsub(/\\\\/, "\\", body)
      switch (kind) {
        case "user":
          printf "%s[%s]%s %sUSER%s  %s\n\n", cts, ts(t), rst, cu, rst, body
          break
        case "assistant":
          printf "%s[%s]%s %sASSISTANT%s  %s\n\n", cts, ts(t), rst, ca, rst, body
          break
        case "thinking":
          printf "%s[%s]%s %sthinking%s  %s\n\n", cts, ts(t), rst, cth, rst, body
          break
        case "tool_use":
          printf "%s[%s]%s %s→ %s%s  %s\n", cts, ts(t), rst, ct, tool, rst, body
          break
        case "tool_result":
          printf "%s[%s]%s %s← result%s  %s\n\n", cts, ts(t), rst, cr, rst, body
          break
        case "inject":
          printf "%s[%s]%s %s⚠ INJECTION%s  %s\n\n", cts, ts(t), rst, ci, rst, body
          break
        case "system":
          printf "%s[%s]%s %sSYSTEM%s  %s\n\n", cts, ts(t), rst, cs, rst, body
          break
      }
    }
  '
