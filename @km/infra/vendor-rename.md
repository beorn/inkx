---
mentions:
  - km
id: "@km/infra/vendor-rename"
aliases:
  - km-infra.vendor-rename
  - km-infra-vendor-rename
created_at: 2026-02-04T11:27:38Z
closed_at: 2026-03-04T19:21:48Z
---

# [x] Vendor rename: architecture + naming decision @km/infra #task #P4

Research and rename vendor packages from generic -x suffix names to a cohesive family brand.

## Packages in scope

| Current             | npm name             | Role                                                                      |
| ------------------- | -------------------- | ------------------------------------------------------------------------- |
| beorn-inkx          | @beorn/inkx          | Terminal UI React framework with layout feedback                          |
| beorn-flexx         | @beorn/flexx         | Pure JS flexbox layout engine (Yoga replacement)                          |
| beorn-chalkx        | @beorn/chalkx        | Terminal primitives: styling, detection, I/O                              |
| beorn-vitestx       | vitestx              | Vitest plugin: fuzz testing, AI testing, surfaces (feat/vitestx worktree) |
| beorn-claude-tools  | @beorn/claude-tools  | Claude Code tools: refactoring, LLM, history, TTY                         |
| beorn-logger        | @beorn/logger        | Structured logging with spans                                             |
| beorn-watcher-chaos | @beorn/watcher-chaos | Drop-in chaos file watcher (simulates dropped events)                     |

Adjacent (not in scope but may follow): inkx-ui, mdtest, tap.

## Research: npm name availability

### Unscoped names — almost all taken

**-y adjective pattern** (all TAKEN unscoped):
boxy, flexy, testy, chatty, loggy, wordy, handy, crafty, glitchy, inky, reflex

**-i variants** (mostly TAKEN): boxi, flexi, testi, loggi (TAKEN); chatti (available)

**-r suffix pattern** (mixed):

- AVAILABLE: boxr, tintr, kernr, chaosr, hammr, wacthr
- TAKEN: inkr, flexr, testr, logr, forger, proofr

**Other standalone** (TAKEN): boxer, reflex, stable, seer, eyer, hammer, watchr, bark, howl, den, lair, cub, pup, mutt, growl, jab, hook, bout, herald, crier, barker

**Available standalone**: boxxer, sparring, sparr, cornerman, southpaw, counterpunch, fuzzly, fuzzbox, stablex, logbox, wacthr, hammr, reflexx, re-test, lookr, bawks, flexen, testie, flexxie

### Scoped names — wide open

**@beorn/** (already owned): All sub-names available.

**@stable/** (0 published packages, likely claimable):
All checked sub-names available: core, term, flex, test, log, tools, ui, box, rune, kern, gleam, proof, forge, herald, wyrm, bark, grit, press, weft, tint, sift, ward, jinx, crier, chaos

**Other scopes** (all 0 packages):
@den, @forge, @hearth, @keep, @cairn, @hive, @croft, @bower, @kiln, @anvil, @flint, @grove, @hall, @mead, @ward, @hold, @barrow, @byre, @stablejs, @thestable, @stbl, @stabledev

**WARNING**: @stable-dev has 275k packages (Dart/Flutter). @stable scope may be claimed by someone who never published — can only verify by trying `npm org create stable`.

## Naming directions explored

### Direction A: "Glyph family" — Short, punchy, shared vowel

inkx→glyph, flexx→grid, chalkx→tint, vitestx→grit, claude-tools→kit, watcher-chaos→jolt

### Direction B: "Print shop" — Typography metaphor

inkx→press, flexx→kern, chalkx→tint, vitestx→proof, claude-tools→chase, watcher-chaos→smudge
Note: kern for layout and proof for testing have strong metaphor-to-function mapping.

### Direction C: "Norse/OE" — Matches "beorn"

inkx→rune, flexx→weft, chalkx→gleam, vitestx→ward, claude-tools→forge, watcher-chaos→wyrm
Note: Ties to personal brand. beorn = Old English for warrior/bear.

### Direction D: "Mineral" — Stones and elements

inkx→onyx, flexx→mica, chalkx→zinc, vitestx→flint, claude-tools→jade, watcher-chaos→pyrite
Note: Some names clash with existing well-known projects (onyx especially).

### Direction E: "Etch family" — 4-letter verbs/nouns

inkx→etch, flexx→span, chalkx→hue, vitestx→sift, claude-tools→bolt, watcher-chaos→fray

### Direction F: "Music" — Sound and composition

inkx→score, flexx→beat, chalkx→tone, vitestx→riff, claude-tools→amp, watcher-chaos→noise
Note: "riff" for a fuzz tester is particularly apt.

### Direction G: "@stable/*" — Unified scope (LEADING CANDIDATE)

With descriptive sub-names:
inkx→@stable/box, flexx→@stable/flex, chalkx→@stable/term, vitestx→@stable/test, logger→@stable/log, claude-tools→@stable/tools, watcher-chaos→@stable/chaos

"stable" works at multiple levels:

- A stable — where you keep animals. beorn (bear) keeps the stable.
- Stable software — reliable, production-grade.
- A stable of packages — a curated family.
- @stable/chaos — the oxymoron is memorable and fun.

Evocative sub-names were explored but felt forced under a scope (the scope provides the family identity, evocative sub-names add cognitive noise).

### Direction H: "-y adjective family" (standalone)

inkx→boxy, flexx→flexy, chalkx→inky/tinty, vitestx→testy, logger→chatty/loggy, watcher-chaos→glitchy
Note: All taken unscoped. Would need @beorn/ scope.

## Comparison: @beorn/* vs @stable/*

| Dimension      | @beorn/*                               | @stable/*                                  |
| -------------- | -------------------------------------- | ------------------------------------------ |
| Ownership      | Already owned                          | Need to register                           |
| Identity       | Personal brand — "by beorn"            | Project brand — "from the stable"          |
| Semantics      | Publisher prefix (like @sindresorhus/) | Family identity (like @tanstack/)          |
| Tone           | Authorial, individual                  | Curated collection, professional           |
| Scope creep    | Can hold anything                      | Implies cohesive family                    |
| Confusion risk | None                                   | Small risk of "stable version" association |

## Open questions

1. Can @stable npm org be claimed? (Only way to know: try `npm org create stable`)
2. If not, fallback: @beorn/* with clean sub-names, or @stablejs/*?
3. chalkx may merge into inkx's terminal adapter — affects naming scope
4. What about inkx-ui? → likely @stable/ui or @beorn/ui
5. watcher-chaos already well-named — rename or keep?
6. GitHub repo naming: beorn/stable-box or stable org or monorepo?

