---
id: "@km/bearly/llm-test-coverage"
aliases:
  - km-bearly.llm-test-coverage
  - km-bearly-llm-test-coverage
created_by: Bjørn Stabell
created_at: 2026-04-17T21:52:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.llm-test-coverage
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-17T14:52:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Add direct tests for @bearly/llm (0 tests, 4.8k LOC) @km/bearly #task #P3

blocks:: [[@km/bearly]]

@bearly/llm has 0 dedicated tests despite 4,839 LOC. Tested indirectly through recall+lore mock harness only. Fill gap so the tribe family has consistent test density.

Target: 15-25 tests under vendor/bearly/plugins/llm/tests/ covering queryModel, providers, consensus, dispatch, pricing, mock. All mocked, no live API calls.

Rationale: /big quality-plateau analysis identified this as the concrete code-level gap in the tribe family. Recall has 93/10.7k LOC density; llm should match.