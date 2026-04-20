# hub/RESOLVER — where does internal content go?

**Read this before creating drafts, launch copy, research, or design docs that aren't ready for the public.** Walk top to bottom, stop at first match. Inspired by the gbrain pattern in `~vault/RESOLVER.md`.

`hub/` is **the private workspace** for the km + silvery ecosystem. Anything here is pre-public: drafts, WIP, research, launch marketing, retro analysis. The public face lives in each package's own `docs/` (published to `<pkg>.dev`) — never from `hub/`.

For routing within km's public `docs/`, see [`../../docs/RESOLVER.md`](../../docs/RESOLVER.md). For cognitive routing (skill/knowledge/memory/canonical), see [`../../RESOLVER.md`](../../RESOLVER.md).

---

## § 1 — Is it public or internal?

| Question                                                        | Answer → Route                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Is it the shipped doc on `<pkg>.dev`?                           | → `vendor/<pkg>/docs/`                                                                  |
| Is it km's canonical architecture/design?                       | → `docs/` in the km repo                                                                |
| Is it a draft, research note, launch copy, or internal roadmap? | → `hub/` (this file routes inside)                                          |
| Is it frozen pre-public or a superseded draft?                  | → `hub/<pkg>/archive/` or (if tied to a shipping doc) the public `archive/` |

**Rule:** public docs must never reference `hub/` content. Internal docs may reference anything (public, internal, or cross-repo).

---

## § 2 — Which slot inside `hub/`?

Content is routed two ways:

1. **Package-specific** → `hub/<pkg>/`
2. **Ecosystem-wide** (spans multiple packages or sites) → `hub/market/` or a named cross-package subdir

### § 2.1 — Per-package slots

Each package's internal workspace (`hub/<pkg>/`) uses this sub-layout when content justifies:

| Subdir        | Content                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `design/`     | Pre-public architecture, design drafts under iteration. Promote to `vendor/<pkg>/docs/` when polished. |
| `research/`   | Competitive analysis, prior-art surveys, market intel specific to this package.                        |
| `launch/`     | Pre-launch blog drafts, marketing copy, positioning docs for this package.                             |
| `reference/`  | Internal reference material — benchmarks, specs not ready for public ref docs.                         |
| `benchmarks/` | Perf numbers, profiling artifacts.                                                                     |
| `mockups/`    | Design mockups (ANSI art, screenshots in progress).                                                    |
| `prototype/`  | Working prototypes validating design ideas. Disposable.                                                |
| `vision/`     | Long-horizon vision docs for the package.                                                              |
| `CLAUDE.md`   | Internal workspace guide for agents.                                                                   |
| `README.md`   | Internal workspace entry point.                                                                        |
| `archive/`    | Frozen drafts and retired internal docs.                                                               |

**Don't pre-create empty subdirs.** Only add a subdir when content justifies. Today: silvery has the full layout; km/bearly/loggily have a subset; flexily/termless/mdspec have none yet.

### § 2.2 — Ecosystem-wide slots

| Dir                              | Content                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `hub/market/`        | Cross-package marketing: content strategy, growth ideas, funnel architecture, brainstorms that apply to multiple sites               |
| `hub/<cross-theme>/` | Create ad-hoc when a cross-cutting theme doesn't fit a single package (e.g. `hub/ecosystem-research/` if it ever exists) |

**Naming rule:** package-named subdirs are for a single package's workspace. Cross-package content goes in named concern-subdirs (`market/`, etc.).

---

## § 3 — Routing decision table

