---
id: "@km/bearly/llm-robustness"
aliases:
  - km-bearly.llm-robustness
  - km-bearly-llm-robustness
created_by: claude:19080504
created_at: 2026-03-30T20:11:33Z
---

# [ ] LLM tool robustness: fake providers, failure simulation, comprehensive error tests @km/bearly #task #P3

Make the LLM tool bulletproof against silent failures.

## Immediate fixes (done in this session)
- finishResponse() exits 1 on empty content instead of silently returning
- finalizeOutput() awaits Bun.write() and exits 1 on write failure
- Deep research error path exits 1 when no content recovered
- openai-deep.ts returns explicit error info on incomplete research

## Testing strategy: llm fake provider

Add a fake/mock provider that can simulate all failure modes:

```bash
bun llm --provider fake --fail=empty-response 'test'
bun llm --provider fake --fail=stream-interrupt 'test'
bun llm --provider fake --fail=timeout 'test'
bun llm --provider fake --fail=api-error 'test'
bun llm --provider fake --fail=disk-full 'test'
bun llm --provider fake --fail=partial-stream 'test'
bun llm --provider fake --delay=5000 'test'          # slow response
bun llm --provider fake --tokens=100000 'test'         # large response
```

The fake provider is a local model adapter (like ollama) that returns predictable responses or controlled failures. No API keys needed, no network, fast.

## Test matrix

| Failure mode | Expected behavior | Test |
|---|---|---|
| Empty response from API | stderr error, exit 1 | fake --fail=empty-response |
| Stream interrupts mid-response | Partial content saved, stderr warning, exit 1 | fake --fail=stream-interrupt |
| API returns error | stderr error, exit 1 | fake --fail=api-error |
| Disk full (can't write output) | stderr error, exit 1 | mock Bun.write |
| Network timeout | stderr timeout message, exit 1 | fake --fail=timeout |
| Context file missing | stderr error, exit 1 | --context-file /nonexistent |
| Context file empty | stderr warning (not error) | --context-file /dev/null |
| Deep research incomplete | stderr warning + partial or exit 1 | fake --fail=incomplete-research |
| Response too large for /tmp | stderr error, exit 1 | mock disk space |

## Other robustness ideas

1. **Output verification**: After writing, stat the file and compare expected vs actual size. Report discrepancy.
2. **Watchdog timer**: If no tokens received for 5+ minutes, abort and report timeout (don't hang forever).
3. **Structured error JSON**: In addition to stderr, write a JSON error file at the output path so callers can parse failures programmatically.
4. **Retry with backoff**: For transient API errors (429, 503), retry 2-3 times with exponential backoff before giving up.
5. **Health check command**: `bun llm --health` — test all configured providers return a response.
6. **Cost guard**: `--max-cost 10` — abort if estimated cost exceeds threshold (prevent runaway deep research).
7. **Partial output recovery**: On any failure after streaming has started, always write what we have to a .partial file.

## Implementation order

1. Add fake provider (tools/lib/llm/fake.ts)
2. Write vitest tests against fake provider
3. Add watchdog timer
4. Add output verification (stat after write)
5. Add --health command
6. Add retry with backoff for transient errors