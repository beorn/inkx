---
id: "@km/loggily/logtofile-facade"
aliases:
  - km-loggily.logtofile-facade
  - km-loggily-logtofile-facade
created_by: Bjørn Stabell
created_at: 2026-04-11T23:37:13Z
closed_at: 2026-04-12T00:14:00Z
close_reason: "Superseded by km-loggily.api-v2 — becomes { file: path } option
  or withOutput(fileWriter(path), jsonFormat())"
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-loggily.logtofile-facade
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-11T16:37:19Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Porcelain API: logToFile() — one-liner file logging @km/loggily #feature #P2

blocks:: [[@km/loggily]]

Single convenience function combining createFileWriter() + addWriter() with sensible defaults (path, buffer size, rotation). Today developers call createFileWriter() manually; logToFile() should make it one line with zero config.