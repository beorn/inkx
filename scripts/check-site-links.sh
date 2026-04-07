#!/usr/bin/env bash
#
# check-site-links.sh — crawl all public marketing sites and report broken links.
#
# Uses lychee (Rust-based async link checker) to recursively follow internal
# links from each site root, then verify the status of every external link
# encountered. Output is per-site, with a final consolidated summary.
#
# Usage:
#   scripts/check-site-links.sh                  # all sites, default depth
#   scripts/check-site-links.sh --quick          # depth 1, faster sanity check
#   scripts/check-site-links.sh silvery.dev      # one site only
#
# Output goes to /tmp/link-check-<timestamp>/<site>.txt and a SUMMARY.md is
# written at the top level. Exit code is non-zero if any site had broken links.

set -o pipefail
# Note: deliberately NOT using `set -u` — lychee summary parsing tolerates
# missing fields by defaulting to "?" / 0 rather than crashing the whole run.

if ! command -v lychee >/dev/null 2>&1; then
  echo "error: lychee not installed. Run: nix-install nixpkgs#lychee" >&2
  exit 2
fi

# Sites to check — keep aligned with marketing/SKILL.md "Sites" table.
# github.com/beorn is included because GitHub repo metadata (homepage URL,
# README links, pinned-repo descriptions) is part of our marketing surface.
# Recently bitten: bearly's homepage URL still pointed at the dead beorn.github.io/tools.
ALL_SITES=(
  "https://silvery.dev"
  "https://terminfo.dev"
  "https://termless.dev"
  "https://beorn.codes"
  "https://beorn.codes/flexily"
  "https://beorn.codes/loggily"
  "https://beorn.codes/mdspec"
  "https://github.com/beorn"
)

