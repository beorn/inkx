---
id: "@km/market/vs-opentui"
aliases:
  - km-market.vs-opentui
  - km-market-vs-opentui
created_by: Bjørn Stabell
created_at: 2026-04-15T23:20:31Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-market.vs-opentui
    depends_on_id: km-market
    type: parent-child
    created_at: 2026-04-15T16:22:35Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Ship public silvery-vs-opentui.md comparison page @km/market #task #P2

blocks:: [[@km/market]]

Write the public-facing silvery-vs-opentui comparison, matching silvery-vs-ink.md's depth and tone.

**Source material** (already done):
- Internal deep-dive: vendor/internal/silvery/research/opentui-vs-silvery.md
- Company context: vendor/internal/silvery/research/anomaly-company.md
- Overview: vendor/internal/silvery/research/competitors-overview.md

**Template**:
- vendor/silvery/docs/guide/silvery-vs-ink.md (tone, structure, honesty bar)

**Output**:
- vendor/silvery/docs/guide/silvery-vs-opentui.md

**Must cover**:
- What OpenTUI genuinely wins on (native throughput, Solid reconciler, game-engine scope, sprite/framebuffer/3D)
- Where silvery wins (declarative DX, hook API breadth, canonical components 45+ vs 20, correctness infra SILVERY_STRICT + termless + cross-parser, zero native deps, multi-target roadmap, W3C flexbox)
- Where each loses honestly (silvery: community size, peak raw throughput, framework pluralism; OpenTUI: stability — field report crashes on v0.1.99, declarative ergonomics, testing story)
- Field report: beorn tried OpenTUI before building silvery and hit frequent crashes (adds primary-source credibility vs abstract analysis)
- Decision matrix: when to pick silvery, when to pick OpenTUI

**Follow-ups** (separate beads):
- @km/silvery/vs-opentui-bench (perf benchmark suite to back claims with numbers)
- Public blog post referencing the comparison page once it lands