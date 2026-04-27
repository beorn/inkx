# Venture-evaluation rubric

**Created**: 2026-04-27 · **Last revised**: 2026-04-27

A small system for scoring product / business opportunities. Five dimensions, 1-5 each, max 25. Plus a kill-flag for fatal weaknesses that average away in a sum.

The point isn't the precision of the number; it's that scoring 10 ideas side-by-side surfaces the cluster of "obviously top-3" and the cluster of "obviously skip." The middle tier is where you debate.

## The five dimensions

| Dim | Question | 1 (avoid) | 5 (strong) |
|---|---|---|---|
| **Real** | Is the demand validated? Is a workable product feasible with current tech? | No evidence anyone wants this; speculative tech | Multiple users asking; tech proven; reference deployments exist |
| **Win** | Can WE specifically win this? What's our unfair advantage? | Big incumbents own the space; we have no edge | We have a unique vantage (proxy position, dataset, distribution, brand) |
| **Worth** | TAM × margin × strategic value. Is the prize big enough to justify focus? | Niche; low margin; or doesn't move our strategy | Large TAM; high margin; or load-bearing for our broader story |
| **Wedge** | First-customer beachhead viability + time-to-MVP. Can we ship something in weeks, not quarters? | Months/quarters of foundational work before any user sees value | Shippable in days; existing infra covers most of it |
| **Moat** | Defensibility once shipped: network effects, data flywheel, switching cost, infrastructure lock-in | Anyone can build this in a weekend; commodity | Network/data/switching-cost makes the second-comer's life hard |

## Score bands

- **20-25** — ship now. Top conviction. Don't let it sit.
- **15-19** — serious candidate. Validate one assumption before committing real time.
- **10-14** — bookmark. Worth a sketch when adjacent work surfaces.
- **<10** — skip. Don't even bookmark.

## Kill-flags

Any of the following voids the score regardless of total:

- **Real = 1** — no demand evidence. Don't build for hypothetical customers.
- **Wedge = 1 AND Worth ≤ 3** — too long a road for a medium prize.
- **Violates upstream ToS** — e.g., Anthropic's "no spoofing as official client" rule.
- **GTM mismatch** — requires a sales motion we don't have (e.g., enterprise compliance) and the team has no plan to acquire one.
- **Already commoditized** — "we'd be the 8th OpenRouter" is not a venture; it's a graveyard.

## Triangulation

A score is one read. Triangulation is what makes the rubric a system, not just a checklist. For each entry, ask:

1. **What would move the score up by 2?** (this is the validation experiment)
2. **What would drop it by 2?** (this is the risk to monitor)
3. **Who else has an adjacent vantage?** (if someone else has 4/5 Win on this, recheck our Win)

If the answer to #1 is concrete and cheap, the entry is more interesting than its current score suggests — it's an option, not a position. If the answer is "we'd need to talk to 50 enterprise prospects," the entry's Real is overstated.

## Workflow

1. Spawn ventures from a brainstorm doc (e.g., `hub/silvercode/future/ai-terminal/acp-proxy.md` § Categories of opportunity).
2. Score 5-15 in one sitting, side-by-side. Don't score one in isolation; the comparison is what surfaces clusters.
3. Save as `hub/ventures/<topic>-YYYY-MM-DD.md`.
4. Top 3 by score → file as beads with the rubric notes in `--design`.
5. Re-score the doc every 6-12 months — Win and Wedge especially decay with the market.

## File template

```markdown
# Ventures — <topic> — <date>

Source: <link to brainstorm doc>

## Rubric

5 dims × 1-5 = max 25. See `_rubric.md`.

## Scored

| # | Opportunity | Real | Win | Worth | Wedge | Moat | Score | Kill? | What would change it |
|---|-------------|------|-----|-------|-------|------|-------|-------|---------------------|
| 1 | ... | 5 | 4 | 3 | 5 | 2 | 19 | — | +2 if X validates |
| ... |

## Top 3

1. ...
2. ...
3. ...

## Skip

- ...

## Re-score trigger

Re-evaluate when: <market signal that would change scores>.
```
