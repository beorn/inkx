---
description: "Architectural-decision protocol — doc-first discovery, arch-agent opinion on a curated bundle, mandatory retro, gating for /max. Use BEFORE proposing any change to identity, storage, persistence, the loader, public API surface, or core data model. Skill enforces, not advisory."
argument-hint: "<topic — e.g. 'path-vs-ULID-as-sqlite-pkey'>"
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent, AskUserQuestion
benefits-from: [recall, pm]
---

# /arch — Architectural-Decision Protocol

**Keywords**: arch, architecture, identity, storage, schema, persistence, data model, public API, loader, design decision

**This is a protocol, not an LLM tool.** It walks the lead through 4 explicit phases, spawns the `arch` sub-agent in Phase 2 with a curated bundle (the agent does NOT re-discover), enforces a written retro, and produces a drift-checker entry that `/max` consults before spawning execution agents.

**The Topic**: $ARGUMENTS

If no argument: ask the user what topic. Don't assume.

---

## When `/arch` is MANDATORY

Run `/arch <topic>` BEFORE you draft a plan, file beads, or spawn agents — if any of these are true:

| Trigger | Examples |
|---|---|
| **Identity / id shape** | bead id form, ULID vs path, frontmatter `id:` contract, alias resolution |
| **Storage / persistence** | SQLite schema, on-disk shape, repo-api, KNode shape, KTree shape, materialization |
| **Loader / lifecycle** | repo discovery, vault scan, mount/unmount, cleanup, scope cascade |
| **Public API surface** | exports of any package, CLI command shape, frontmatter contract, link URI scheme |
| **Cross-cutting boundary** | pipeline boundaries, layout engine, rendering output phase, layer rules |
| **Core data model** | Item-vs-block classification, board hierarchy rules, Link rel taxonomy |

**Trigger heuristic**: if a single change description names ≥3 packages, or names anything in `packages/km-core/` / `packages/km-storage/` / identity code in `packages/km-beads/` — `/arch` is mandatory.

If `/arch` was NOT mandatory but you ran it anyway, no harm done. If it was mandatory and you skipped it, `/max`'s Step 0 will block.

---

## Phase 1 — Discovery (lead's own context)

**Do this yourself; do NOT delegate to an agent.** The point is that the lead has read the canonical material before forming an opinion.

### 1a. Build the canonical doc list

Read EVERY canonical doc that touches `<topic>`:

```bash
# Required reading paths (read in full, not skimmed):
ls docs/design/model/*.md docs/architecture.md docs/principles.md docs/lessons/*.md 2>/dev/null
ls vendor/*/docs/**/*.md 2>/dev/null | grep -i <topic-keyword>
```

| Authority | Source |
|---|---|
| **Always canonical** | `docs/design/model/*.md`, `docs/architecture.md`, `docs/principles.md`, `docs/lessons/*.md`, `vendor/*/docs/**/*.md` (promoted public package docs) |
| **EXCLUDE from this phase** | `hub/<project>/design/*.md` — draft territory per CLAUDE.md promotion flow. Do NOT cite as authority. (See `feedback-hub-docs-are-drafts-not-canonical.md`.) |
| **Always draft (never authority)** | `hub/<project>/futures.md`, `hub/<project>/0LD/`, `hub/<project>/202?-*-retrospectives/` |

### 1b. Build the close-reason corpus

Search closed beads by keyword + tag, then read **close-reasons verbatim** — not just titles or `closed_at`:

```bash
# Find candidate beads (keyword + tag search):
km bd list --status closed | grep -i <topic-keyword>
# For each candidate, read the close reason in full:
km bd show <id>
# Or grep close-reason fields directly across all closed bead files:
grep -l "<topic-keyword>" @*/*/*.md | xargs grep -l "^closed_at:"
```

Required: ≥3 close-reasons quoted in the bundle, verbatim. Frontmatter `closed_at:` is NOT a substitute — the *reason* is the design record.

### 1c. Assemble the curated bundle

Write the bundle to `/tmp/arch-<topic>.md` with this structure:

