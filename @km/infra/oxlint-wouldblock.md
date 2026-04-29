---
id: "@km/infra/oxlint-wouldblock"
aliases:
  - km-infra.oxlint-wouldblock
  - km-infra-oxlint-wouldblock
created_by: claude:5d8a81be
created_at: 2026-03-13T00:48:42Z
owner: bjorn@stabell.org
---

# [ ] Remove oxlint WouldBlock workaround after upstream fix released @km/infra #task #P3

Upstream fix merged: oxc-project/oxc#20295 (commit 1c07b3bc). Adds ErrorKind::WouldBlock handling to oxlint/oxfmt/oxc_diagnostics. Once released, remove infra/lint.sh wrapper and simplify package.json lint scripts back to direct oxlint calls.