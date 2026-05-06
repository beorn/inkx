---
mentions:
  - km
id: "@km/tui/omnibox-sigil-registry"
aliases:
  - km-tui.omnibox-sigil-registry
  - km-tui-omnibox-sigil-registry
created_by: Bjørn Stabell
created_at: 2026-04-19T04:10:04Z
closed_at: 2026-04-19T04:24:53Z
close_reason: "Shipped in parallel /max run. sigil-registry: 20ada24b3
  (parser+projection+ranker → SigilSpec registry, 10 new tests).
  repo-getallnodes: 0b77848f3 (Repo interface widened, type hole closed).
  termless-repair: 4a8ae3279 (dispose ordering, cascade eliminated; individual
  test readiness follow-up orthogonal). 2354 km-tui tests pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-sigil-registry
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T21:10:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Omnibox SigilSpec registry — unify sigil dispatch across parser/projection/ranker @km/tui #feature #P3

blocks:: [[@km/tui]]

Today's +t bug was the 4th omnibox regression in a session. Root cause: sigil dispatch is scattered across parser (strips sigil), projection (post-filters by sigil), ranker (scoring assumes sigil). Every new sigil or change to FTS tokenization must touch 3-4 files that must agree; today's schema 'tokenchars=@#+~' wasn't reflected in the parser/projection handshake.

REFRAME: define one SigilSpec registry per sigil with {tokenchar, fts-predicate, post-filter, display-chrome, default-command}. Parser, projection, ranker all derive from the registry. Adding a sigil = adding a row.

Acceptance:

- SigilSpec type defined in apps/@km/tui/src/state/omnibox-sigil-spec.ts
- Registry covers all 5 sigils (@, #, +, [, ~) + universal fallback
- omnibox-projection.ts reads sigil rules from registry (no more literal 'parsed.sigil === "["' branches)
- All existing omnibox tests pass; 1+ new test adding a mock sigil to prove the pattern works

