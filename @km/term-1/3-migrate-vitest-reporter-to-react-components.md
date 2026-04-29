---
id: "@km/term-1/3-migrate-vitest-reporter-to-react-components"
aliases:
  - km-term-1.3
  - km-term-1-3
  - "@km/term-1/3"
created_at: 2026-01-28T12:47:39Z
closed_at: 2026-01-28T13:04:11Z
---

# [x] Migrate vitest-reporter to React components @km/term-1 #task #P2

Rewrite infra/vitest-reporter.tsx using tui:
- Extract components: Header, Dot, FileRow, Summary, Failures
- Use explicit console patching with patchConsole()
- Render with render(term, element)
- Use renderString() for streaming mode
- Proper Disposable cleanup order