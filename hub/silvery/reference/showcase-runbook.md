# Showcase Runbook

Process for maintaining silvery's public-facing examples. Every example in `vendor/silvery/examples/` is a product — it represents silvery to developers evaluating the framework.

## Quality Tiers

| Tier         | Where                                   | Criteria                                                     | Visible on silvery.dev |
| ------------ | --------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| **Showcase** | `examples/`                             | Passes all 4 testing layers, visually impressive, clean code | Yes                    |
| **Internal** | `hub/silvery/all-examples/` | Work in progress, utility, debug tools, broken               | No                     |

There is no B-tier. An example is either showcase-quality or it's internal. The gap between "works" and "impressive" is the whole point.

## Grading Rubric

### Showcase (keep in examples/)

- Runs without crash at 80x24 and 120x40
- Visually impressive — a developer would screenshot it
- Demonstrates a clear silvery feature or pattern
- Follows The Silvery Way (canonical components, semantic $token colors, no hardcoded ANSI)
- Has `meta` export (name, description, features, demo flag)
- Keyboard interaction works (if applicable)
- Code is clean, well-commented, under 200 LOC (components) or 1000 LOC (apps)

### Internal (move to internal/)

- Missing any showcase criterion above
- Debug/development tools (interactive/ underscore-prefixed)
- Benchmarks or stress tests
- Browser-only (web/, playground/)
- Stubs, incomplete, or outdated

## Testing Layers

### Layer 1: Smoke (automated, CI-able)

Does it run? Does it render content?

```bash
# Run each example, verify it starts and produces output
bun examples/apps/aichat/index.tsx --auto --fast
# Exit after 3 seconds, check exit code 0
```

Termless smoke test:

```typescript
using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
await settle()
expect(term.screen.text.trim().length).toBeGreaterThan(0)
expect(term.screen).not.toContainText("Error")
expect(term.screen).not.toContainText("undefined")
```

### Layer 2: Golden Screenshot (automated, CI-able)

Does it look the same as last time?

```bash
# Generate screenshot
bun examples/screenshots/generate.tsx --example apps/aichat --output screenshots/apps-aichat.png

# Compare against golden file (pixel diff)
# Threshold: <1% pixel difference = pass, >1% = review needed
```

Golden files stored in `examples/screenshots/golden/`. Updated intentionally when visuals change.

Sizes to capture:

- 80x24 (minimum viable terminal)
- 120x40 (standard development terminal)

### Layer 3: Silverize Audit

Does it follow The Silvery Way? Run `/silverize <example-file>`.

The `/silverize` skill audits source code against silvery's philosophy and technical standards. It finds Tarnished patterns and shows the Shiny equivalent. Any Tarnished pattern in a showcase example = fix or demote.

Key checks:

- Canonical components (SelectList, TextInput, ListView) vs manual useInput + useState
- Semantic `$token` colors vs hardcoded ANSI codes
- Typography presets (H1, H2, Small, Muted) vs manual bold/dim
- focusScope vs manual focus management
- useTea/createApp for state vs ad-hoc useState trees (apps, not components)
- Theme token flow — no inline color overrides

See: `.claude/skills/silverize/SKILL.md`

### Layer 4: Design Review (LLM-assisted)

Does it look GOOD? Run `/tui review` on the screenshot.

The `/tui review` skill sends 2x screenshots to external LLMs (Grok 4 at 95% detection rate, Gemini at 85%) for structured aesthetic evaluation. It also runs pixel measurements for alignment/spacing.

Three sub-tiers:

- **Tier 0: TTY text scan** — free, instant, catches 100% of overflow/clipping
- **Tier 1: Claude Read (2x)** — free, ~40% of issues
- **Tier 2: Grok 4 review (2x)** — ~$0.03, ~95% of issues

Key: always review at 2x resolution (5.6x more issues detected at 2x vs 1x).

Design intent checklist (from the skill):

- Does a first-time viewer understand what this is in 3 seconds?
- Is the primary action obvious?
- Does it make me want to try it?
- Does it look finished?
- Would I show this to a colleague?

See: `.claude/skills/tui review/SKILL.md`

### Layer 5: Interactive Review (human)

Does it WORK well when you actually use it? This cannot be automated.

- [ ] Keyboard navigation is responsive and intuitive
- [ ] Mouse interaction works (if applicable)
- [ ] Resize doesn't break layout or crash
- [ ] Scroll works naturally (if applicable)
- [ ] Exit is clean (no escape sequence leaks, no hanging process)
- [ ] Edge cases: empty state, very long content, rapid input

### Design → Build → QA Loop

For creating NEW showcase examples or significantly redesigning existing ones:

