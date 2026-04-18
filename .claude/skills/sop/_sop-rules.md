# SOP Rules — MANDATORY for all domains and checks

Loaded by every `/sop` invocation. Every domain agent must follow these rules.

## The Shape

Every maintenance action follows the same shape:

```
scan → finding → proposal → approval → execute → verify → record
```

Never skip steps. A finding without a proposal is noise. A proposal without approval is dangerous. An execution without verification is trust-based (and trust-based doesn't work).

## Approval Rules

| Action Type | Approval | Examples |
|---|---|---|
| Read-only scan | auto | typecheck, lint, `bd stale`, `npm audit` |
| Idempotent fix | auto | `bun fix` (format), `bd close` stale beads |
| Dep update for CVEs | auto | `bun update` — follow dep update protocol (baseline → update → verify → bisect if broken) |
| Baseline update | **ask** | typecheck baseline reset, lockfile regeneration |
| Publish/release | **ask** | npm publish, git push, GitHub issue creation |
| Delete/destructive | **ask** | remove files, close beads, deprecate packages |
| External-facing | **ask** | post issues, send messages, update sites |

**"Fix" means fix.** If a check offers `--fix` and the fix is "update the baseline to accept the new errors," that's not a fix — that's hiding the problem. Flag it as a proposal, not an auto-fix.

## MECE Invariant (from gbrain/gstack)

**Every check, domain, and skill must be MECE — mutually exclusive, collectively exhaustive.**

No overlap, no gaps. One owner per process. If a user request could reasonably trigger two skills or two domains, that's a violation — fix the boundary, don't add a note.

### For domains:
1. Does this check already exist in another domain? If yes, don't duplicate.
2. Does this check clearly belong to this domain's boundary? If ambiguous, the boundaries need adjusting.
3. Could two domains both claim this check? Document the split — who owns which lens on the same data.

**One dep graph, three lenses**: packages owns freshness, security owns CVEs, legal owns licenses. Same `npm audit`, different questions.

### For skills:
- Each type of work has exactly one owner skill
- If an existing skill covers 70%+ of the work, **extend it** instead of creating a new one
- If creating new, define the boundary clearly: "this skill handles X, /other-skill handles Y"
- Use `/sop infra` skill-health check periodically to audit for MECE violations

### Decision protocol (from gbrain filing rules):
1. Identify the PRIMARY SUBJECT of the check/skill
2. Assign to the domain/skill that matches the subject
3. Cross-reference from related domains
4. When in doubt: what would you search for to find this again?

### Known MECE splits (resolved overlaps):
- **packages** owns dep freshness. **security** owns CVEs. **legal** owns licenses. One dep graph, three lenses.
- **code** owns test results. **packages** owns verify gate. **infra** owns CI health. Different questions about the same artifact.
- **/big vs /fresh** — /big = proactive reframe, /fresh = reactive unstuck. OK (documented in /big).
- **/audit, /review-all, /project-audit, /project-cleanup, /repo-health** — all absorbed into `/sop`. RESOLVED.

## Vendor Scope — vendor/* IS Part of This Project

**Rule:** Every SOP check scans `apps/`, `packages/`, AND `vendor/` by default. Vendor packages are first-class workspace members — silvery, termless, mdspec, bearly, etc. share the same quality bar as km's own code.

**This means:**
- Complexity, type-coverage, dead-code, lint, test, license, CVE, secret-scan, bundle-size, attw — all run across `vendor/*`.
- Sherif's "multiple dependency versions" findings spanning vendor are **real** consistency issues to fix (align versions), not "vendor independence" to whitelist.
- Knip's unused-export findings in vendor are **real** dead code, not "different repo's problem."
- Site/doc freshness checks must walk every vendor package's docs/, not just the showcase ones.
- Standalone-ready ≠ excluded: vendor packages must work outside km (no `workspace:*`), but their declared npm versions should still align with km root where compatible.

**Exclusion bar:** Excluding a vendor file or pattern requires an explicit per-target reason (e.g., `vendor/termless/packages/vt100/tests/backend.test.ts` is skipped from oxlint because it tests a backend that genuinely cannot run in the lint environment). Generic `vendor/**` exclusions in any check config are a violation — file a bead to remove them.

**When a check's tooling is vendor-shaped** (e.g., it operates on package.json files), it must enumerate vendor/* alongside packages/* — see `tools/sop-tools.ts` for canonical examples (`bundle-sizes`, `zero-dep`, `license-files` all walk `vendor/*/`).

**When proposing a new check or fix:** if the first instinct is "this doesn't apply to vendor," stop — that's almost always wrong. Either the check applies and vendor needs to comply, or the check itself is misframed.

## Finding Quality

A finding must be actionable or explicitly informational.

| Good Finding | Bad Finding |
|---|---|
| "3 packages with unreleased changes (silvery +14, loggily +3)" | "some packages may have changes" |
| "62 stale beads (30+ days without activity)" | "beads exist" |
| "GPL license found in 2 production deps: pkg-a, pkg-b" | "license check ran" |
| "tool versions: tsdown 0.21.7, oxlint 0.16.1" (informational) | "tools installed" |
| "hono <4.12.12 (5 mod) — NEGLIGIBLE: MCP uses stdio, not HTTP" | "12 CVEs found" |

A finding with status `pass` should still have a meaningful summary ("6227 tests pass", not "ok").

### CVE findings require impact analysis

Never report a CVE as just "high: pkg — advisory title". That's the advisory's severity, not *ours*. Always trace the dependency chain, check whether the vulnerable code path is exercised in our code, and classify the actual exposure:

| Exposure | When | Action |
|---|---|---|
| **HIGH** | Runtime code processes untrusted input through vulnerable path | Create bead immediately |
| **LOW** | Runtime code uses the dep, but only with our own data | Note in report, monitor upstream |
| **NEGLIGIBLE** | Dev-only tooling OR bundled but unreachable code path | Document once, suppress from future reports |

## Common Anti-Patterns — DO NOT DO THESE

| Anti-Pattern | What Actually Happened | Rule |
|---|---|---|
| Baseline reset as "fix" | typecheck `--fix` updated baseline to accept 267 new errors | **Never auto-accept regressions.** Baseline updates require explicit approval with a reason. |
| npm audit in non-npm project | `npm audit` fails because there's no package-lock.json (bun project) | **Use the right tool for the runtime.** Check if `bun audit` or `bun install --frozen-lockfile` is available. |
| Silent background failures | `recall summarize` in session-start hook silently fails, no summaries generated for weeks | **Every background job must have observable output.** Log to a stamp file, check for staleness. |
| "No unprocessed days" false negative | `recall summarize` default mode reports nothing to do when nothing has ever been summarized | **Verify tool output matches reality.** If the tool says "nothing to do" but no artifacts exist, the tool is wrong. |
| False pass on skipped checks | "no link check scripts found (skipped)" reported as pass | **Skipped ≠ passed.** Use a distinct status or clearly label as skipped. |
| Counting output lines as findings | Parser counts stdout lines to determine severity, but output format varies | **Parse structured output (JSON, exit codes) when available.** Line counting is a last resort. |
| npm search API for version audit | `npm-registry audit` uses search API which caches stale versions; `npm view` is authoritative | **Use `npm view <pkg> version` for version checks, not search results.** Search API can lag days behind. |
| `bun update` without typecheck | `@sinonjs/fake-timers` 15.2→15.3 renamed `InstalledClock`→`Clock`, breaking typecheck | **After `bun update`, always re-run typecheck and fix cascading type errors.** Dep updates are not just lockfile changes. |
| Redirect stubs after skill absorption | 12 stub directories accumulated over 3 consolidation sessions, never cleaned up | **Delete absorbed skill directories immediately.** CLAUDE.md ~~strikethrough~~ is the redirect — stubs are dead weight. |

## When You Discover a New Anti-Pattern

This is how `/sop` learns. When a check produces a misleading result, or a "fix" doesn't actually fix:

1. **Record immediately** — add the anti-pattern to this file's table above
2. **Fix the check** — update the parser in `tools/sop.ts` to handle the case correctly
3. **Add a gotcha** — if the anti-pattern is domain-specific, add it to the domain's check definition as a comment
4. **Broadcast** — `tribe.broadcast("SOP gotcha: [description]. Updated _sop-rules.md.")` so other sessions learn

**The table above is append-only during a session.** Don't remove entries — they're institutional memory. Mark obsolete entries with `(FIXED: date)` when the underlying check is fixed.

## `/sop update` Self-Improvement Protocol

After any `/sop` run that surfaces problems, run this checklist:

1. **Were any findings misleading?** Add to anti-pattern table.
2. **Were any checks too noisy?** Adjust thresholds or parsing.
3. **Were any checks missing?** Propose a new check in the right domain.
4. **Did a domain boundary feel wrong?** Document the tension, propose adjustment.
5. **Did a fix not actually fix?** Reclassify as ask-approval.
6. **Did a background process silently fail?** Add observability (stamp file, health check).

Each improvement is a one-line change to this file, `tools/sop.ts`, or `SKILL.md`. Capture it immediately — don't defer to a bead unless it's architectural.

### Promote to gbrain (for durable lessons)

If the discovery is broadly useful beyond SOP (e.g., "npm audit doesn't work without package-lock.json in bun projects"), promote it to gbrain:

```bash
gbrain put "sessions/sop-lesson-<slug>" --title "SOP lesson: <title>" --tags sop,lesson
```

Use the compiled-truth/timeline format:
- Compiled truth: the rule or lesson in durable prose
- Timeline: when discovered, what triggered it

This is how SOP builds institutional memory — anti-patterns stay in `_sop-rules.md` for immediate use, but durable lessons also flow to gbrain for cross-project retrieval.

## Cadence Discipline

- **session** checks run every time — they must be fast (<30s each)
- **weekly** checks can be slow but shouldn't exceed 2 minutes total
- **monthly** checks can take 5+ minutes (full verify, deep audit)
- **quarterly** checks are thorough and may involve external tools

If a session-cadence check consistently takes >30s, either optimize it or downgrade to weekly.

## Tribe Protocol

- Broadcast at scan start: what domains, how many checks
- Broadcast per-domain findings: only warn/error (don't spam passes)
- Broadcast before execute: "about to [action], last call for objections"
- Wait 30s for tribe responses before auto-executing
- Any session can `block: [reason]` to halt a specific action

## Provenance

Every finding must trace back to a check command. Every action must trace back to a finding. The dashboard shows the chain: `domain.check → finding → proposed action → result`.

State in `state.json` preserves the last findings per domain so `dashboard` can render without re-running.
