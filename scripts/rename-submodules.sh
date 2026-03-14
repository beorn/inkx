#!/bin/bash
set -e
cd "$(git rev-parse --show-toplevel)"

# Phase 3: Remove all 10 submodules, re-add 8 at new paths
# (ansi and silvery-ui are merged into silvery, so they're not re-added)

# Record SHAs before removal
declare -A SHAS
SHAS[silvery]=$(cd vendor/silvery && git rev-parse HEAD)
SHAS[flexture]=$(cd vendor/flexture && git rev-parse HEAD)
SHAS[swatch]=$(cd vendor/swatch && git rev-parse HEAD)
SHAS[decant]=$(cd vendor/decant && git rev-parse HEAD)
SHAS[vitestx]=$(cd vendor/vitestx && git rev-parse HEAD)
SHAS[mdtest]=$(cd vendor/mdtest && git rev-parse HEAD)
SHAS[termless]=$(cd vendor/termless && git rev-parse HEAD)
SHAS[tools]=$(cd vendor/tools && git rev-parse HEAD)

echo "=== Recorded SHAs ==="
for k in "${!SHAS[@]}"; do echo "  $k: ${SHAS[$k]}"; done

# Remove all submodules
for sub in silvery/packages/ansi silvery/packages/ui silvery flexture swatch decant vitestx mdtest termless tools; do
  echo "--- Removing vendor/$sub ---"
  git submodule deinit -f "vendor/$sub"
  git rm -f "vendor/$sub"
  rm -rf ".git/modules/vendor/$sub"
done

echo "=== All submodules removed ==="

# Re-add submodules at new paths with new URLs
declare -A URLS
URLS[silvery]="git@github.com:beorn/silvery.git"
URLS[flexture]="git@github.com:beorn/flexture.git"
URLS[swatch]="git@github.com:beorn/swatch.git"
URLS[decant]="git@github.com:beorn/decant.git"
URLS[vitestx]="git@github.com:beorn/vitestx.git"
URLS[mdtest]="git@github.com:beorn/mdspec.git"
URLS[termless]="git@github.com:beorn/termless.git"
URLS[tools]="git@github.com:beorn/tools.git"

for name in silvery flexture swatch decant vitestx mdtest termless tools; do
  echo "--- Adding vendor/$name (${URLS[$name]}) ---"
  git submodule add "${URLS[$name]}" "vendor/$name"
  cd "vendor/$name"
  git checkout "${SHAS[$name]}"
  cd ../..
done

echo "=== All submodules re-added ==="

# Rename non-submodule directories
for old_new in "accountly:accountly" "tap:tap" "watcher-chaos:watcher-chaos"; do
  old="${old_new%%:*}"
  new="${old_new##*:}"
  if [ -d "vendor/$old" ]; then
    echo "--- Moving vendor/$old → vendor/$new ---"
    mv "vendor/$old" "vendor/$new"
  fi
done

echo "=== Non-submodule dirs renamed ==="
echo "DONE. Run 'git status' to verify."
