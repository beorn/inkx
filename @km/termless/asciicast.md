---
id: "@km/termless/asciicast"
aliases:
  - km-termless.asciicast
  - km-termless-asciicast
created_by: claude:4929065a
created_at: 2026-04-02T06:54:38Z
closed_at: 2026-04-02T07:16:57Z
close_reason: "Implemented: reader, writer, streaming writer, replay,
  bidirectional convert. 38 tests."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] asciicast v2 format: read/write for ecosystem compatibility @km/termless #feature #P3 @claude:4929065a

Read and write asciicast v2 (.cast) files for interop with the asciinema ecosystem.

## asciicast v2 format

JSON-lines: header + events. Simple to implement.

```jsonl
{"version": 2, "width": 80, "height": 24, "timestamp": 1234567890}
[0.5, "o", "$ hello\r\n"]
[1.0, "o", "world\r\n"]
[1.5, "i", "q"]
```

## Write (.cast output)

Any termless session → .cast file:
- termless tape play demo.tape -o demo.cast
- termless record -o session.cast
- Programmatic: recording.toCast()

Captures timestamped output events from terminal.

## Read (.cast input)

Replay .cast files through any backend:
- Load as test fixture (verify app renders correctly from recorded data)
- Cross-terminal replay (same recording, different backends)
- termless tape play session.cast (treat .cast as input format)

## Ecosystem unlocked

With .cast files, termless gets free integration with:
- asciinema-player — web component for interactive playback on docs sites
- asciinema-agg — .cast → GIF/PNG (alternative to our own GIF pipeline)
- svg-term-cli — .cast → animated SVG
- asciinema.org — hosting + sharing

## Integration points

- @km/termless/tape: .tape execution can emit .cast as output format
- @km/mdspec/tape: docs could embed asciinema-player for interactive demos
- terminfo.dev: feature pages could include playable demo recordings
- silvery.dev: component demos as interactive terminal replays