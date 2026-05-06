---
mentions:
  - beorn
  - km
id: "@km/term-1/2-create-beorn-tui-package"
aliases:
  - km-term-1.2
  - km-term-1-2
  - "@km/term-1/2"
created_at: 2026-01-28T12:47:45Z
closed_at: 2026-01-28T13:04:11Z
---

# [x] Create @beorn/tui package @km/term-1 #task #P2

Evolve inkx into @beorn/tui with:

- render(term, element) signature returning Disposable
- renderString() for static output
- <Console /> component with render function support
- useConsole() hook using useSyncExternalStore
- useTerm() hook for accessing terminal in components
- Automatic style fallback based on term capabilities
- Re-export term for convenience

