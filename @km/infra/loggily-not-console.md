---
mentions:
  - km
  - Bjørn
id: "@km/infra/loggily-not-console"
aliases:
  - km-infra.loggily-not-console
  - km-infra-loggily-not-console
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:38Z
closed_at: 2026-04-02T22:06:42Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Replace console.log/error/warn with loggily across all packages @km/infra #task #P2 @Bjørn Stabell

Audit all packages for bare console.log/error/warn usage and replace with loggily debug loggers. Console output should only be used for intentional user-facing output (CLI tools), never for debug/diagnostic logging.

