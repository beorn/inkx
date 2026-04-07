---
description: "Crawl all public marketing sites and find broken links — internal pages, external references, redirects gone bad"
argument-hint: "[--quick] [<site>]"
---

# Link Check Workflow

Crawl every public marketing site and report broken links — both internal
pages that 404 and outbound references that have died since the page was
written. Catches things SEO audits miss: dead third-party docs, renamed
GitHub repos, blog posts that moved, vendor sites that shut down.

## When to Run

- Monthly as part of `/marketing audit`
- After bulk content changes (new programmatic pages, blog wave)
- Before a launch (catch embarrassing 404s before announce traffic hits)
- After a known rename (GitHub repo moved, vendor site changed domain, etc.)

## Tooling

Uses [lychee](https://github.com/lycheeverse/lychee) — Rust async link
checker. Already in nixpkgs:

```bash
nix-install nixpkgs#lychee
```

The runner script lives at `scripts/check-site-links.sh`. It is the
single source of truth for which sites get crawled — keep it aligned with
the marketing SKILL.md "Sites" table.

## Sub-Commands

| Command | Scope |
|---------|-------|
| `/marketing link-check` | All public sites, depth 3, full crawl |
| `/marketing link-check --quick` | All sites, depth 1 (homepage + immediate links) |
| `/marketing link-check silvery.dev` | One site only |

The script accepts either bare hosts (`silvery.dev`) or full URLs
(`https://silvery.dev`).

## Sites Crawled

Aligned with `marketing/SKILL.md` Sites table:

- silvery.dev
- terminfo.dev
- termless.dev
- beorn.codes (umbrella + portfolio)
- beorn.codes/flexily
- beorn.codes/loggily
- beorn.codes/mdspec

If you launch a new public site, add it to the `ALL_SITES` array in
`scripts/check-site-links.sh`.

## How It Works

1. **Lychee does not recursively crawl HTML.** It checks the links found on
   the input pages you give it, but does not then follow them to discover
   more pages. To approximate full-site coverage, the script fetches each
   site's `sitemap.xml`, extracts every `<loc>` URL, and feeds that list
   to lychee via `--files-from`. Every page in the sitemap gets checked,
   and every outbound link on every page gets verified.
2. For every link, lychee issues HEAD (then GET on failure) and reports
   the status code.
3. The `--accept` list treats 200–204, 206, 301, 302, 303, 307, 308, 403,
   and 429 as "alive". 403 is permitted because some hosts (e.g.
   GitHub raw, Cloudflare-protected sites) reject lychee's User-Agent
   without actually being broken; 429 is a soft rate-limit signal.
4. Excludes: `mailto:`, `tel:`, `javascript:`, localhost, and Cloudflare
   internal `cdn-cgi/` paths (false positives).
5. Per-site results land in `/tmp/link-check-<timestamp>/<host>.txt`,
   per-site sitemap URL lists at `<host>.inputs.txt`.
6. A consolidated `SUMMARY.md` is written at the run root.

If a site has no sitemap or it can't be fetched, the script falls back to
checking the homepage only and warns in the output.

In `--quick` mode, the sitemap is skipped and only the homepage is checked
on each site (sanity check, ~5 seconds total).

## Reading the Output

```bash
ls /tmp/link-check-*/SUMMARY.md | tail -1 | xargs cat
```

The summary table shows total / ok / errors / excluded per site, plus a
"Broken links by site" section listing each failing URL grouped by source
page.

## Acting on Findings

For each broken link, classify:

| Cause | Action |
|-------|--------|
| **Our content references a renamed/moved URL** | Update the source page to the new URL. Add to a follow-up bead under `km-market`. |
| **Third-party site deleted the page** | Decide: replace with archived link (web.archive.org), pick an alternative source, or remove the citation. |
| **Genuine internal 404** (page deleted but linked) | Either restore the page, redirect, or remove the link. |
| **Rate-limited / temporary** | Re-run with `--max-retries 5` or check the host manually. |
| **Cloudflare/WAF false positive** | Add to the `EXCLUDE` regex with a comment explaining why. |

Track findings in beads: one bead per site with broken links is usually
the right granularity (`km-market.<site>-broken-links`).

## Tuning

The defaults assume you're running from a fast home connection. If you
hit rate limits:

- Lower `MAX_CONCURRENCY` (default 24 → 8)
- Raise `RETRY_WAIT` (default 3 → 10)
- Add the offending host to `EXCLUDE` if it's known-flaky

## Known Limitations

- Lychee does not execute JavaScript, so SPA-only links won't be
  followed. None of our marketing sites are SPAs (all VitePress static),
  so this is fine.
- `--include-fragments` is enabled, but lychee can only verify fragment
  anchors when the target is HTML it actually fetches. Cross-site
  fragments are not checked.
- Sitemap dependency: a page that exists but is not in `sitemap.xml` will
  not be checked. VitePress generates sitemaps from its routing config,
  so this should not happen in practice — but if you ever hand-author
  HTML outside the VitePress build, add it to the sitemap or it will be
  invisible to this checker.

## Integration With `/marketing audit`

The monthly `/marketing audit` workflow should run `/marketing link-check`
as one of its checks. Update the audit workflow to call this script and
roll any findings into its report.

## Complement: lychee-action in CI

This workflow is the **cross-site, on-demand** layer. For the
**per-repo, on-PR** layer, install
[lycheeverse/lychee-action](https://github.com/lycheeverse/lychee-action)
in each public-facing repo's CI:

```yaml
# .github/workflows/links.yml
name: links
on:
  pull_request:
  schedule: [cron: "0 6 * * 1"] # Mondays 06:00 UTC
jobs:
  lychee:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lycheeverse/lychee-action@v2
        with:
          args: --max-concurrency 24 --no-progress './**/*.md' './**/*.html'
          fail: true
```

The two layers catch different problems:

| Layer | Catches | Misses |
|-------|---------|--------|
| **lychee-action (per-repo, on-PR)** | New broken links introduced by a PR; periodic cron re-runs catch link rot | Cross-site links that break when site B deletes a page (site A's CI doesn't re-run unless site A changes) |
| **link-check workflow (cross-site, manual/monthly)** | Cross-site references gone bad; bit-rot in third-party links; sites without CI | Brand-new breaks introduced this week (no PR triggers detection until next monthly run) |

Recommended setup: **both**. lychee-action gives fast feedback at commit
time; the cross-site script is the safety net that catches the rest.
