---
id: "@km/silvery/kill-theme-detect-package"
aliases:
  - km-silvery.kill-theme-detect-package
  - km-silvery-kill-theme-detect-package
created_by: claude:4274df30
created_at: 2026-04-20T21:13:16Z
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.kill-theme-detect-package
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:14:48Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.kill-theme-detect-package
    depends_on_id: km-silvery.publishconfig-exports-fix
    type: blocks
    created_at: 2026-04-20T14:13:16Z
    created_by: claude:4274df30
    metadata: "{}"
---

# [/] Kill @silvery/theme-detect; move OSC probe to @silvery/ansi, scheme fingerprint to @silvery/theme @km/silvery #task #P2 @claude:a1a0e667

blocks:: [[@km/all/sterling]], [[@km/silvery/publishconfig-exports-fix]]

The @silvery/theme-detect package shouldn't exist as standalone. Its name conflates two concerns and its content splits cleanly into existing packages.

WHY KILL IT
- 'theme detect' is misnamed — it detects a color SCHEME (raw OSC probe + 84-catalog fingerprint), not a Theme (Sterling token tree)
- Standalone framework-agnostic framing was aspirational; zero external consumers (downloads = '—' per npm-packages.md)
- After splitting, the standalone package is just glue: detectScheme(term, catalog) = fingerprint(probe(term)) — not a package, a one-liner

THE SPLIT

Move to @silvery/ansi:
- OSC 4/10/11 probe primitives — probe colors from terminal via escape sequences
- Lives next to other ANSI capability probes (kitty-keyboard, DA1)
- Pure terminal primitive, returns { bg, fg, palette[] }

Move to @silvery/theme:
- Catalog fingerprinting — match probed colors to the 84-scheme catalog
- Top-level export: detectScheme(term, catalog?) = fingerprint(probe(term))
- Optionally: detectTheme(term, catalog?) wraps detectScheme and runs Sterling deriveFromScheme

DEPRECATE @silvery/theme-detect:
- Cannot unpublish 0.19.0 (already on npm)
- Mark @silvery/theme-detect@0.19.0 as deprecated on npm with message: 'Moved: OSC probe → @silvery/ansi, scheme fingerprint → @silvery/theme'
- Add to npm-packages.md as Deprecated section
- DO NOT publish 0.19.1 of theme-detect

CONSUMERS TO UPDATE
- apps/@km/tui/src/theme.ts imports { detectTheme } from '@silvery/ag-react' — re-export chain ultimately hits theme-detect. Re-route through @silvery/theme.
- vendor/silvery/src/theme.ts barrel re-exports detectTheme — re-route the source.
- vendor/silvery/CLAUDE.md mentions @silvery/theme-detect — update.
- vendor/silvery/docs/* may mention it — audit.
- .claude/skills/release/npm-packages.md — move from Active to Deprecated section.

ORDER
1. Land 0.19.1 republish first (@km/silvery/publishconfig-exports-fix). DO NOT publish theme-detect 0.19.1.
2. In a follow-up release (0.20.0 or 0.19.2):
   - Add probeColors to @silvery/ansi
   - Add detectScheme + detectTheme to @silvery/theme
   - Update silvery barrel + @km/tui to import from new locations
   - Delete vendor/silvery/packages/theme-detect/ workspace package
   - Remove from .github/workflows/release.yml publish list
   - Run 'npm deprecate @silvery/theme-detect@0.19.0 "Moved..."'
   - Update npm-packages.md (move to Deprecated)
3. CHANGELOG entry for the consolidation

ACCEPTANCE
- vendor/silvery/packages/theme-detect/ does not exist
- @silvery/theme exports detectScheme + detectTheme
- @silvery/ansi exports probeColors
- npm view @silvery/theme-detect → deprecated message visible
- @km/tui imports detectTheme from @silvery/theme (or via silvery barrel)
- npm-packages.md lists theme-detect under Deprecated section
- 0 grep hits for '@silvery/theme-detect' in vendor/silvery/src + apps/