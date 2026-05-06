---
mentions:
  - km
id: "@km/termless/terminfo-probe-coverage"
aliases:
  - km-termless.terminfo-probe-coverage
  - km-termless-terminfo-probe-coverage
created_by: Bjørn Stabell
created_at: 2026-04-06T08:34:27Z
owner: bjorn@stabell.org
---

# [ ] Extend termless to improve terminfo.dev probe coverage (58 partial → automated) @km/termless #task #P2

58 terminfo.dev features have probeStatus=partial — the probe only checks acceptance (sequence consumed) not behavior. Extend termless backends to verify actual behavior where possible.

Categories of partial probes that could be upgraded:

- Shell integration (OSC 133/633 sub-commands): verify markers are stored/queryable
- Clipboard (OSC 52): verify write reaches clipboard API
- Window ops (XTWINOPS 20-23): verify title/icon stack push/pop
- Rectangular area ops (DECFRA, DECERA, DECCRA etc): verify cell contents after operation
- Column editing (SL, SR, DECIC, DECDC): verify cell shift
- Color resets (OSC 113-119): verify color registers reset
- Kitty extensions (OSC 21, 99, 30001/30101): verify color protocol and notifications

Also 9 manual probes (env variable detection) that could potentially be automated via termless process env injection.

3 unprobed features (reflow, paste, ligatures) are fundamentally unprobeable from within a terminal session.

