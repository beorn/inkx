# vendor/internal/RESOLVER — where does internal content go?

**Read this before creating drafts, launch copy, research, or design docs that aren't ready for the public.** Walk top to bottom, stop at first match. Inspired by the gbrain pattern in `~vault/RESOLVER.md`.

`vendor/internal/` is **the private workspace** for the km + silvery ecosystem. Anything here is pre-public: drafts, WIP, research, launch marketing, retro analysis. The public face lives in each package's own `docs/` (published to `<pkg>.dev`) — never from `vendor/internal/`.

For routing within km's public `docs/`, see [`../../docs/RESOLVER.md`](../../docs/RESOLVER.md). For cognitive routing (skill/knowledge/memory/canonical), see [`../../RESOLVER.md`](../../RESOLVER.md).

---

## § 1 — Is it public or internal?

| Question | Answer → Route |
|---|---|
| Is it the shipped doc on `<pkg>.dev`? | → `vendor/<pkg>/docs/` |
| Is it km's canonical architecture/design? | → `docs/` in the km repo |
| Is it a draft, research note, launch copy, or internal roadmap? | → `vendor/internal/` (this file routes inside) |
| Is it frozen pre-public or a superseded draft? | → `vendor/internal/<pkg>/archive/` or (if tied to a shipping doc) the public `archive/` |

**Rule:** public docs must never reference `vendor/internal/` content. Internal docs may reference anything (public, internal, or cross-repo).

---

## § 2 — Which slot inside `vendor/internal/`?

Content is routed two ways:

1. **Package-specific** → `vendor/internal/<pkg>/`
2. **Ecosystem-wide** (spans multiple packages or sites) → `vendor/internal/market/` or a named cross-package subdir

### § 2.1 — Per-package slots

Each package's internal workspace (`vendor/internal/<pkg>/`) uses this sub-layout when content justifies:

| Subdir | Content |
|---|---|
| `design/` | Pre-public architecture, design drafts under iteration. Promote to `vendor/<pkg>/docs/` when polished. |
| `research/` | Competitive analysis, prior-art surveys, market intel specific to this package. |
| `launch/` | Pre-launch blog drafts, marketing copy, positioning docs for this package. |
| `reference/` | Internal reference material — benchmarks, specs not ready for public ref docs. |
| `benchmarks/` | Perf numbers, profiling artifacts. |
| `mockups/` | Design mockups (ANSI art, screenshots in progress). |
| `prototype/` | Working prototypes validating design ideas. Disposable. |
| `vision/` | Long-horizon vision docs for the package. |
| `horizons.md` | Version roadmap (v0.5 / v1.0 / v1.5 / etc). |
| `CLAUDE.md` | Internal workspace guide for agents. |
| `README.md` | Internal workspace entry point. |
| `archive/` | Frozen drafts and retired internal docs. |

**Don't pre-create empty subdirs.** Only add a subdir when content justifies. Today: silvery has the full layout; km/bearly/loggily have a subset; flexily/termless/mdspec have none yet.

### § 2.2 — Ecosystem-wide slots

| Dir | Content |
|---|---|
| `vendor/internal/market/` | Cross-package marketing: content strategy, growth ideas, funnel architecture, brainstorms that apply to multiple sites |
| `vendor/internal/<cross-theme>/` | Create ad-hoc when a cross-cutting theme doesn't fit a single package (e.g. `vendor/internal/ecosystem-research/` if it ever exists) |

**Naming rule:** package-named subdirs are for a single package's workspace. Cross-package content goes in named concern-subdirs (`market/`, etc.).

---

## § 3 — Routing decision table

| Content | Home |
|---|---|
| Pre-public silvery design doc | `vendor/internal/silvery/design/` |
| Silvery launch blog draft | `vendor/internal/silvery/launch/` |
| Silvery competitive research (OpenTUI, Ink, etc.) | `vendor/internal/silvery/research/` |
| Silvery version roadmap | `vendor/internal/silvery/horizons.md` |
| km pre-public design draft | `vendor/internal/km/` |
| bearly plugin design | `vendor/internal/bearly/design/` |
| bearly agent memory/context | `vendor/internal/bearly/memory.md` |
| loggily API v2 research | `vendor/internal/loggily/` |
| Cross-ecosystem content marketing | `vendor/internal/market/` |
| Ecosystem growth strategy | `vendor/internal/market/` |
| Retro / post-shipped analysis of a silvery feature | `vendor/internal/silvery/archive/` (internal-only lessons) |

---

## § 4 — Public/internal boundary rules

(Also stated in `vendor/CLAUDE.md`.)

- **`vendor/<pkg>/docs/` MAY NOT reference `vendor/internal/...` paths.** When silvery.dev ships, it can't link to workspace drafts.
- **`vendor/internal/*` MAY reference anything** — public docs, other internal workspaces, GitHub URLs to the public silvery-internal repo.
- **km's `docs/` MAY NOT reference `vendor/internal/`.** If km docs describe silvery-internal design, the reference must be a GitHub URL to silvery-internal's public repo.
- **Promotion requires approval.** Moving from `vendor/internal/*/` to public is a deliberate act with editorial review. Don't auto-promote.
- **Demotion is cheap.** If a public doc drops below quality bar, move it back to internal and fix it there.

---

## § 5 — Fallback: `vendor/internal/<pkg>/draft/`

If you walk § 2 and nothing fits: park the draft in `vendor/internal/<pkg>/draft/` (or `vendor/internal/market/draft/` for ecosystem-wide) and flag the resolver gap. When you surface it, propose the rule.

`draft/` should stay small. Growing drafts means the resolver is incomplete.

---

## § 6 — Corrections (the resolver grows with use)

- **2026-04-17** — Ecosystem marketing content (applies to multiple packages) goes to `vendor/internal/market/`, not a single package's `launch/`. → § 2.2
- **2026-04-17** — `vendor/internal/market/km-ecosystem-content-strategy.md` (km repo, ecosystem marketing) should have been in `vendor/internal/market/` from the start. Corrected. → § 1
- **2026-04-17** — Silvery's private design workspace is a public repo (`beorn/silvery-internal`) mounted as a submodule at `vendor/internal/silvery/`. Its "private" means "not served on silvery.dev" — not "secret." Cross-repo refs should use GitHub URLs when km needs to link in. → § 4

---

## § 7 — Related documents

- [`../../RESOLVER.md`](../../RESOLVER.md) — repo-root cognitive routing
- [`../../docs/RESOLVER.md`](../../docs/RESOLVER.md) — km public-docs filing
- [`../CLAUDE.md`](../CLAUDE.md) — vendor boundary rule (package independence)
- [`silvery/CLAUDE.md`](silvery/CLAUDE.md) — silvery-internal workspace guide (most mature example of the layout)
