#!/usr/bin/env bash
# Workspace dependency consistency check via sherif.
# Vendor packages are git submodules with their own version policies —
# we ignore them to focus on km-owned package consistency.
set -euo pipefail

exec bunx sherif \
  -p accountly -p '@beorn/bearly' -p flexily -p loggily -p silvery \
  -p '@beorn/tap' -p terminfo.dev -p vimonkey -p termless -p vterm \
  -p '@silvery/ag' -p '@silvery/ag-react' -p '@silvery/ag-term' -p '@silvery/ansi' \
  -p '@silvery/color' -p '@silvery/commander' -p '@silvery/commands' -p '@silvery/create' \
  -p '@silvery/headless' -p '@silvery/ink' -p '@silvery/model' -p '@silvery/scope' \
  -p '@silvery/signals' -p '@silvery/test' -p '@silvery/theme' -p '@silvery/selection' \
  -p '@termless/core' -p '@termless/alacritty' -p '@termless/cli' -p '@termless/ghostty' \
  -p '@termless/ghostty-native' -p '@termless/kitty' -p '@termless/libvterm' \
  -p '@termless/peekaboo' -p '@termless/viterm' -p '@termless/vt100' -p '@termless/vt220' \
  -p '@termless/vterm' -p '@termless/wezterm' -p '@termless/xtermjs' \
  -p '@beorn/alien-projections' -p '@beorn/alien-resources' -p vitepress-enrich \
  -p vitest-silvery-dots -p '@beorn/watcher-chaos' \
  -p 'vt100.js' -p 'vt220.js' -p 'vterm.js' \
  -r packages-without-package-json \
  -r non-existant-packages \
  -r root-package-manager-field \
  "$@"
