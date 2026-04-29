---
id: "@km/all/fiduciary-verify-claim"
aliases:
  - km-all.fiduciary-verify-claim
  - km-all-fiduciary-verify-claim
created_by: claude:7e9436e8
created_at: 2026-04-21T20:36:02Z
---

# [ ] Fiduciary mode — re-verify numbers/dates against primary source before asserting @km/all #feature #P2

blocks:: [[@km/all]]

# The pattern

vault-2 flagged a pattern of material factual errors during a real ~$200k investment-decision analysis (Anthropic SPV via Protos III, 2026-04-21):

- **Misread screenshot numbers**: card said 2%/5yr mgmt + 4mo post-lockup distribution; assistant wrote 3%/3yr + 9mo. User caught both.
- **Math error on upside**: computed "85% gross gain" from $623B → $800B (actually 28.5% — factor-of-3 error).
- **Flagged normal structure as red flag**: called "investing through upstream partner" a stacked-structure concern; user correctly noted this is implied/normal for secondary SPVs.
- **Hallucinated advisor takes** (@km/_orphan/ambot): confused /recall injection for user paste, wrote fabricated 'Gerd and Shrikant' takes into vault files. Already fixed structurally via phases 1-5 of @km/_orphan/ambot.

## Diagnosis

Common thread across the non-injection errors (A/B/C): assistant confidently produces specific numbers/claims without re-grounding against primary source. For a fiduciary-grade vault whose purpose is supporting financial/legal decisions, this is the wrong error profile. 'Drift from bad short-term memory' rather than 'drift from injection confusion' — adjacent family to @km/_orphan/ambot but different trigger.

## Proposed interventions (design, not approved)

Three candidates, none shipped:

### 1. `verify_claim(source_path, claim_text)` tool

When assistant asserts a specific number/date/percentage attributable to a document, it calls this tool before rendering. Tool returns the exact supporting quote from the source or `null`. Null → assistant self-corrects.

Cost: one extra tool call per numeric assertion. Cheap. Friction low if well-targeted.

### 2. Default posture: quote-then-paraphrase

For numbers/dates/key terms from a just-read PDF/image, emit the exact source line verbatim before paraphrasing. E.g.:

> Source (card line 3): '2% / 5yr mgmt + 20% carry, 4mo post-lockup distribution'
>
> Translating: management fee is 2% annually for 5 years; carried interest 20%; distribution 4 months after lockup expires.

Makes drift visible in the response itself — user sees the source quote, can catch misreads immediately.

### 3. High-stakes mode

Context-aware flag (financial / legal / medical / etc.) that forces re-read of source before any number is emitted. Triggered by directory (vault/projects/+investments/, vault/projects/+legal/) or by frontmatter tag (`high-stakes: true`).

Mode changes behavior:
- No numbers without source re-read in the same turn
- Explicit 'computed from X' attribution on every derived figure
- Math double-check step: show the arithmetic, not just the result
- Default to quote-then-paraphrase (intervention #2)

## Acceptance for the bead (not the implementation)

- [ ] Design document capturing the pattern + the three interventions, with pros/cons + false-positive/friction analysis
- [ ] Decision on which intervention(s) to prototype (may be all three — they compose)
- [ ] Prototype + eval against the four specific errors vault-2 reported (can we catch each one retroactively?)
- [ ] User approval before rollout — this changes assistant behavior visibly

## Scope notes

- Not a km code change — lives in Claude Code config / skills / CLAUDE.md. Belongs in vault's or user-global `~/.claude/` layer, not km repo.
- Complements @km/_orphan/ambot structural gates (injection defense); does not replace them. Different trigger, same family of 'assistant state drifting from ground truth'.
- Low-priority (P2): vault-2 flagged as 'not urgent but worth a bead'. Real-world impact limited while user actively reviews output. Would become urgent if vault moves toward agentic autonomy on financial/legal documents.