```markdown
# /arch bundle — <topic>

## Question
<1-2 sentence question, framed neutrally — NOT a leading question that pre-supposes the answer>

## Canonical docs read (in full)
- `docs/design/model/knode.md` — <1-line summary of relevant content>
- `docs/architecture.md` — <1-line summary>
- `vendor/silvery/docs/guide/styling.md` — <1-line summary>
- (5+ entries minimum if topic is non-trivial)

## Close-reasons (verbatim)
### @km/<scope>/<slug> — closed YYYY-MM-DD
> <verbatim close-reason quote>

(3+ entries minimum)

## Current code state (cited)
- `packages/km-beads/src/migrate.ts:42-58` — bdIdToPathForm produces `@km/<scope>/<slug>`
- `packages/km-storage/src/schema.ts:12-30` — SQLite primary key is currently `<value>`
- (cite the lines, not just the file)

## Hypotheses (lead's pre-arch framing — NOT decisions)
1. <option A>
2. <option B>
3. <option C — including "do nothing">

## Excluded / not-authority
- `hub/km/design/tribe-matrix.md` — draft, deliberately excluded.
```

**The bundle is the deliverable of Phase 1.** Spend 30-90 minutes on it. If it takes <15 min, you're skimming — read more.

### 1d. Self-check before Phase 2

Did Phase 1 actually surface anything you didn't already believe? If your hypothesis list (Phase 1c, "Hypotheses") looks identical to the framing you walked in with — Phase 1 was performative. Read more docs, more close-reasons, until at least one hypothesis surprised you.

---

## Phase 2 — Arch agent invocation

Spawn the `arch` sub-agent with the curated bundle. The agent's job is to OPINE on the bundle, not re-discover.

```typescript
Agent({
  subagent_type: "arch",
  description: "Opine on <topic> bundle",
  prompt: `Read /tmp/arch-<topic>.md in full. The bundle was assembled by the lead per /arch Phase 1.

Your task is to OPINE — not re-discover. The bundle's canonical docs and close-reasons ARE the inputs. Do not re-grep for "what's true today" in the source code as your primary mode; treat the bundle's "Current code state" section as authoritative for that.

Required output (sections in this order):

## 1. Direct quotes from canonical docs (5+ minimum, with file:line)
Quote 5+ load-bearing passages from the canonical docs in the bundle. Use file:line citations. Do NOT paraphrase — quote.

## 2. Direct quotes from close-reasons (3+ minimum, verbatim)
Quote 3+ close-reasons verbatim. These are the design record for prior decisions. Highlight any that bear directly on the question.

## 3. Reconciliation of contradictions
If any canonical doc contradicts another, or a close-reason reverses a doc, NAME the contradiction explicitly. Recommend which authority wins and why.

