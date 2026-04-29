---
id: "@km/bearly/llm-images"
aliases:
  - km-bearly.llm-images
  - km-bearly-llm-images
created_by: claude:491faf6c
created_at: 2026-03-25T22:57:08Z
closed_at: 2026-03-25T23:14:00Z
close_reason: "Shipped: --image flag sends Uint8Array to multimodal models via
  Vercel AI SDK. Tested with GPT-4o and GPT-5.4 (both 7/10 on dashboard). Grok-3
  doesn't support images via API. v0.dev Playwright automation deferred to
  separate bead."
---

# [x] bun llm --image: send screenshots to multimodal LLMs + v0.dev visual review @km/bearly #feature #P1 @claude:491faf6c

## Problem
The llm tool only sends text prompts. For visual design review, we need to send actual screenshots. Text descriptions miss rendering bugs — v0.dev (which sees images) caught truncation, data corruption, and color issues that GPT/Grok all missed from text.

## Feature 1: --image flag for API-based models

Send base64-encoded images to multimodal LLMs:

```bash
bun llm --image screenshot.png "Review this UI for design issues"
bun llm --image screenshot.png --model gpt-5.4 "Rate 1-10"
bun llm --image screenshot.png --model gemini-3-pro-preview "Find rendering bugs"
bun llm --image screenshot.png --model grok-3 "Design critique"
```

OpenAI API format:
```json
{"role": "user", "content": [
  {"type": "text", "text": "..."},
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
]}
```

Gemini, Anthropic, and Grok APIs have similar multimodal support. Each provider adapter needs to format the image correctly for its API.

## Feature 2: v0.dev visual review via Playwright

v0.dev (Vercel) uses Claude with vision, tuned for UI critique. It's the best visual reviewer we tested — caught rendering bugs, truncation, alignment issues that other LLMs missed.

Automate via Playwright:
1. Open v0.dev/chat
2. Upload screenshot image
3. Send design review prompt
4. Capture response

```bash
bun llm --image screenshot.png --model v0 "Design review"
```

This is a Playwright-based provider (not API), so it's slower but gets the best results.

## Benchmark results (text-only vs visual)

| Model | Text-only rating | Issues caught | Missed |
|---|---|---|---|
| GPT-5.4 | 4/10 | Space, margins | Truncation, corruption |
| GPT-4o | 4/10 | Space, margins | Truncation, corruption |
| Grok 3 | 4→7/10 | Space, hierarchy, contrast | Truncation, corruption |
| v0.dev (visual) | N/A | ALL — truncation, corruption, color, alignment | None |