```
1. DESIGN: Send brief to external LLM (Gemini/GPT) — describe the feature,
   ask for ANSI mockup. LLMs produce good ANSI art designs.

2. BUILD: Implement pixel-perfect from the ANSI mockup using silvery components.
   Run /silverize to verify code quality.

3. QA: Screenshot the running app, run /tui review for LLM aesthetic feedback.
   Compare against the original ANSI mockup.

4. ITERATE: Feed /tui review feedback back into the code. Re-screenshot.
   Repeat until Layer 4 passes.

5. APPROVE: Human interactive review (Layer 5). Generate golden screenshot.
```

This loop replaces relying on human eyes for every iteration. The LLM handles
aesthetic judgment at scale; the human does final interactive verification.

## The Grinder

When running all examples through the quality gate:

### Phase 1: Triage (per example, ~3 min each)

For each example, run 3 automated checks. Classify as PASS/FAIL/FIX.

```bash
# Step 1: Smoke — does it run?
mcp__tty__start(command: ["bun", "examples/<path>"])
mcp__tty__wait(stable: 3000)
mcp__tty__screenshot(outputPath: "/tmp/showcase/<name>-80x24.png")  # 80x24
mcp__tty__stop()

# Step 2: Silverize — is the code Silvery Way compliant?
/silverize examples/<path> --dry-run

# Step 3: Design review — does it look good?
/tui review --quick /tmp/showcase/<name>-80x24.png
# Or full review with Grok 4 for flagship demos:
/tui review /tmp/showcase/<name>-80x24.png
```

Classify:

- **PASS**: smoke OK + silverize clean + design review 7+/10
- **FIX**: smoke OK but silverize or design issues (list specifics)
- **FAIL**: smoke fails, or design review <5/10, or fundamentally broken

### Phase 2: Move (30 min)

Move all FAIL examples to `hub/silvery/all-examples/`. Preserve directory structure.

```bash
# Example: move panes (stub/incomplete) to internal
mkdir -p hub/silvery/all-examples/apps/
mv vendor/silvery/examples/apps/panes/ hub/silvery/all-examples/apps/
```

Update any docs references, example runner, tests.

### Phase 3: Fix (per example)

For each FIX example, create a bead:

```
bd create --id km-silvery.showcase-<name> --type task \
  --title "Fix <name> example for showcase" \
  --description "Issues: <list from triage>"
```

Fix order: highest-impact first (demos that appear on silvery.dev landing page).

### Phase 4: Promote (per example)

When a fixed example passes all 4 testing layers:

1. Move from internal/ back to examples/
2. Generate golden screenshots
3. Add to docs site navigation (if applicable)
4. Update example runner

### Phase 5: Golden Baseline

After all examples are triaged and fixed, generate the golden screenshot baseline:

```bash
bun examples/screenshots/generate.tsx --all --output examples/screenshots/golden/
```

This becomes the CI regression baseline.

## Promotion Workflow (ongoing)

For new examples or returning-from-internal examples:

```
1. Write example in internal/
2. Self-test: run it, screenshot it, use it
3. Submit for review (Layer 3+4)
4. If approved:
   a. Move to examples/
   b. Add meta export
   c. Generate golden screenshots
   d. Add to docs if appropriate
   e. Commit
5. If rejected:
   a. Stay in internal/
   b. Create bead with feedback
   c. Fix and re-submit
```

## Demotion Workflow (ongoing)

When an existing showcase example breaks or degrades:

```
1. CI detects: golden screenshot diff >1%, or smoke test fails
2. Create bead: km-silvery.showcase-<name>-regression
3. If not fixable quickly (< 1 day):
   a. Move to internal/
   b. Remove from docs
   c. Update golden baselines
4. Fix in internal/, promote back when ready
```

## CI Integration

```yaml
# .github/workflows/showcase.yml
showcase-smoke:
  - Run all examples with --fast --auto, verify exit code 0
  - Timeout: 10s per example

showcase-screenshots:
  - Generate screenshots for all examples
  - Compare against golden files
  - Fail if >1% pixel diff on any example
  - Upload diff artifacts for review
```

## Current Inventory

Run the grinder to get current state. As of last audit (2026-04-03):

- 55 total examples across 7 categories
- ~34 likely showcase-quality (components, featured apps, layout, runtime, inline, kitty)
- ~15 need triage (smaller apps, utility, internal)
- ~6 known internal (interactive debug tools, web renderers, playground)

## See Also

- `vendor/silvery/examples/CLAUDE.md` — design principles for examples
- `vendor/silvery/examples/screenshots/generate.tsx` — screenshot generator
- `vendor/silvery/docs/guide/the-silvery-way.md` — quality standards
