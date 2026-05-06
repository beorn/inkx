---
mentions:
  - km
id: "@km/silvery/trilemma-demo"
aliases:
  - km-silvery.trilemma-demo
  - km-silvery-trilemma-demo
created_by: Bjørn Stabell
created_at: 2026-04-02T16:58:13Z
owner: bjorn@stabell.org
---

# [ ] Strengthen trilemma article — build the features it describes @km/silvery #epic #P1

Epic tracking ALL work needed to publish the Terminal Rendering Trilemma blog post. The article is the strongest content candidate (Pro interest: 9/10). Every claim must be backed by working, demonstrable code.

## Article draft

vendor/internal/blogs/silvery/terminal-rendering-trilemma.md

## Critical path

1. Fix inline mode bugs (@km/silvery/inline-bugs) — demo can't look broken
2. Wire selection → clipboard (@km/silvery/selection-clipboard)
3. Build polished AI agent demo in both modes (@km/silvery/trilemma-example)
4. VHS recording (@km/silvery/trilemma-tape)
5. Final article edits + /pro review
6. Publish + launch (X thread, HN, Reddit)

## Related feature beads

- @km/silvery/copy-on-select — full copy-on-select with tmux
- @km/silvery/word-line-select — double/triple click
- @km/silvery/content-search — in-app / search
- @km/silvery/expandable — click-to-expand
- @km/silvery/transcript-mode — less-style review
- @km/silvery/virtual-terminal — full virtual terminal (v1.5)
- @km/silvery/viewport-fill — ScrollbackView fill prop

## Launch plan

- X thread (5-6 tweets + GIF)
- HN submission (editorial, not Show HN)
- Reddit (r/commandline, r/terminal, r/reactjs)
- Tag @bcherny @trq212 respectfully

