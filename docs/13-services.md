# Services & Connectors

> **Status: Future** — Not yet implemented.

External service integrations for km.

---

## Overview

Services (also called connectors) allow km to sync with external systems like calendars, contacts, and issue trackers.

---

## Planned Connectors

| Connector | Protocol    | Features                |
| --------- | ----------- | ----------------------- |
| Calendar  | CalDAV      | Events, reminders       |
| Contacts  | CardDAV     | People, organizations   |
| Tasks     | CalDAV TODO | External task sync      |
| GitHub    | REST API    | Issues, PRs             |
| Linear    | GraphQL     | Issues, projects        |
| Slack     | REST API    | Messages, notifications |

---

## CalDAV Integration

### Planned Features

- Sync events to/from km nodes
- Map calendar events to task nodes with dates
- Two-way sync with conflict resolution

### Configuration (Future)

```yaml
# .km/config.yaml
connectors:
  caldav:
    url: https://caldav.example.com
    username: user
    password_env: CALDAV_PASSWORD
    calendars:
      - work
      - personal
```

---

## CardDAV Integration

### Planned Features

- Sync contacts as `@person` nodes
- Map contact fields to node metadata
- Link tasks to contacts via `@` references

---

## Design Principles

1. **Offline-first**: km works without network; sync when available
2. **Event-sourced**: All sync operations emit events
3. **Conflict resolution**: Last-writer-wins or manual resolution
4. **Opt-in**: Each connector must be explicitly configured

---

## See Also

- [03-storage.md](03-storage.md) — Events and sync model
- [04-sync.md](04-sync.md) — Filesystem sync patterns
- [12-agents.md](12-agents.md) — Agent connectors
