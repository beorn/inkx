---
mentions:
  - km
id: "@km/silvery/structural-diff"
aliases:
  - km-silvery.structural-diff
  - km-silvery-structural-diff
created_by: Bjørn Stabell
created_at: 2026-04-02T17:14:03Z
owner: bjorn@stabell.org
---

# [ ] Structural diffing in output phase — IL/DL/scroll ops instead of cell-by-cell rewrite @km/silvery #feature #P2

Add structural diffing (IL/DL) to the output phase for mid-buffer line insert/delete operations.

## Research verdict: 'yes, narrowly and conservatively' (GPT 5.4 Pro deep research, $4.81)

Full research: vendor/internal/silvery/research/structural-diffing-research.md

## What to implement (Approach B)

1. DL (Delete Line) — safest, 100x savings for mid-list deletions
2. IL (Insert Line) — 20-30x savings, needs 'make room first' in inline mode
3. Skip SU/SD — dangerous in inline mode (scrolls whole page without DECSTBM)

## Detection algorithm

1. Hash each row (chars + styles + wide-cell markers)
2. Find longest common prefix/suffix between prev/next buffers
3. Check for contiguous insert or delete pattern in the middle
4. Simulate IL/DL on prev buffer, run residual cell diff
5. Choose structural only if total bytes are cheaper

## When it helps

- Insert/delete row mid-list: 20-100x savings
- Fullscreen scroll: 40x savings
- Streaming append at bottom: NO improvement (already optimal)

## Risks

- IL in inline mode can discard bottom row — needs make-room-first strategy
- Background/erase semantics vary (paint inserted rows fully)
- Wide chars at line edges need testing
- Feature flag + runtime kill switch recommended