| Content                                            | Home                                                       |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Pre-public silvery design doc                      | `hub/silvery/design/`                          |
| Silvery launch blog draft                          | `hub/silvery/launch/`                          |
| Silvery competitive research (OpenTUI, Ink, etc.)  | `hub/silvery/research/`                        |
| Silvery version roadmap (horizons)                 | `hub/roadmap.md` § Track 2                     |
| Holistic km roadmap + all track detail             | `hub/roadmap.md`                               |
| Ordered near-term queue (what's next)              | `hub/backlog.md`                               |
| km pre-public design draft                         | `hub/km/`                                      |
| bearly plugin design                               | `hub/bearly/design/`                           |
| bearly agent memory/context                        | `hub/bearly/memory.md`                         |
| loggily API v2 research                            | `hub/loggily/`                                 |
| Cross-ecosystem content marketing system/funnel    | `hub/market/strategy/`                         |
| Ecosystem growth strategy                          | `hub/market/strategy/`                         |
| Content/growth brainstorm lists                    | `hub/market/ideas/`                            |
| Marketing tool reference                           | `hub/market/reference/`                        |
| Per-site blog drafts                               | `hub/market/blogs/<site>/`                     |
| Point-in-time SEO/audit snapshots                  | `hub/market/audits/<YYYY-MM-DD>/`              |
| Retro / post-shipped analysis of a silvery feature | `hub/silvery/archive/` (internal-only lessons) |

---

## § 4 — Public/internal boundary rules

(Also stated in `vendor/CLAUDE.md`.)

- **`vendor/<pkg>/docs/` MAY NOT reference `hub/...` paths.** When silvery.dev ships, it can't link to workspace drafts — they must be standalone-clean for npm/GitHub.
- **No internal content inside a vendor package.** If you catch yourself creating `vendor/<pkg>/internal/`, `vendor/<pkg>/silvery-internal/`, or any private dir inside a published package: **stop**. Move to `hub/<pkg>/`. Published packages must be 100% public-clean so `git clone <pkg>` delivers a shippable tree. (2026-04-17: 5 `silvery-internal/*.md` files were caught and moved.)
- **`hub/*` MAY reference anything** — public docs, other hub subdirs, external URLs.
- **km's `docs/` MAY NOT reference `hub/`.** Public km docs stay shippable; internal-only references live inside `hub/`.
- **Promotion requires approval.** Moving from `hub/*/` to public is a deliberate act with editorial review. Don't auto-promote.
- **Demotion is cheap.** If a public doc drops below quality bar, move it back to internal and fix it there.

---

## § 5 — Fallback: `hub/<pkg>/draft/`

If you walk § 2 and nothing fits: park the draft in `hub/<pkg>/draft/` (create the dir) and flag the resolver gap. For ecosystem-wide misfits, create `hub/market/draft/`. When you surface the draft, propose the rule in § 6.

`draft/` should stay small. Growing drafts means the resolver is incomplete.

---

## § 6 — Corrections (the resolver grows with use)

- **2026-04-17** — Ecosystem marketing content (applies to multiple packages) goes to `hub/market/`, not a single package's `launch/`. → § 2.2
- **2026-04-17** — `hub/market/km-ecosystem-content-strategy.md` (km repo, ecosystem marketing) should have been in `hub/market/strategy/` from the start. Corrected. → § 1
- **2026-04-17** — `vendor/internal/` renamed to `hub/` at repo root. Silvery-internal submodule (`beorn/silvery-internal`, always private) absorbed as plain tracked files under `hub/silvery/`; the separate GitHub repo was deleted. All hub content now rides with km. → § 1 + § 4
- **2026-04-17** — `hub/market/` top-level flattened into `strategy/`, `ideas/`, `reference/` subdirs (was 7 md files mixed in one flat dir). → § 2.2

---

## § 7 — Related documents

- [`../../RESOLVER.md`](../../RESOLVER.md) — repo-root cognitive routing
- [`../../docs/RESOLVER.md`](../../docs/RESOLVER.md) — km public-docs filing
- [`../CLAUDE.md`](../CLAUDE.md) — vendor boundary rule (package independence)
- [`silvery/CLAUDE.md`](silvery/CLAUDE.md) — silvery-internal workspace guide (most mature example of the layout)
