# Venture-evaluation system — architecture

**Created**: 2026-04-27

This is the architecture for a system that does what `_rubric.md` + `acp-proxy-2026-04-27.md` do today by hand. The hand-version is the v0; this doc is the shape it grows into.

The point of the architecture isn't to ship it tomorrow. The point is: when we pick this up again in 2 weeks, the next person (or future-self) doesn't have to re-invent the data model, the layers, or the integration points. The shape is named so the work is composable.

## Design principles

1. **The artifact is the source of truth, not a UI.** Markdown + beads. Anything queryable that's not in those two stores doesn't exist.
2. **Scoring is human-in-the-loop, LLM-assisted.** Never auto-score; always *propose* + human-confirm. LLMs hallucinate confidence intervals.
3. **Decay is a first-class concept.** A venture's score is a function of *when*. Without time-tracking, the system rots.
4. **Comparison > absolute scoring.** A 19/25 means little in isolation; "19 vs the median 14 in this batch" is the actual signal.
5. **Cluster detection is the killer feature, not scoring.** The scoring is the visible part; cluster detection is what turns 10 ideas into 3 products.
6. **Workflow integrates with bd.** Don't invent a parallel issue tracker; ventures graduate to beads when they're real.

## The data model

```
Venture {
  id: km-venture.<slug>           # bead ID; one bead per venture
  title: string                    # human-readable name
  source: URI                      # link to brainstorm doc that birthed it
  created: date

  # Scoring history — append-only time-series
  scores: [
    {
      date: ISO8601
      rubric_version: semver       # (rubric evolves; track which one was used)
      real: 1..5
      win: 1..5
      worth: 1..5
      wedge: 1..5
      moat: 1..5
      total: int                   # = sum
      kill_flag: enum?             # null | "real_eq_1" | "wrong_gtm" | "tos_violation" | "commoditized" | "long_road_small_prize"
      rationale: string            # one sentence per dim
    }
  ]

  # Triangulation
  what_would_change_it: {
    up_2: string                   # the validation experiment
    down_2: string                 # the risk to monitor
  }
  who_else_has_vantage: string?    # competitor / incumbent with similar position

  # Workflow
  status: idea | scored | validating | shipped | killed | superseded
  graduates_to: bead_id?           # bd ID of the project bead it became
  cluster_of: venture_id?          # if part of a multi-venture cluster
}
```

Storage = bd bead with the venture data in `--notes` (frontmatter-style YAML) + `--design` (rubric rationale). One bead per venture under `km-venture.*` scope. Bead status maps directly to venture status.