QUICK=0
SITES=()
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --help|-h)
      sed -n '3,17p' "$0"
      exit 0 ;;
    *)
      # Allow either bare host or full URL
      if [[ "$arg" =~ ^https?:// ]]; then
        SITES+=("$arg")
      else
        SITES+=("https://$arg")
      fi
      ;;
  esac
done

if [[ ${#SITES[@]} -eq 0 ]]; then
  SITES=("${ALL_SITES[@]}")
fi

# Lychee tuning. Conservative defaults so we don't get rate-limited.
MAX_CONCURRENCY=24
TIMEOUT=20
RETRY_WAIT=3
USER_AGENT="km-link-checker/1.0 (+https://beorn.codes; lychee)"
ACCEPT="200..=204,206,301,302,303,307,308,403,429"
EXCLUDE='^(mailto|tel|javascript):|^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)|^https?://[^/]+/cdn-cgi/'

# In quick mode, just check the homepage (no sitemap).
QUICK_MODE_HOMEPAGE_ONLY=$QUICK

if [[ $QUICK -eq 1 ]]; then
  MAX_CONCURRENCY=16
fi

OUT_DIR="/tmp/link-check-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
echo "▶ output: $OUT_DIR"
mode="full (sitemap)"
[[ $QUICK -eq 1 ]] && mode="quick (homepage only)"
echo "▶ mode=$mode concurrency=$MAX_CONCURRENCY timeout=${TIMEOUT}s sites=${#SITES[@]}"
echo

# Track per-site stats for the summary.
declare -A SITE_TOTAL SITE_OK SITE_BAD SITE_EXCLUDED SITE_DURATION
EXIT=0

for site in "${SITES[@]}"; do
  slug="$(echo "$site" | sed -E 's|https?://||; s|/|_|g')"
  raw="$OUT_DIR/${slug}.raw.txt"
  txt="$OUT_DIR/${slug}.txt"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $site"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  start=$(date +%s)

  # Two-pass strategy:
  # Pass 1 — recursively crawl this site only (no externals), respect robots.
  #          This produces an exhaustive list of internal pages.
  # Pass 2 — for the gathered pages, check ALL outbound links (internal + external)
  #          using --base so relative URLs resolve.
  #
  # We do both passes in a single lychee invocation by enabling --include-verbatim,
  # --include-fragments, and depth=N with --base set to the site root.

  # Lychee does not recursively crawl HTML — it checks every link on the input
  # pages you give it. To approximate "check every link on every page of the
  # site", we feed it the sitemap URLs as inputs. Sitemaps are mandatory for
  # all our marketing sites (per marketing/SKILL.md infrastructure phase).
  inputs_file="$OUT_DIR/${slug}.inputs.txt"
  sitemap_url="${site%/}/sitemap.xml"
  if [[ $QUICK -eq 1 ]]; then
    echo "$site" >"$inputs_file"
    page_count=1
    echo "  quick: homepage only"
  elif curl -fsSL --max-time 15 "$sitemap_url" 2>/dev/null \
       | grep -oE '<loc>[^<]+</loc>' \
       | sed -E 's|</?loc>||g' >"$inputs_file" \
    && [[ -s "$inputs_file" ]]; then
    page_count=$(wc -l <"$inputs_file" | tr -d ' ')
    echo "  sitemap: $page_count pages"
  else
    # Fall back to homepage-only if sitemap is missing/empty.
    echo "$site" >"$inputs_file"
    page_count=1
    echo "  no sitemap → homepage only"
  fi

  set +e
  lychee \
    --max-concurrency "$MAX_CONCURRENCY" \
    --max-redirects 10 \
    --max-retries 2 \
    --retry-wait-time "$RETRY_WAIT" \
    --timeout "$TIMEOUT" \
    --user-agent "$USER_AGENT" \
    --accept "$ACCEPT" \
    --exclude "$EXCLUDE" \
    --no-progress \
    --format detailed \
    --include-fragments \
    --base-url "$site" \
    --files-from "$inputs_file" \
    >"$raw" 2>&1
  rc=$?
  set -e
  end=$(date +%s)
  duration=$((end - start))

  # Strip ANSI color codes for the on-disk report.
  sed -E 's/\x1b\[[0-9;]*[mK]//g' "$raw" >"$txt"
  rm -f "$raw"

  # lychee 0.23 emoji-prefixed summary lines look like:
  #   🔍 Total..........105
  #   ✅ Successful.....103
  #   🔀 Redirected.......2
  #   👻 Excluded.........0
  #   🚫 Errors...........0
  # Strip leading non-digits, then take the trailing integer.
  extract() {
    local label="$1"
    grep -E "$label\.+[0-9]+" "$txt" | tail -1 | sed -E 's/.*[^0-9]([0-9]+)\s*$/\1/'
  }
  total=$(extract "Total")
  ok=$(extract "Successful")
  errors=$(extract "Errors")
  excluded=$(extract "Excluded")
  redirects=$(extract "Redirected")
  : "${total:=0}" "${ok:=0}" "${errors:=0}" "${excluded:=0}" "${redirects:=0}"

  SITE_TOTAL[$site]=${total:-0}
  SITE_OK[$site]=${ok:-0}
  SITE_BAD[$site]=${errors:-0}
  SITE_EXCLUDED[$site]=${excluded:-0}
  SITE_DURATION[$site]=$duration

  printf "  total=%s ok=%s errors=%s redirects=%s excluded=%s (%ds)\n" \
    "${total:-?}" "${ok:-?}" "${errors:-?}" "${redirects:-?}" "${excluded:-?}" "$duration"

  if [[ "${errors:-0}" != "0" && -n "${errors:-}" ]]; then
    EXIT=1
    echo "  ✗ broken links — see $txt"
  else
    echo "  ✓ clean"
  fi
  echo
done

# Build SUMMARY.md
SUMMARY="$OUT_DIR/SUMMARY.md"
{
  echo "# Link Check Summary — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Tool: lychee 0.23.0  ·  depth=$MAX_DEPTH  ·  concurrency=$MAX_CONCURRENCY"
  echo
  echo "| Site | Total | OK | Errors | Excluded | Duration |"
  echo "|------|------:|---:|-------:|---------:|---------:|"
  for site in "${SITES[@]}"; do
    printf "| %s | %s | %s | %s | %s | %ds |\n" \
      "$site" \
      "${SITE_TOTAL[$site]}" \
      "${SITE_OK[$site]}" \
      "${SITE_BAD[$site]}" \
      "${SITE_EXCLUDED[$site]}" \
      "${SITE_DURATION[$site]}"
  done
  echo
  echo "## Broken links by site"
  echo
  for site in "${SITES[@]}"; do
    if [[ "${SITE_BAD[$site]:-0}" != "0" ]]; then
      slug="$(echo "$site" | sed -E 's|https?://||; s|/|_|g')"
      echo "### $site"
      echo
      echo '```'
      # lychee 0.23 detailed format prints sections like:
      #   Errors in https://source/page
      #   [404] https://example.com/dead | Rejected status code: ...
      grep -E "^(Errors in |\[[0-9]+\] )" "$OUT_DIR/${slug}.txt" 2>/dev/null || true
      echo '```'
      echo
    fi
  done
  if [[ $EXIT -eq 0 ]]; then
    echo "**All sites clean.**"
  fi
} >"$SUMMARY"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary: $SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $EXIT
