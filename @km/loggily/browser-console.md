---
id: "@km/loggily/browser-console"
aliases:
  - km-loggily.browser-console
  - km-loggily-browser-console
created_by: Bjørn Stabell
created_at: 2026-04-13T01:05:44Z
closed_at: 2026-04-18T19:06:13Z
close_reason: "Fixed via loggily commits 02645025b (failing tests) + 05b1cb7
  (structured sink impl), km bump fa6fa4055. New createBrowserConsoleSink() uses
  %c CSS format specifiers + multi-arg spread; createTerminalConsoleSink() uses
  util.format + ANSI; createConsoleSink() picks runtime. LogEvent/SpanEvent
  gained userArgs: unknown[]. Error first for DevTools stack clickability, then
  merged context+props+data. Tests: 319/319 (311 pre-existing + 8 new). TSC
  baseline unchanged. loggily branch fix/browser-console pushed to origin."
---

# [x] Browser console: %c CSS colors + multi-arg + arrow functions @km/loggily #bug #P0

blocks:: [[@km/loggily]]

Current loggily pre-formats to a single ANSI string and passes it to console.info(text). This breaks in browsers (ANSI garbage) and loses DevTools features (expandable objects, source locations, CSS colors).

Adopt the pattern from the old @beorn/logger (kimmi archive):
- Browser: %c CSS format specifiers for colors, multi-arg spread
- Terminal: ANSI via ansi-styles, multi-arg spread  
- Both: arrow functions (not bind) for source location preservation + console mockability
- Both: pass user args separately so objects stay expandable in DevTools

Reference: https://github.com/beorn/kimmi/blob/c17bfa25/packages/archive/beorn-logger/src/loggerBrowser.ts

Impact: console sink needs to receive structured data (level, namespace, user args) instead of pre-formatted text. Pipeline change.