## Layered architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5 — UI (TUI / web — v2+, not v1)                       │
│   Side-by-side table, score-over-time sparklines,            │
│   cluster overlays                                           │
├─────────────────────────────────────────────────────────────┤
│ Layer 4 — Analytics                                          │
│   rank, decay-check, cluster-detect, triangulate             │
├─────────────────────────────────────────────────────────────┤
│ Layer 3 — CLI (venture <verb>)                               │
│   create, score, promote, search                             │
├─────────────────────────────────────────────────────────────┤
│ Layer 2 — LLM assist (optional, off by default)              │
│   /pro multi-perspective scoring proposal,                   │
│   /llm prior-art check, /deep market research                │
├─────────────────────────────────────────────────────────────┤
│ Layer 1 — Storage (bd beads + hub/ventures/*.md)             │
│   bd is the queryable store; markdown is the human surface   │
└─────────────────────────────────────────────────────────────┘
```

Lower layers ship first; upper layers depend on lower. Each layer is independently useful — you can use Layer 1 alone with no CLI.

## Layer detail

### Layer 1 — storage (already shipped, in markdown)

- **Per-batch markdown doc**: `hub/ventures/<topic>-YYYY-MM-DD.md` — the narrative artifact. One per brainstorm session. This is what humans read.
- **Per-venture bd bead**: `km-venture.<slug>` — structured, queryable. Contains the time-series of scores.
- **Rubric file**: `hub/ventures/_rubric.md` — versioned (header `rubric_version: 1.0.0`). Score entries reference the rubric version they used.

Smallest-shippable Layer 1: keep doing what we did today (markdown only). Add bd backing when the second batch is scored.

### Layer 2 — LLM assist

Three calls, each cheap:

- `venture score --llm <id>` — runs `/pro` with a 4-perspective prompt:
  1. *VC perspective*: what's the TAM, exit, comparable deals?
  2. *Founder perspective*: what's the time-to-MVP, who's customer #1?
  3. *Customer perspective*: would I actually pay for this?
  4. *Competitor perspective*: who else has this vantage?

  Each LLM returns a 5-tuple score + rationale. Median + variance gets surfaced; human accepts or overrides. *Never* auto-write — always propose.

- `venture prior-art <id>` — `/llm` quick search for "is anyone already doing this?" Returns 3-5 closest existing products with one-line differentiation analysis.

- `venture decay-check <id>` — `/deep` (web search) for "has anything changed in the last N months that affects this?" Triggers when a score is older than 6 months.

### Layer 3 — CLI surface

```bash
venture create <slug> --source <url>          # creates km-venture.<slug> bead + stub markdown
venture score <id>                            # interactive prompt: 5 dims + rationale
venture score <id> --llm                      # LLM-assisted (Layer 2)
venture rank [--batch <topic>]                # show top-N by score, with kill-flags
venture rank --since 2026-04                  # decay-aware: highlight scores >6mo old
venture cluster                               # detect ventures sharing infra/wedge/customer
venture triangulate <id>                      # show: prior art + decay-check + adjacent ventures
venture promote <id> --to km-<scope>.<slug>   # graduate to a real project bead
venture search "ACP"                          # bd-search wrapper, scoped to km-venture.*
```

All CLI commands are thin wrappers — they shell out to bd, write markdown, and call /pro etc. No new database. ~500 LOC TS, lives in `tools/venture.ts`.

### Layer 4 — analytics

The interesting queries that can't be answered by `bd list`:

- **rank with decay weight**: `score × max(0, 1 - months_since_scored/6)`. A 19 from 2 years ago shouldn't outrank a 17 from yesterday.
- **cluster detection**: tf-idf over the rationale strings; ventures with high overlap on Wedge/Win/Customer cluster. Heuristic, not ML — keep it simple.
- **score volatility**: ventures whose scores swing >5 points across re-scorings are *interesting* — either we don't understand them or the market is moving fast around them.
- **graduation rate**: of ventures scored 18+, how many shipped within 6 months? This is the meta-metric that tells you the rubric is working.

These are queries against bd; output as markdown tables (or JSON for piping). `bun tools/venture.ts rank` returns a markdown table by default.

### Layer 5 — UI (out of scope for v1)

When the venture set is >50, a TUI helps:
- Side-by-side score grid (cards or columns view from km-tui's vocabulary)
- Sparkline per venture showing score history
- Cluster overlay (visualize which ventures share wedge)
- Filter by source, status, cluster

silvery + km-tui patterns directly apply. If we ever build it, it's a ~2-week project. Don't build until v1 has shipped a year and we know what we want to look at.

## Integration points (what already exists)

| Capability | Provider | Use |
|---|---|---|
| Issue tracking | `bd` (beads) | Storage backend; one bead per venture |
| Search across ventures | `bd search` + `bun recall` | Find ventures by keyword + cross-reference brainstorm docs |
| LLM judgment | `/pro` / `/llm` / `/deep` | Score proposal, prior art, decay check |
| Workflow integration | bd dependencies | A venture promoted to a project bead becomes that bead's parent |
| Maintenance cadence | `/sop` framework | Quarterly re-score reminder; weekly "any unscored brainstorm docs?" check |
| Cross-machine | matrix-shape (future) | Federate venture databases across teams once federation lands |

Nothing on this list needs to be built. The system's value-add is the *layering* — the rubric, the scoring conventions, the analytics — not new infrastructure.

## Phased rollout

### v0 — today (already shipped)

- `hub/ventures/_rubric.md` — the rubric
- `hub/ventures/<topic>-<date>.md` — per-batch worked examples

Zero tooling. Pure markdown discipline.

### v1 — bd-native (1-2 days of work, when second batch happens)

- `km-venture` scope created in bd
- One bead per venture; YAML-frontmatter scores in `--notes`
- Scoring is still manual (markdown-driven) but the structured data lands in bd
- `bd list --parent km-venture` is the rank query

Deliverable: scoring 10 ventures takes ~1 hour and produces both a markdown narrative + 10 queryable beads.

### v2 — CLI wrapper (3-5 days, when we've batched 3+ times)

- `tools/venture.ts` — Layer 3 CLI
- LLM assist for proposed scores (Layer 2)
- Basic `rank` + `cluster` analytics (Layer 4)

Deliverable: `bun venture score <id>` interactive scorer, `bun venture rank` table output.

### v3 — analytics polish (later, demand-driven)

- Decay-weighted ranking
- Score volatility surfacing
- Graduation-rate dashboard

Don't build until 50+ ventures and 12+ months of history exist. Premature analytics is noise.

### v4 — UI (probably never, see Layer 5)

Markdown + bd is genuinely good enough for a single user / small team.

## Open questions

- **Where does the rubric live?** Today: `hub/ventures/_rubric.md`. If we ever extract this as an open-source tool, the rubric is the product. The choice between "internal tool" and "shippable product" is a v3 decision, not a v1 one.
- **Multi-rubric?** Different domains (B2B SaaS vs research project vs consumer app) probably want different rubrics. v1 ships one; v2 supports rubric variants if friction shows up.
- **Team / federation?** Today: solo. If a friend-team starts using this, we want federation (matrix-shape territory). Punt.
- **Confidence intervals?** A score of "4 ± 1" carries more information than "4". Worth ±1 column in the rubric? Adds friction. Defer until v2.

## Self-test — does the system score itself?

Running this rubric on "build the venture-evaluation system as an internal tool":

| Real | Win | Worth | Wedge | Moat | Score | Kill? |
|------|-----|-------|-------|------|-------|-------|
| 4    | 5   | 2     | 5     | 1    | 17    | —     |

- **Real (4)**: We just used it ourselves and got value; demand validated for at-least-N=1.
- **Win (5)**: Trivially — it's our own tool, our own ergonomics.
- **Worth (2)**: Internal tool; doesn't move the strategic story unless we open-source it.
- **Wedge (5)**: Markdown only is shipped; v1 is 2 days; v2 is 5 days. All small.
- **Moat (1)**: There's no moat on a rubric. That's fine — this isn't competitive infra.

Verdict: 17 = "serious candidate, validate one assumption." The validation experiment is *use v0 (markdown) for 2-3 more brainstorm docs and see if the discipline holds before investing in v1*. If the markdown system gets used 3x without nagging, build v1. If it gets used once and abandoned, the system was the wrong tool — kill the bead.

## References

- [`_rubric.md`](_rubric.md) — the scoring rubric
- [`acp-proxy-2026-04-27.md`](acp-proxy-2026-04-27.md) — the first worked example
- [`hub/silvercode/future/ai-terminal/acp-proxy.md`](../silvercode/future/ai-terminal/acp-proxy.md) — the brainstorm doc that birthed the first batch
- [`.claude/skills/sop/`](../../.claude/skills/sop/) — the cadence framework that schedules re-scoring
