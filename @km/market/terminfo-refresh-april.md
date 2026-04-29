---
id: "@km/market/terminfo-refresh-april"
aliases:
  - km-market.terminfo-refresh-april
  - km-market-terminfo-refresh-april
created_by: Bjørn Stabell
created_at: 2026-04-18T05:35:44Z
closed_at: 2026-04-18T05:39:06Z
close_reason: Refreshed probe data for 11 backends via termless + app + mux
  methods. Analysis regenerated, site built, API + badges updated, committed and
  pushed (eda4e39 in terminfo.dev, ab31be0ac in km). Terminal.app, Warp, and GNU
  Screen not refreshed — daemon connect issues or manual start required.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-market.terminfo-refresh-april
    depends_on_id: km-market.terminfo-completeness
    type: parent-child
    created_at: 2026-04-17T22:35:58Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Full terminfo.dev refresh — all probes, analysis, build @km/market #task #P2 @Bjørn Stabell

blocks:: [[@km/market/terminfo-completeness]]

Re-probe all backends (termless, app, server, mux), regenerate analysis commentary, rebuild site, verify 404s. Triggered after vterm feature-gap-implementation landed 100% coverage.