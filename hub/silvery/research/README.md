# Silvery competitive research — index

_Internal. Living index for the `research/` folder. Last reviewed 2026-04-20._

Silvery is positioning as a modern, correctness-first TUI framework. This folder is where we track what else is out there — frameworks, agents, companies, market signals — so our positioning stays honest and our bets stay informed.

## How this folder is organized

One high-level map (`competitors-overview.md`), several deep-dive docs per competitor or theme, and a small set of market/company research docs. Deep-dives cite sources inline; the overview doc is the fast-read index that links everything together.

| Doc                                                                  | Kind          | What                                                                      |
| -------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| [`competitors-overview.md`](./competitors-overview.md)               | Overview      | Silvery vs every serious TUI framework at a glance. The map.              |
| [`opentui-opencode.md`](./opentui-opencode.md)                       | Relationship  | OpenTUI ↔ opencode is the same team. Why that matters.                    |
| [`opentui-vs-silvery.md`](./opentui-vs-silvery.md)                   | Deep dive     | Full feature-by-feature comparison, matching `silvery-vs-ink.md` depth.   |
| [`anomaly-company.md`](./anomaly-company.md)                         | Company       | Anomaly (ex-SST) — founders, funding, trajectory, what they're good at.   |
| [`coding-agent-landscape.md`](./coding-agent-landscape.md)           | Market        | Every serious open-source + commercial coding agent, grouped by UI stack. |
| [`svelte-vue-tui-options.md`](./svelte-vue-tui-options.md)           | Framework gap | What a Svelte or Vue team can actually use today.                         |
| [`structural-diffing-research.md`](./structural-diffing-research.md) | Technical     | Reference research on diffing algorithms (prior work).                    |
| [`terminal-rendering-research.md`](./terminal-rendering-research.md) | Technical     | Reference research on terminal rendering (prior work).                    |

Public guide doc (for reference, not internal): [`../../silvery/docs/guide/silvery-vs-ink.md`](../../silvery/docs/guide/silvery-vs-ink.md) — the shippable silvery-vs-ink page; template for tone and depth of comparison docs.

## Update discipline

- **Snapshot-dated.** Every doc leads with a capture date. Re-verify star counts, funding claims, and version numbers before quoting externally.
- **Deep-dives own their sources.** Every substantive claim has a `gh api`, `npm view`, source path, or external URL behind it.
- **The overview is short.** `competitors-overview.md` is the fast-read index. Detail lives in the deep-dives. Don't let the overview grow past a couple of pages.
- **Stale tolerance: ~6 weeks.** The TUI/agent space moves fast. Anything older than 6 weeks should be re-verified before it's used for decisions; older than 3 months should be actively refreshed.
- **When a deep-dive gets old, refresh it in place.** Don't create `opentui-vs-silvery-v2.md`. Update the existing doc and bump the capture date.

## When to use which doc

- **"Where does silvery stand vs. X?"** → `competitors-overview.md` first, then the X-specific deep dive.
- **"Should we build Svelte/Vue/Solid bindings?"** → `svelte-vue-tui-options.md` + `opentui-vs-silvery.md`.
- **"Why does opencode exist, and who are these people?"** → `opentui-opencode.md` + `anomaly-company.md`.
- **"Who are the agents we could realistically migrate or compete with?"** → `coding-agent-landscape.md`.
- **"Writing a public silvery-vs-X page."** → read the deep-dive, then model after `vendor/silvery/docs/guide/silvery-vs-ink.md`.

## Things to keep watching (monitored externally)

- **`anomalyco/opentui`** — releases, feature additions, native binary updates. They're our nearest peer.
- **`anthropics/claude-code`** and **`google-gemini/gemini-cli`** — both on Ink today. Silvery's biggest potential migration targets.
- **Rust agent cohort** — `openai/codex`, `block/goose`, `charmbracelet/crush`. Benchmark claims and framework choices.
- **`badlogic/pi-mono`** — pi-coding-agent and `@mariozechner/pi-tui`. Watch for pi-tui graduating from in-monorepo dep to a standalone TS TUI framework.
- **`charmbracelet/`** — Bubble Tea, Lip Gloss, Glow, VHS, Crush. The Go TUI incumbent.
- **`Aider-AI/aider`** — benchmark methodology. When we eventually ship our own agent-adjacent thing, Aider is the bar for benchmark discipline.
- **Commercial shifts** — Cursor, Windsurf, Zed, Devin. Not direct competitors but they define the market shape agents are pushed into.
