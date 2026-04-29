---
id: "@km/bearly/llm-local"
aliases:
  - km-bearly.llm-local
  - km-bearly-llm-local
created_by: claude:19080504
created_at: 2026-03-25T23:30:23Z
closed_at: 2026-03-25T23:39:37Z
close_reason: Ollama provider added to /llm (233-line client, streaming, vision
  support). --model ollama:* syntax, list-models subcommand. Updated
  /design-review with tiered local→cloud workflow. Updated /llm skill with local
  model docs. Models still pulling (llava:7b).
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Local + multi-runtime vision models for /llm and /design-review @km/bearly #feature #P2 @claude:19080504

Add local model support (ollama, MLX) and image/vision capabilities to the /llm tool. Enable multi-runtime so users can easily switch between local and cloud models. Support 70B+ quantized models on M5 Max 128GB.

## Requirements
1. **Multi-runtime provider** in llm.ts: ollama, MLX (via API), cloud APIs — same interface
2. **--image flag**: send screenshots to vision models (base64 for cloud, file path for local)
3. **--model ollama:qwen2.5-vl:7b** syntax for local models (runtime:model)
4. **Multi-model review**: run same image through N models, aggregate findings
5. **Update /design-review** skill to use local vision for fast first-pass, cloud for escalation
6. **Pull starter models**: qwen2.5-vl:7b (fast), qwen2.5-vl:32b (quality)

## Architecture
- Provider interface: { name, chat(prompt, images?, options) → stream }
- Ollama provider: REST API at localhost:11434
- MLX provider: mlx_lm serve or custom Python bridge
- Cloud providers: existing (OpenAI, Anthropic, xAI, Google)
- Model syntax: 'ollama:model' | 'mlx:model' | 'gpt-5.4' | 'claude-opus-4-6'

## Design review integration
- /design-review --local: use ollama vision for Phase 3 instead of cloud
- /design-review --multi: run local + cloud, compare findings
- Structured JSON output against 47 heuristics with confidence scores