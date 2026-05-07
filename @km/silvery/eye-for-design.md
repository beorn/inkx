---
mentions:
  - km
  - claude
id: "@km/silvery/eye-for-design"
aliases:
  - km-silvery.eye-for-design
  - km-silvery-eye-for-design
created_by: claude:491faf6c
created_at: 2026-03-25T21:52:31Z
closed_at: 2026-03-25T23:56:02Z
close_reason: Added --local and --multi modes to /design-review skill. Local
  uses ollama vision, multi compares local+cloud findings.
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Eye for Design skill — AI-powered visual design review using multimodal LLMs @km/silvery #feature #P2 @claude:19080504

Create a /design-review (or /eye-for-design) skill that uses multimodal AI to find visual design issues in screenshots.

## Approach

1. **Screenshot capture** — use Playwright to capture the current state
2. **Multi-LLM visual analysis** — send screenshots to visual LLMs for design critique:
- Claude (built-in) — can already see images via Read tool
- Gemini (via /llm skill) — strong visual understanding
- GPT-4o (via /llm skill) — good at UI critique
8. **Pixel-level measurement** — Python/PIL scripts to measure margins, alignment, spacing
9. **Design heuristics** — check against rules:
- Consistent margins/padding (measure all 4 sides)
- Alignment (are elements on the same grid?)
- Contrast (text readable against background?)
- Visual hierarchy (headings larger than body?)
- Whitespace balance (not cramped, not empty)
- Color consistency (semantic tokens used correctly?)

## Usage

\`\`\`
/design-review https://silvery.dev/examples/
/design-review screenshot.png
/design-review vendor/silvery/docs/public/screenshots/
\`\`\`

## Tools to integrate

- Playwright for capture
- PIL/Pillow for pixel measurement
- /llm for Gemini/GPT visual critique
- Built-in Read for Claude multimodal analysis

