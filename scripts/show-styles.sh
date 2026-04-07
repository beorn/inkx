#!/usr/bin/env bash
#
# show-styles.sh — open the styling showcase fixture in km view.
#
# Initializes the nested .km/ repo on first run, then opens the fixture
# as an interactive board. Use this to visually audit km's inline
# styling in all content states (broken wikilinks, tags, tasks, dim
# body, etc.) without polluting a real vault.

set -euo pipefail

FIXTURE="$(cd "$(dirname "$0")/.." && pwd)/apps/km-tui/fixtures/styling-showcase"

if [[ ! -d "$FIXTURE" ]]; then
  echo "error: fixture dir missing: $FIXTURE" >&2
  exit 1
fi

if [[ ! -d "$FIXTURE/.km" ]]; then
  echo "▶ first run: initializing nested km repo"
  (cd "$FIXTURE" && bun km init --force .)
  # Remove the GTD-style defaults that bun km init creates — the showcase
  # should contain ONLY the styling demonstration files.
  rm -f "$FIXTURE/@next.md" "$FIXTURE/@someday.md"
  rm -rf "$FIXTURE/inbox" "$FIXTURE/archive"
fi

exec bun km view "$FIXTURE"
