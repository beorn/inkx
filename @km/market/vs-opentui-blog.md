---
id: "@km/market/vs-opentui-blog"
aliases:
  - km-market.vs-opentui-blog
  - km-market-vs-opentui-blog
created_by: Bjørn Stabell
created_at: 2026-04-15T23:22:36Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-market.vs-opentui-blog
    depends_on_id: km-market
    type: parent-child
    created_at: 2026-04-15T16:22:36Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-market.vs-opentui-blog
    depends_on_id: km-market.vs-opentui
    type: blocks
    created_at: 2026-04-15T16:22:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-market.vs-opentui-blog
    depends_on_id: km-market.vs-opentui-bench
    type: blocks
    created_at: 2026-04-15T16:22:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Blog post: 'Why we didn't build on OpenTUI' @km/market #task #P3

blocks:: [[@km/market]], [[@km/market/vs-opentui]], [[@km/market/vs-opentui-bench]]

Public blog post referencing the silvery-vs-opentui comparison page. Leans on the field-report framing: 'tried OpenTUI, hit frequent crashes on v0.1.99, built silvery as the pure-TS reliability-first alternative.' Credibility-boosting because it's primary-source rather than abstract analysis.

Blocks on:
- @km/market/vs-opentui (comparison page must exist first)
- @km/market/vs-opentui-bench (numbers to back claims)

Tone: honest, specific, no-FUD. Acknowledge OpenTUI's genuine strengths (native throughput, Solid reconciler, game-engine scope) while making the case for silvery's different bet.