## 4. Recommendation
- Which hypothesis (from the bundle's Phase 1c list) is best supported by the evidence?
- What is the rough effort estimate (hours/days, not "it's complex")?
- What is NOT being asked but probably should be (out-of-bundle issues that surface during reading)?

## 5. Confidence level
HIGH / MEDIUM / LOW with one-line justification. If LOW, name what additional evidence would lift it.

Do NOT propose phases or write a plan. Do NOT spawn sub-agents. Do NOT modify code. Output only the opinion.`,
})
```

**Verification gate**: when the agent returns, **before accepting the report**, scan it for:

- [ ] 5+ direct quotes from canonical docs, each with `file:line` citation
- [ ] 3+ close-reason verbatim quotes
- [ ] At least one contradiction or surprise (if there are zero, the agent likely skimmed)
- [ ] Cited only canonical docs from the bundle — not `hub/<project>/design/*` as authority
- [ ] No phantom file paths (open the cited paths to confirm they exist; agent may hallucinate file:line)

If any gate fails: re-spawn with corrective instructions, OR escalate to user. **Never accept a finding "X is canonical" without a docs file citation** — see `feedback-verify-agent-investigation-scope.md`.

---

## Phase 3 — Mandatory retro (lead, post-arch)

After the arch agent's report, write a retro to `.claude/arch-decisions/YYYY-MM-DD-<topic-slug>.md`. **This is not optional.** Without the retro, Phase 4 cannot pass and `/max` stays blocked.

Retro template:

```markdown
---
topic: "<topic>"
date: 2026-04-30
session: <session-id-if-known>
arch_agent_report: "<one-line summary of the recommendation>"
verdict: "ADOPTED / REJECTED / DEFERRED / REVERSAL"
---

# Arch retro — <topic>

## Bundle path
`/tmp/arch-<topic>.md` (copy below if /tmp may be cleared)

## Canonical docs the lead actually read (line numbers)
- `docs/design/model/knode.md:1-180` — read in full
- `docs/principles.md:42-110` — relevant section
- (5+ entries; line numbers prove you read, not just listed)

## Close-reasons the lead actually read (verbatim)
- `@km/<scope>/<slug>` — closed YYYY-MM-DD: "<verbatim>"
- (3+ entries)

## Contradictions found
- <contradiction A>: doc X says foo, close-reason Y says bar. Resolution: <which wins, why>.
- (or "None")

## Reversal check
**Does this verdict REVERSE prior framing in this session, this week, or any cited bead?**
- [ ] No reversal
- [ ] REVERSAL FROM PRIOR FRAMING — diff:
  - Prior framing said: <quote the prior plan/bead/message>
  - New verdict says: <new framing>
  - Why the reversal is justified: <evidence>

## Verdict
<ADOPTED — proceed to /max with this design>
<REJECTED — close the line of inquiry, file follow-up bead if needed>
<DEFERRED — needs more evidence; what evidence?>

## Effort estimate (verified, not from agent's report)
<hours/days, with file count + risk class>

## Beads to file before /max can run
- `@km/<scope>/<slug>` — <title> (P<n>)
- (only file beads when the design is settled, not before)
```

**Save the retro file BEFORE invoking `/max`.** The drift-checker reads `.claude/arch-decisions/` to verify a recent retro covers the changed paths.

---

## Phase 4 — Gating

`/max` runs `bun tools/check-arch-required.ts` in its Step 0. The script:

1. Reads staged + unstaged paths from `git status --porcelain`.
2. Matches against the trigger globs (identity/storage/persistence/loader/public-API).
3. If any match: looks for a `.claude/arch-decisions/*.md` retro within the last 7 days whose body references the matching paths or a covering topic.
4. If no match found: prints a blocking error and exits 1, naming the missing topics. `/max` aborts.

**To unblock**: run `/arch <topic>` for the missing topic, write the retro, then re-run `/max`.

The drift-checker is the enforcement. The skill instructs; the script gates.

See [tools/check-arch-required.ts](../../tools/check-arch-required.ts) for the implementation.

---

## Anti-Patterns

| Don't | Why |
|---|---|
| Skip Phase 1 and let the arch agent discover for itself | The whole point is the lead reading the canonical material — agent grep ≠ architectural intent. (See `feedback-verify-agent-investigation-scope.md`.) |
| Cite `hub/<project>/design/*.md` as authority in Phase 1 | `hub/` is draft territory. Per-doc vetting required; default to "not authority." (See `feedback-hub-docs-are-drafts-not-canonical.md`.) |
| Treat user iteration on a bead body as plan approval | User refinements are discovery probes, not approval. Plan approval requires the explicit `/arch` retro. |
| Run `/max` on identity/storage changes without a retro | The drift-checker blocks it; if you bypass the checker, you're back to the 2026-04-30 failure mode. |
| Write the retro AFTER `/max` | Order matters: discovery → opinion → retro → execution. Post-hoc retros rationalize, they don't decide. |
| Have the arch agent re-grep what the bundle already states | Wastes tokens, dilutes the opinion. The bundle IS the input. |
| Accept the arch agent's report without checking for 5+ doc quotes | "5+ minimum" is the gate. If the agent didn't quote, the agent didn't read. |
| File acceptance beads before the retro is written | Beads commit to a design. The retro IS the design moment. |

---

## Acceptance for `/arch <topic>`

A run is complete when:

1. `/tmp/arch-<topic>.md` (Phase 1 bundle) exists and has 5+ canonical doc entries + 3+ close-reasons.
2. The arch agent returned a Phase 2 report with all 5 sections + 5+ doc quotes + 3+ close-reason quotes.
3. `.claude/arch-decisions/YYYY-MM-DD-<topic-slug>.md` exists with verdict + reversal check + line-numbered "actually read" entries.
4. `bun tools/check-arch-required.ts` returns exit 0 for the changed paths.

If all four pass: `/max` is unblocked for the topic.

---

## Pairs with

- **`/big`** — meta-protocol for reframing 10-20 hypotheses. Run `/big` BEFORE `/arch` if the topic is "should this problem exist at all?". Run `/arch` AFTER `/big` to commit to the chosen framing with canonical-doc evidence.
- **`/csw`** — Complete Staff Work for option-comparison + recommendation. Useful in Phase 1c when ≥3 hypotheses need rigorous scoring before the arch agent opines.
- **`/max`** — execution skill. Step 0 calls the drift-checker; if `/arch` is required but missing, `/max` aborts.
- **`/complete`** — post-execution audit. Reads `.claude/arch-decisions/<topic>.md` to verify the change matches the verdict.

## References

- Origin bead: `@km/all/architectural-decision-skill` (P1)
- Memory: `feedback-architectural-decisions-need-big-before-max.md`
- Memory: `feedback-verify-agent-investigation-scope.md`
- Memory: `feedback-hub-docs-are-drafts-not-canonical.md`
- Origin session: 2026-04-30 (bead-domain-interface plateau push)
