---
mentions:
  - km
  - claude
id: "@km/termless/compat-matrix"
aliases:
  - km-termless.compat-matrix
  - km-termless-compat-matrix
created_by: claude:8fc35754
created_at: 2026-03-03T08:27:36Z
closed_at: 2026-03-03T08:30:58Z
owner: bjorn@stabell.org
assignee: claude:8fc35754
---

# [x] Cross-terminal conformance matrix: automated compatibility reports @km/termless #feature #P2 @claude:8fc35754

Automated cross-terminal compatibility matrix. Conformance test suite (VT100/ECMA-48) that all backends must pass. Auto-generated markdown reports showing which features are identical across backends and which have known differences. CI regression detection. Upstream contribution potential.

Components:

1. Conformance test suite (partially done: tests/cross-backend.test.ts has 47 tests)
2. Cross-backend invariant matchers (toMatchTerminal)
3. Auto-generated compatibility report (markdown table)
4. CI integration for regression detection
5. Published findings for upstream terminal projects

