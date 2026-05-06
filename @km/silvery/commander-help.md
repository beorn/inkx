---
mentions:
  - silvery
  - km
  - claude
id: "@km/silvery/commander-help"
aliases:
  - km-silvery.commander-help
  - km-silvery-commander-help
created_by: claude:4929065a
created_at: 2026-04-02T07:58:24Z
closed_at: 2026-04-02T08:02:18Z
close_reason: "Fixed: configureHelp formatHelp/padWidth now check cmd === self
  to prevent parent sections leaking into subcommand help. Also migrated all
  addHelpText calls to addHelpSection across termless, terminfo.dev, and
  km-cli."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] @silvery/commander: addHelpSection propagates to subcommands via afterAll @km/silvery #bug #P2 @claude:4929065a

addHelpSection uses addHelpText('afterAll', ...) internally, which propagates help sections from parent commands to all subcommands. This means 'termless backends --help' shows the parent's 'Recording & Playback' section, which is wrong.

## Expected

- addHelpSection should use 'after' by default (command-local)
- Parent sections should NOT appear in subcommand help
- Only sections explicitly added to the subcommand should show

## Current behavior

termless backends --help shows:

1. backends subcommand help (correct)
2. Recording & Playback section from parent (wrong)
3. Backends section from parent (wrong)
4. Examples section from backends (correct)

## Fix

In @silvery/commander src/command.ts, the _installHelpHooks method uses addHelpText('afterAll', ...) to render sections. Change to 'after' so sections are command-local.

May need two modes:

- addHelpSection(title, content) — command-local (default, uses 'after')
- addHelpSection('afterAll', title, content) — propagates to subcommands

## Also

Consider: should addHelpSection auto-prefix the left column entries with '$ ' for example sections? Or leave that to the caller?

