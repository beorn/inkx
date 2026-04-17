# Design Mockups (WIP)

This directory contains **experimental ANSI mockups and generator scripts** for Silvery component showcases and examples.

These are **works-in-progress designs** that may change, be approved, or be discarded. Only when a design is finalized and implemented does a polished PNG screenshot get promoted to `vendor/silvery/docs/public/screenshots/`.

## Contents

| File                        | Purpose                                | Status           |
| --------------------------- | -------------------------------------- | ---------------- |
| `dashboard-mockup.ansi`     | btop-style system monitor dashboard    | ✓ Approved       |
| `components-mockup-v2.ansi` | Component gallery redesign             | In review        |
| `chat-mockup.ansi`          | AI chat interface                      | In review        |
| `*-mockup.txt`              | Plain text versions (markup notes)     | Reference only   |
| `gen-*.ts`                  | Generation scripts (Gemini, GPT, etc.) | Development only |

## Workflow

1. **Design phase**: Create ANSI mockup at exact terminal dimensions
2. **Review phase**: User approves mockup at text level (free iteration)
3. **Implement phase**: Translate approved mockup to React components
4. **Verify phase**: TTY output diff against mockup
5. **Ship phase**: Generate final 2x PNG screenshot → promote to `vendor/silvery/docs/public/screenshots/`

See `.claude/skills/tui/design-loop.md` for the full process.

## Dates & Model Benchmarks

All mockups are generated and reviewed with specific LLM models. The `create.md` skill documents model selection (Gemini 2.5 Pro for drafts, GPT-5.4 Pro for final polish) with dated benchmarks to avoid stale recommendations.

**Current recommendation (as of 2026-03-29):**

- **First draft**: Gemini 2.5 Pro ($0.05/request, ~7/10 quality)
- **Final polish**: GPT-5.4 Pro ($0.80-2/request, exact 135×40 chars)
