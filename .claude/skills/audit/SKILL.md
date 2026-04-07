---
description: "Audit orchestrator — one skill that runs all our system audits (links, SEO, legal, repo metadata, code quality, package health) and produces a unified dashboard."
argument-hint: "[all|due|<audit-name>] [--strict] [--quick]"
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
---

# Audit — One Skill To Rule Them All

**Keywords**: audit, audits, audit all, audit due, health check, sop, runbook

`/audit` is the **central orchestrator** for every system audit we run across km, vendor/*, and the public marketing sites. It does not implement the audits itself — each sub-audit lives in its own home skill (`/marketing link-check`, `/marketing seo-check`, `/marketing legal`, `/code quality`, `/repo-health`, `/silverize`, etc.). This skill knows the **registry** of audits, their **cadences**, and how to **invoke** them in order.

Bead: `km-infra.audit-all` (the design + roadmap for the orchestrator)

## Why This Exists

We have ~16 audit-style workflows scattered across `/marketing`, `/complete`, `/code`, `/project-audit`, `/repo-health`, `/review-all`, `/infra`, `/legal`, `/silverize`, `/fp-check`. Each runs in isolation, has its own report format, and tracks its own freshness (or doesn't). That fragmentation means:

1. We under-audit — running them individually is friction
2. We can't see the whole picture — there's no dashboard
3. Adding a new audit costs hours of glue
4. Audits drift out of sync because there's no central cadence

`/audit` is the aggregator. Each sub-audit stays in its home skill (where it belongs); this one calls them, collects results, and produces a single dashboard.

## Reality Check — What Works Today

This skill is **partially implemented**. Read this section before running anything.

| Command | Status today | Notes |
|---------|--------------|-------|
| `/audit links` | **Works** | Runs `scripts/check-site-links.sh`. Produces `/tmp/link-check-<ts>/SUMMARY.md`. |
| `/audit all` | **Partial** | Runs only the 3 operational audits below; lists the rest as skipped. |
| `/audit <one of: links, code-quality, infra-health>` | **Works** | Invoke per the registry `Command` column. |
| Everything else (`due`, `list`, `--status`, `--strict`, most registry rows) | **Not yet implemented** | The `bun audit` dispatcher, `.audits/lastrun.json` tracking, and the SUMMARY dashboard renderer are all on the roadmap (see km-infra.audit-all). Until then, treat the rest of this document as **specification**, not runnable. |

**Operational audits today** (3): `links`, `code-quality`, `infra-health`. Every other registry row is either "manual checklist in home skill" (run via its own `/marketing …` command) or `(planned)` (not callable).

If a user invokes a non-operational command, the skill's job is to **say so clearly** and offer the working alternatives — not attempt an execution that will fail.

## Routing: when the user asks by target, not by audit name

Users naturally say things like "run the audit for km-storage" or "audit silvery.dev". Those are **target-scoped** requests. `/audit` is indexed by audit *type*, not *target*. When you hear a target-scoped ask, route as follows:

| User says | Target type | Where it goes |
|-----------|-------------|---------------|
| "audit `<package-name>`" (e.g. km-storage, silvery) | Package | `/project-audit <package>` or `/repo-health <package>` — NOT this skill |
| "audit `<site>`" (e.g. silvery.dev) | Site | `/marketing link-check <site>` + `/marketing seo-check <site>` |
| "audit the beads backlog" | PM state | `/pm doctor` + `/pm preflight` |
| "run all audits" / "audit everything" / "monthly audit" | Registry | **Use this skill** (`/audit all`) |
| "lychee check" / "broken links" / "link rot" | Registry entry | **Use this skill** (`/audit links`) |

Rule of thumb: if the user names an *audit type* (links, seo, legal, lighthouse, schema), stay here. If they name a *target* (package, site, subsystem), dispatch to the appropriate package-level skill and stop.

## Quick Commands

| Command | What it does |
|---------|--------------|
| `/audit` or `/audit all` | Run every registered audit, produce unified SUMMARY |
| `/audit due` | Run only audits whose cadence has elapsed since last run |
| `/audit <name>` | Run one audit (e.g. `/audit links`, `/audit seo`) |
| `/audit --status` | Show last-run timestamps + next-due dates without running anything |
| `/audit list` | Show the registry of all known audits |
| `/audit all --strict` | Fail-fast: any audit error blocks the dashboard |
| `/audit all --quick` | Use each audit's quick mode (homepage-only for link-check, etc.) |

## Audit Registry

Each audit has a name, home skill, cadence, command, and parser. The registry is the canonical list — adding a new audit means adding a row here.

| Name | Home skill | Cadence | Command | Notes |
|------|-----------|---------|---------|-------|
| **links** | `/marketing link-check` | monthly | `scripts/check-site-links.sh` | Cross-site lychee crawl, sitemap inputs |
| **seo** | `/marketing seo-check` | monthly | (manual checklist) | Should automate via lighthouse-ci |
| **legal** | `/marketing legal` | quarterly | (manual checklist) | License + dependency + privacy |
| **repo-metadata** | `/infra repo-metadata` (planned) | monthly | `gh api repos/beorn/*` | Bead km-infra.repo-metadata-audit |
| **code-quality** | `/code quality` | per-PR | `bun fix && bun run test:fast` | Already runs on every commit |
| **package-health** | `/repo-health` | monthly | (per-package script) | License, gitignore, metadata |
| **silvery-alignment** | `/silverize` | quarterly | (per-package audit) | Philosophy + components + theme tokens |
| **completeness** | `/complete` | session-end | (manual checklist) | Remnants, stale docs, unclosed beads |
| **infra-health** | `/infra` | weekly | `gh run list` per repo | CI/CD pipeline status |
| **schema-validity** | (planned) | monthly | (planned) | JSON-LD schema.org validator |
| **image-audit** | (planned) | monthly | (planned) | OG images PNG, ≤100KB, dimensions present |
| **sitemap-audit** | (planned) | monthly | (planned) | Well-formed, lastmod, no 404s |
| **doc-code-drift** | (planned) | monthly | (planned) | Docs pointing at code paths that don't exist |
| **tls-headers** | (planned) | quarterly | (planned) | securityheaders.com / mozilla observatory |
| **lighthouse-perf** | (planned) | weekly | (planned) | Core Web Vitals on every public page |
| **package-consistency** | (planned) | monthly | (planned) | Vendor packages share TS / vitest / eslint versions |

**Adding a new audit**: 
1. Implement it in its home skill (or create a new skill if it doesn't fit)
2. Add a row to the registry above
3. Bead under `km-infra.audit-all` with implementation notes

## Invocation Protocol

For each registry row, the **`Command` column is authoritative** — it says what to run. The `Home skill` column is metadata about where the logic lives, not an invocation target.

Concretely, for each row:

1. If `Command` is a **shell command or script path** (e.g. `scripts/check-site-links.sh`, `bun fix && bun run test:fast`, `gh run list`): run it directly via the Bash tool.
2. If `Command` is `(manual checklist)`: **do not attempt to execute**. Instead, tell the user the audit is a manual walk-through and offer to invoke the home skill (e.g. `/marketing legal`) so they can follow it interactively. List the audit in the dashboard as "requires human".
3. If `Command` is `(per-package script)` or `(per-package audit)`: the audit needs a package argument. If the caller did not supply one, ask via AskUserQuestion. If they did, pass it to the home skill's per-package entry point.
4. If `Command` is `(planned)`: the audit does not exist yet. **Do not try to run it.** See "Handling (planned) audits" below.

**The orchestrator does NOT invoke sub-skills via the Skill tool.** Sub-skill invocation would be a separate conversation with its own context; the orchestrator needs the output in the same context to build a dashboard. Use Bash for scripts; for manual audits, surface the home skill name and stop.

## Handling `(planned)` audits

When a registry row's `Command` (or `Home skill`) is `(planned)`:

- `/audit <planned-name>` — Respond with: "`<name>` is registered but not yet implemented. Tracked in `km-infra.audit-all`. Runnable alternatives: `/audit list` to see operational audits, `/audit links` to run the link checker." Do not attempt execution.
- `/audit all` — Skip the row with a `[skipped: not implemented]` line in the dashboard output. Do not fail the overall run.
- `/audit due` — Never include planned audits in the due set (treat them as not-yet-born).

`(planned)` is a terminal state for the current invocation — never try to improvise a replacement.

## Cadence Definitions

| Cadence | Frequency | Trigger |
|---------|-----------|---------|
| `per-PR` | Per pull request | CI workflow |
| `session-end` | Per session | Manual via `/complete` |
| `weekly` | Mondays 06:00 UTC | Cron in CI + manual |
| `monthly` | First Monday of month | Manual via `/marketing audit` or `/audit all` |
| `quarterly` | Jan / Apr / Jul / Oct first Monday | Manual |

## Last-Run Tracking

Stored in `.audits/lastrun.json` at the repo root. Format:

```json
{
  "links": "2026-04-06T18:30:47Z",
  "seo": "2026-04-02T00:00:00Z",
  "legal": "2026-01-15T00:00:00Z",
  ...
}
```

`/audit due` reads this file and runs only audits whose `lastrun + cadence < now`. `/audit <name>` runs that audit and updates its row regardless of due date.

### First run — missing `.audits/lastrun.json`

If the file does not exist when `/audit due` is invoked:

1. **Do not silently create it empty and skip everything** — that hides the fact that nothing ran.
2. **Do not run every audit unprompted** — `/audit all` can take an hour on a monthly cadence; running it without consent is surprising.
3. **Ask** via AskUserQuestion: "`.audits/lastrun.json` does not exist — this is the first `/audit due` run. Options: (a) treat all audits as overdue and run them, (b) initialize an empty lastrun file and run nothing (you can invoke audits individually), (c) abort. Which?"

This is one of the carve-outs where "just do both" doesn't apply — the consequences diverge sharply and the user needs to pick.

For `/audit <name>` (single audit): the missing file is harmless; create it with just that audit's row on completion.

## Output Format

Each audit produces its own native output (per-audit conventions). The orchestrator wraps each in a section and writes a top-level dashboard:

```
.audits/run-<timestamp>/
├── SUMMARY.md          ← Dashboard: pass/fail per audit, key findings
├── links/              ← /tmp/link-check-* contents (or symlinks)
├── seo/
├── legal/
└── ...
```

The dashboard SUMMARY.md is the primary deliverable. Drill into per-audit dirs for detail.

## After the Audit: Report, Don't Fix

**This is the most important rule in the skill.** `/audit` REPORTS findings. It does NOT fix them.

When an audit surfaces problems (broken links, license violations, stale docs, 404s, schema errors, whatever):

1. **Produce the dashboard / SUMMARY.md** — that's the deliverable.
2. **File findings as beads** — one bead per site/package/theme, under the appropriate scope (e.g. `km-marketing.broken-links-<YYYY-MM>`, `km-infra.repo-metadata-drift-<YYYY-MM>`). Beads get triaged through `/pm`.
3. **Stop.** Do not start editing source files to fix the findings.

Why this boundary is strict:

- Audits frequently produce dozens to hundreds of findings. Auto-fixing them unprompted is a 3+ package change the user didn't authorize.
- Many findings need judgment (should we update the citation, pick a new source, or delete the reference?) — that judgment belongs to the user, not the agent.
- Fixes touch multiple repos (vendor submodules, km root, external projects). That's architectural scope per `CLAUDE.md`'s "Ask first" boundary.
- Separating audit from remediation means the audit can re-run tomorrow and produce the same numbers — a mixed audit+fix loop never converges.

**If the user explicitly asks you to fix a specific bucket of findings ("fix the silvery → terminfo broken links")**: proceed, but as a separate task after the audit is complete. Do not interleave.

**In `/release` pre-flight mode**: findings are SOFT warnings. Surface the SUMMARY path, note the count, and ask the user whether to proceed with the release. Do not block, do not fix.

## Integration With Other Skills

| Caller | When | What it calls |
|--------|------|---------------|
| `/marketing audit` | Monthly content audit | Calls `/audit links seo schema-validity image-audit sitemap-audit` |
| `/release <pkg>` | Pre-flight before npm publish | Calls `/audit links` for the affected site (soft warning) |
| `/review-all` | Quarterly mega-review | Calls `/audit all` |
| `/complete` | Session end | Calls `/audit completeness` only |
| `/infra ci` | CI health check | Calls `/audit infra-health` |

## Status

**Current state**: Just the registry and CLI sketch. Most "(planned)" rows still need their home-skill audit implemented before this orchestrator can call them.

**Next steps** (in order):
1. Add `bun audit` CLI that reads the registry and dispatches
2. Wire `links` (already implemented in `scripts/check-site-links.sh`)
3. Implement `repo-metadata` (km-infra.repo-metadata-audit) — first new audit caught by /big analysis
4. Migrate one existing audit (`legal`?) into the registry
5. Add `lastrun.json` tracking + `--status` command
6. Build the SUMMARY.md dashboard renderer

See `km-infra.audit-all` for the full design + roadmap.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Implement audit logic in this skill | Each audit lives in its home skill — this skill only orchestrates |
| Add audits ad-hoc without registering | Drift means the dashboard misses things |
| Make all audits run on every invocation | Use cadences + `due` mode to keep daily runs fast |
| Block on audit failures by default | Most are soft warnings; only `--strict` mode blocks |
| Reinvent the report format per audit | Each audit's native format is fine; the orchestrator unifies via SUMMARY.md |
| **Auto-fix findings after an audit run** | See "After the Audit: Report, Don't Fix" — findings go to beads, user triages |
| **Invoke a `(planned)` audit by improvising** | See "Handling `(planned)` audits" — report unavailable, offer alternatives |
| **Call sub-audit skills via the Skill tool** | Use Bash for scripts; sub-skill Skill invocations run in a separate context and can't write into the orchestrator's dashboard |
| **Treat a package name as an audit name** | See "Routing" — package asks go to `/project-audit` or `/repo-health`, not this skill |
| **Silently create an empty `.audits/lastrun.json` on first run** | See "First run" — ask the user, don't assume |
